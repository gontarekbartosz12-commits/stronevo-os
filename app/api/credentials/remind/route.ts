import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/demo-store';
import { sendEmail } from '@/lib/integrations/email';
import { sendSms } from '@/lib/integrations/sms';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';
import { ClientCredential, Contact } from '@/lib/types';

// POST /api/credentials/remind — auto-follow-up dostępów (Faza 1 zaufania).
// Cron (np. codziennie 10:00): każdy klient z brakującymi dostępami dostaje
// SMS + e-mail z prośbą o uzupełnienie w panelu — AŻ do kompletu (wtedy znika
// z listy). Ton „usprawniamy": przypominamy, nie strofujemy.
// Autoryzacja: Bearer <REMINDERS_API_TOKEN | NOTIFY_API_TOKEN>; bez ENV — otwarte (dev/demo).

export async function POST(request: NextRequest) {
  const token = process.env.REMINDERS_API_TOKEN || process.env.NOTIFY_API_TOKEN;
  if (token) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${token}`) {
      return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 });
    }
  }

  try {
    const demo = !isSupabaseConfigured();
    let missing: ClientCredential[];
    let contacts: Contact[];

    if (demo) {
      contacts = demoStore.listContacts();
      missing = contacts.flatMap((c) =>
        demoStore.listClientCredentials(c.id).filter((cr) => cr.status === 'oczekuje')
      );
    } else {
      if (!isAdminConfigured()) {
        return NextResponse.json(
          { error: 'Brak SUPABASE_SERVICE_ROLE_KEY — cron wymaga service role' },
          { status: 503 }
        );
      }
      const supabase = createAdminClient();
      const [{ data: creds }, { data: cts }] = await Promise.all([
        supabase.from('client_credentials').select('*').eq('status', 'oczekuje'),
        supabase.from('contacts').select('*'),
      ]);
      missing = (creds ?? []) as ClientCredential[];
      contacts = (cts ?? []) as Contact[];
    }

    // Grupuj braki per klient — jedna wiadomość dziennie, nie spam per pozycja
    const byContact = new Map<string, ClientCredential[]>();
    for (const cred of missing) {
      const list = byContact.get(cred.contact_id) ?? [];
      list.push(cred);
      byContact.set(cred.contact_id, list);
    }

    const appUrl = (process.env.APP_URL ?? 'https://crm.stronevo.pl').replace(/\/$/, '');
    const results: { contact_id: string; firma: string; brakuje: number; sms: string; email: string }[] = [];

    for (const [contactId, creds] of byContact) {
      const contact = contacts.find((c) => c.id === contactId);
      if (!contact) continue;
      const firma = contact.firma ?? contact.imie;
      const lista = creds.map((c) => c.pozycja).slice(0, 4);

      let smsStatus = 'pominięty (brak telefonu)';
      if (contact.telefon) {
        const sms = await sendSms(
          contact.telefon,
          `STRONEVO: żeby dokończyć Twoje wdrożenie, potrzebujemy jeszcze ${creds.length} ${creds.length === 1 ? 'dostępu' : 'dostępów'}. Uzupełnisz je w 2 min w panelu: ${appUrl}/klient`
        );
        smsStatus = sms.source === 'live' && sms.data.sent ? 'wysłany' : 'mock';
      }

      let emailStatus = 'pominięty (brak e-maila)';
      if (contact.email) {
        const mail = await sendEmail({
          to: contact.email,
          subject: 'Jeszcze jeden krok do startu Twojej automatyzacji — STRONEVO',
          html: `
            <div style="font-family:Inter,system-ui,sans-serif;max-width:540px;margin:0 auto;">
              <p>Dzień dobry,</p>
              <p>Twoje wdrożenie jest gotowe do budowy — potrzebujemy tylko ${creds.length === 1 ? 'jednego dostępu' : `${creds.length} dostępów`}:</p>
              <ul>${lista.map((p) => `<li>${p}</li>`).join('')}${creds.length > 4 ? '<li>…</li>' : ''}</ul>
              <p>Uzupełnienie zajmuje ~2 minuty — krok po kroku w Twoim panelu:</p>
              <p><a href="${appUrl}/klient" style="display:inline-block;background:#9b2242;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;">Uzupełnij dostępy</a></p>
              <p style="color:#78716c;font-size:12px;">Zespół STRONEVO · kontakt@stronevo.pl</p>
            </div>`,
        });
        emailStatus = mail.source === 'live' && mail.data.sent ? 'wysłany' : 'mock';
      }

      results.push({ contact_id: contactId, firma, brakuje: creds.length, sms: smsStatus, email: emailStatus });
    }

    return NextResponse.json({ ok: true, klienci: results.length, results });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Błąd follow-upu dostępów' },
      { status: 500 }
    );
  }
}
