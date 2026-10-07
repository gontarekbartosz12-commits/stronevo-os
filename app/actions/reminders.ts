'use server';

import { demoStore } from '@/lib/demo-store';
import { emailFrom, sendEmail } from '@/lib/integrations/email';
import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { Contact, Invoice } from '@/lib/types';

// Etapy przypomnień liczone od terminu faktury (invoice.data): −3 przed, 0 w
// terminie, +3 i +7 po terminie. Dzienny cron trafia w każdy etap raz.
const STAGES: Record<number, string> = {
  [-3]: 'Przypomnienie: termin płatności za 3 dni',
  [0]: 'Dziś mija termin płatności',
  [3]: 'Faktura po terminie (3 dni)',
  [7]: 'Faktura po terminie (7 dni) — prosimy o pilną płatność',
};

function daysBetween(fromIso: string, todayIso: string): number {
  const a = new Date(`${fromIso}T00:00:00Z`).getTime();
  const b = new Date(`${todayIso}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export interface ReminderResult {
  checked: number;
  sent: number;
  szczegoly: string[];
}

// Automat przypomnień o płatności — do wywołania przez dzienny cron
// (POST /api/reminders/run). Dla każdej nieopłaconej faktury sprawdza etap i,
// jeśli dziś przypada, wysyła mail do klienta + tworzy powiadomienie biznesowe.
export async function runPaymentReminders(): Promise<ReminderResult> {
  const todayIso = new Date().toISOString().slice(0, 10);

  // Automat bez sesji (cron) → service role (bypass RLS). Demo → in-memory.
  const useAdmin = isSupabaseConfigured() && isAdminConfigured();
  const admin = useAdmin ? createAdminClient() : null;

  let invoices: Invoice[];
  const contactsById = new Map<string, Contact>();
  if (!admin) {
    invoices = demoStore.listInvoices().filter((i) => i.status !== 'oplacona');
    demoStore.listContacts().forEach((c) => contactsById.set(c.id, c));
  } else {
    const { data: inv } = await admin.from('invoices').select('*').neq('status', 'oplacona');
    invoices = (inv ?? []) as Invoice[];
    const ids = [...new Set(invoices.map((i) => i.contact_id))];
    if (ids.length > 0) {
      const { data: cs } = await admin.from('contacts').select('*').in('id', ids);
      for (const c of (cs ?? []) as Contact[]) contactsById.set(c.id, c);
    }
  }

  const szczegoly: string[] = [];
  let sent = 0;

  for (const inv of invoices) {
    const diff = daysBetween(inv.data, todayIso);
    const stage = STAGES[diff];
    if (!stage) continue;

    const contact = contactsById.get(inv.contact_id);
    if (!contact?.email) {
      szczegoly.push(`${inv.tytul}: etap „${stage}" — brak e-maila kontaktu`);
      continue;
    }

    const link = inv.fakturownia_id
      ? `https://${process.env.FAKTUROWNIA_DOMAIN ?? 'app'}.fakturownia.pl/`
      : 'https://crm.stronevo.pl/klient';

    const res = await sendEmail({
      to: contact.email,
      subject: `${stage} — ${inv.tytul}`,
      html:
        `<p>Dzień dobry,</p>` +
        `<p>${stage} dotyczący: <strong>${inv.tytul}</strong> na kwotę ` +
        `<strong>${inv.kwota} zł netto</strong> (termin ${inv.data}).</p>` +
        `<p>Szczegóły i płatność: <a href="${link}">${link}</a></p>` +
        `<p>Pozdrawiamy,<br/>STRONEVO — ${emailFrom()}</p>`,
    });

    const notif = {
      typ: 'biznes' as const,
      severity: (diff > 0 ? 'warn' : 'info') as 'warn' | 'info',
      tytul: `${stage}: ${contact.firma ?? contact.imie}`,
      opis: `${inv.tytul} — ${inv.kwota} zł. Mail: ${res.data.sent ? 'wysłany' : 'mock (brak bramy)'}.`,
      related_typ: 'invoice',
      related_id: inv.id,
      status: 'nowe' as const,
      akcje: [],
    };
    if (!admin) {
      demoStore.createNotification(notif);
    } else {
      await admin.from('notifications').insert(notif);
    }

    if (res.data.sent) sent++;
    szczegoly.push(
      `${inv.tytul}: etap „${stage}" → ${contact.email} (${res.data.sent ? 'wysłany' : 'mock'})`
    );
  }

  return { checked: invoices.length, sent, szczegoly };
}
