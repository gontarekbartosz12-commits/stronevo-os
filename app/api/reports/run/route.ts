import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/demo-store';
import { sendEmail } from '@/lib/integrations/email';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';
import {
  Automation,
  AutomationEvent,
  ClientAutomation,
  Contact,
  MonthlyReport,
} from '@/lib/types';
import {
  MonthlyReportPayload,
  buildMonthlyReportPayload,
  formatPln,
  monthRange,
} from '@/lib/wyniki';

// POST /api/reports/run — auto-raport miesięczny (Panel Wyników).
// Cron 1. dnia miesiąca (n8n schedule / cron Coolify): dla każdego klienta
// z aktywnymi wdrożeniami agreguje POPRZEDNI miesiąc z automation_events,
// zapisuje monthly_reports (unique contact+okres → ponowne uruchomienie
// nadpisuje, nie dubluje) i wysyła mail z linkiem do /raport/[id].
// Autoryzacja: Authorization: Bearer <REPORTS_API_TOKEN | NOTIFY_API_TOKEN>.
// Bez tokena w ENV — endpoint otwarty (dev/demo). Body opcjonalne: {"okres":"YYYY-MM"}.

export async function POST(request: NextRequest) {
  const token = process.env.REPORTS_API_TOKEN || process.env.NOTIFY_API_TOKEN;
  if (token) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${token}`) {
      return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 });
    }
  }

  // Domyślnie: poprzedni miesiąc (cron odpala 1. dnia nowego miesiąca)
  let okres = (() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() - 1, 1);
  })();
  try {
    const body = await request.json();
    if (typeof body?.okres === 'string' && /^\d{4}-\d{2}$/.test(body.okres)) {
      const [y, m] = body.okres.split('-').map(Number);
      okres = new Date(y, m - 1, 1);
    }
  } catch {
    // brak body = domyślny okres
  }

  try {
    const result = await runMonthlyReports(okres);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Błąd generowania raportów' },
      { status: 500 }
    );
  }
}

interface RunResult {
  okres: string;
  wygenerowane: number;
  wyslane: number;
  raporty: { contact_id: string; firma: string; report_id: string; mail: string }[];
}

async function runMonthlyReports(okres: Date): Promise<RunResult> {
  const { from, to } = monthRange(okres);
  const okresIso = `${okres.getFullYear()}-${String(okres.getMonth() + 1).padStart(2, '0')}-01`;
  const demo = !isSupabaseConfigured();

  let contacts: Contact[];
  let cas: ClientAutomation[];
  let automations: Automation[];
  let events: AutomationEvent[];

  if (demo) {
    contacts = demoStore.listContacts().filter((c) => c.typ === 'klient' && !c.owner_contact_id);
    cas = demoStore.listClientAutomations();
    automations = demoStore.listAutomations();
    events = demoStore.listAutomationEvents({ from, to });
  } else {
    if (!isAdminConfigured()) {
      throw new Error('Brak SUPABASE_SERVICE_ROLE_KEY — cron raportów wymaga service role.');
    }
    const supabase = createAdminClient();
    const [c, ca, a, ev] = await Promise.all([
      supabase.from('contacts').select('*').eq('typ', 'klient').is('owner_contact_id', null),
      supabase.from('client_automations').select('*'),
      supabase.from('automations_catalog').select('*'),
      supabase
        .from('automation_events')
        .select('*')
        .gte('created_at', from.toISOString())
        .lt('created_at', to.toISOString()),
    ]);
    contacts = (c.data ?? []) as Contact[];
    cas = (ca.data ?? []) as ClientAutomation[];
    automations = (a.data ?? []) as Automation[];
    events = (ev.data ?? []) as AutomationEvent[];
  }

  const appUrl = (process.env.APP_URL ?? 'https://crm.stronevo.pl').replace(/\/$/, '');
  const result: RunResult = { okres: okresIso, wygenerowane: 0, wyslane: 0, raporty: [] };

  for (const contact of contacts) {
    const own = cas
      .filter((ca) => ca.contact_id === contact.id && ca.status === 'active')
      .map((ca) => ({
        ca,
        nazwa: automations.find((a) => a.id === ca.automation_id)?.nazwa ?? 'Automatyzacja',
      }));
    if (own.length === 0) continue;

    const monthEvents = events.filter((e) => e.contact_id === contact.id);
    const payload = buildMonthlyReportPayload(contact, own, monthEvents, okres);

    let report: MonthlyReport;
    if (demo) {
      report = demoStore.upsertMonthlyReport(contact.id, okresIso, payload);
    } else {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from('monthly_reports')
        .upsert(
          { contact_id: contact.id, okres: okresIso, payload },
          { onConflict: 'contact_id,okres' }
        )
        .select('*')
        .single();
      if (error) throw new Error(`Zapis raportu (${contact.id}): ${error.message}`);
      report = data as MonthlyReport;
    }
    result.wygenerowane++;

    // Mail z podsumowaniem + linkiem (istniejący kanał: webhook n8n → SMTP LH,
    // nadawca kontakt@stronevo.pl). Bez EMAIL_WEBHOOK_URL = honest-mock.
    let mailStatus = 'pominięty (brak e-maila klienta)';
    if (contact.email) {
      const sent = await sendEmail({
        to: contact.email,
        subject: `Twoje wyniki za ${payload.okres_label} — STRONEVO`,
        html: reportEmailHtml(payload, `${appUrl}/raport/${report.id}`),
      });
      mailStatus = sent.source === 'live' && sent.data.sent ? 'wysłany' : 'mock (brak EMAIL_WEBHOOK_URL)';
      if (sent.source === 'live' && sent.data.sent) {
        result.wyslane++;
        const wyslanyAt = new Date().toISOString();
        if (demo) {
          demoStore.updateMonthlyReport(report.id, { wyslany_at: wyslanyAt });
        } else {
          const supabase = createAdminClient();
          await supabase
            .from('monthly_reports')
            .update({ wyslany_at: wyslanyAt })
            .eq('id', report.id);
        }
      }
    }

    result.raporty.push({
      contact_id: contact.id,
      firma: contact.firma ?? contact.imie,
      report_id: report.id,
      mail: mailStatus,
    });
  }

  return result;
}

// Mail w brandzie STRONEVO (ciepła czerń + bordo + złoto) — krótko, sedno + link.
// Ton: usprawnienie/wynik. Kwoty = jawny szacunek („~”).
function reportEmailHtml(payload: MonthlyReportPayload, link: string): string {
  const kpi = payload.kpi;
  const rows = [
    kpi.rozmowy > 0 ? `<li>Rozmowy odebrane: <strong>${kpi.rozmowy}</strong></li>` : '',
    kpi.leady > 0 ? `<li>Leady złapane: <strong>${kpi.leady}</strong></li>` : '',
    kpi.rezerwacje > 0 ? `<li>Rezerwacje: <strong>${kpi.rezerwacje}</strong></li>` : '',
    kpi.opinie > 0 ? `<li>Opinie zebrane: <strong>${kpi.opinie}</strong></li>` : '',
    kpi.smsy > 0 ? `<li>SMS-y wysłane: <strong>${kpi.smsy}</strong></li>` : '',
  ]
    .filter(Boolean)
    .join('');

  return `
  <div style="background:#0b0708;color:#e7e5e4;font-family:Inter,system-ui,sans-serif;padding:32px 24px;border-radius:12px;max-width:560px;margin:0 auto;">
    <p style="color:#d8b677;font-size:22px;font-weight:700;margin:0 0 4px;font-family:Georgia,serif;">STRONEVO</p>
    <p style="color:#c43159;font-size:13px;letter-spacing:2px;text-transform:uppercase;margin:0 0 20px;">Raport wyników · ${payload.okres_label}</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">${payload.roi_zdanie}</p>
    ${rows ? `<ul style="font-size:14px;line-height:1.9;padding-left:18px;margin:0 0 16px;">${rows}</ul>` : ''}
    <p style="font-size:14px;margin:0 0 24px;">Zaoszczędzony czas: <strong style="color:#f0d9a6;">~${kpi.godziny} h</strong> · wartość: <strong style="color:#f0d9a6;">~${formatPln(kpi.wartoscPln)} zł</strong></p>
    <a href="${link}" style="display:inline-block;background:#9b2242;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">Zobacz pełny raport</a>
    <p style="color:#78716c;font-size:11px;margin:24px 0 0;line-height:1.5;">Wartości oznaczone „~” to szacunek: minuty zaoszczędzone per zdarzenie × stawka ${payload.stawka_pln_h} zł/h. Pełna metoda w raporcie.</p>
  </div>`;
}
