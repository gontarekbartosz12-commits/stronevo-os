import { sendOpsAlert } from './alerts';
import { demoStore } from './demo-store';
import { createInvoice } from './integrations/fakturownia';
import { sendSms } from './integrations/sms';
import { newPaymentToken } from './payments';
import { isSupabaseConfigured } from './supabase/config';
import { createAdminClient, isAdminConfigured } from './supabase/admin';
import { Contact, Subscription } from './types';

// SUBSKRYPCJE — cron auto-obciążeń (Faza 4).
// provider 'stripe' + provider_ref → off-session PaymentIntent (prawdziwy
// auto-charge kartą). provider 'mock' (demo) → obciążenie symulowane (jawnie).
// Pozostałe / brak zapisanej karty → SMART DUNNING: automatyczny link
// text-to-pay SMS-em + notyfikacja (P24 nie ma klasycznego recurring bez
// tokenizacji kart — dokumentacja w docs/FAZA4-COMMERCE.md).
// Po udanym obciążeniu: payment + faktura (Fakturownia) + next_charge +1 cykl.

export interface ChargeResult {
  subscription_id: string;
  plan: string;
  kwota: number;
  wynik: 'obciazona' | 'link_wyslany' | 'blad';
  szczegoly: string;
}

export async function chargeDueSubscriptions(now = new Date()): Promise<ChargeResult[]> {
  const demo = !isSupabaseConfigured();
  if (!demo && !isAdminConfigured()) {
    throw new Error('Brak SUPABASE_SERVICE_ROLE_KEY — cron obciążeń wymaga service role.');
  }
  const today = now.toISOString().slice(0, 10);

  let due: Subscription[];
  if (demo) {
    due = demoStore
      .listSubscriptions()
      .filter((s) => s.status === 'aktywna' && s.next_charge && s.next_charge <= today);
  } else {
    const { data } = await createAdminClient()
      .from('subscriptions')
      .select('*')
      .eq('status', 'aktywna')
      .lte('next_charge', today);
    due = (data ?? []) as Subscription[];
  }

  const results: ChargeResult[] = [];
  for (const sub of due) {
    const contact = await getContact(sub.contact_id);
    try {
      if (sub.provider === 'stripe' && sub.provider_ref && process.env.STRIPE_SECRET_KEY) {
        const charged = await chargeStripeOffSession(sub);
        if (charged.ok) {
          await recordCharge(demo, sub, contact, 'stripe', charged.external_id);
          results.push({ subscription_id: sub.id, plan: sub.plan, kwota: Number(sub.kwota), wynik: 'obciazona', szczegoly: 'Stripe off-session' });
          continue;
        }
        // nieudane obciążenie karty → dunning linkiem + status zalegla
        await markZalegla(demo, sub, charged.error ?? 'odmowa karty');
        await sendDunningLink(demo, sub, contact);
        results.push({ subscription_id: sub.id, plan: sub.plan, kwota: Number(sub.kwota), wynik: 'link_wyslany', szczegoly: `Stripe odmowa → link do opłaty (${charged.error ?? '?'})` });
        continue;
      }

      if (sub.provider === 'mock') {
        // demo: symulowane obciążenie — pełny cykl payment+faktura+next_charge
        await recordCharge(demo, sub, contact, 'mock', `mock-charge-${Date.now()}`);
        results.push({ subscription_id: sub.id, plan: sub.plan, kwota: Number(sub.kwota), wynik: 'obciazona', szczegoly: 'symulacja (tryb demo)' });
        continue;
      }

      // p24/payu bez tokenu karty: smart dunning — link do opłaty SMS-em
      await sendDunningLink(demo, sub, contact);
      await advanceNextCharge(demo, sub); // kolejny cykl liczony od terminu
      results.push({ subscription_id: sub.id, plan: sub.plan, kwota: Number(sub.kwota), wynik: 'link_wyslany', szczegoly: `${sub.provider}: link text-to-pay wysłany` });
    } catch (e) {
      await markZalegla(demo, sub, e instanceof Error ? e.message : 'błąd obciążenia');
      results.push({ subscription_id: sub.id, plan: sub.plan, kwota: Number(sub.kwota), wynik: 'blad', szczegoly: e instanceof Error ? e.message : 'błąd' });
    }
  }
  return results;
}

async function getContact(contactId: string | null): Promise<Contact | null> {
  if (!contactId) return null;
  if (!isSupabaseConfigured()) return demoStore.getContact(contactId);
  const { data } = await createAdminClient().from('contacts').select('*').eq('id', contactId).maybeSingle();
  return data as Contact | null;
}

function nextChargeDate(sub: Subscription): string {
  const base = sub.next_charge ? new Date(sub.next_charge) : new Date();
  if (sub.cykl === 'roczny') base.setFullYear(base.getFullYear() + 1);
  else base.setMonth(base.getMonth() + 1);
  return base.toISOString().slice(0, 10);
}

async function advanceNextCharge(demo: boolean, sub: Subscription): Promise<void> {
  const next = nextChargeDate(sub);
  if (demo) {
    demoStore.updateSubscription(sub.id, { next_charge: next });
  } else {
    await createAdminClient().from('subscriptions').update({ next_charge: next }).eq('id', sub.id);
  }
}

async function markZalegla(demo: boolean, sub: Subscription, powod: string): Promise<void> {
  if (demo) {
    demoStore.updateSubscription(sub.id, { status: 'zalegla' });
  } else {
    await createAdminClient().from('subscriptions').update({ status: 'zalegla' }).eq('id', sub.id);
  }
  await sendOpsAlert(`⚠️ Subskrypcja ZALEGŁA: ${sub.plan} (${Number(sub.kwota).toFixed(2)} zł) — ${powod}.`);
}

// Udane obciążenie: payment + faktura + next_charge + notyfikacja
async function recordCharge(
  demo: boolean,
  sub: Subscription,
  contact: Contact | null,
  provider: Subscription['provider'],
  externalId: string | null
): Promise<void> {
  const paidAt = new Date().toISOString();
  const paymentRow = {
    contact_id: sub.contact_id,
    payment_link_id: null,
    subscription_id: sub.id,
    kwota: Number(sub.kwota),
    waluta: 'PLN',
    status: 'oplacona' as const,
    provider,
    external_id: externalId,
    meta: { plan: sub.plan, cykl: sub.cykl },
    paid_at: paidAt,
  };
  if (demo) {
    demoStore.createPayment(paymentRow);
  } else {
    await createAdminClient().from('payments').insert(paymentRow);
  }

  if (contact) {
    const fakturownia = await createInvoice(
      contact,
      [{ nazwa: sub.plan, kwota: Number(sub.kwota), cykl: 'miesieczna' }],
      { firstMonthFree: false, simulated: provider === 'mock' }
    );
    const invoiceRow = {
      contact_id: contact.id,
      fakturownia_id: fakturownia.data.fakturowniaId,
      tytul: `${sub.plan} (${sub.cykl})`,
      kwota: Number(sub.kwota),
      cykl: 'miesieczna' as const,
      status: 'oplacona' as const,
      data: paidAt.slice(0, 10),
    };
    if (demo) {
      demoStore.createInvoice(invoiceRow);
    } else {
      await createAdminClient().from('invoices').insert(invoiceRow);
    }
  }

  await advanceNextCharge(demo, sub);

  const notif = {
    typ: 'biznes' as const,
    severity: 'info' as const,
    tytul: `💳 Subskrypcja obciążona: ${sub.plan} — ${Number(sub.kwota).toFixed(2)} zł`,
    opis: `${contact?.firma ?? contact?.imie ?? 'klient'} · ${provider} · faktura wystawiona · następne obciążenie: ${nextChargeDate(sub)}.`,
    related_typ: 'subscription',
    related_id: sub.id,
    status: 'nowe' as const,
    akcje: [],
  };
  if (demo) {
    demoStore.createNotification(notif);
  } else {
    await createAdminClient().from('notifications').insert(notif);
  }
}

// Smart dunning: automatyczny link płatniczy SMS-em (text-to-pay)
async function sendDunningLink(demo: boolean, sub: Subscription, contact: Contact | null): Promise<void> {
  const token = newPaymentToken();
  const linkRow = {
    contact_id: sub.contact_id,
    kwota: Number(sub.kwota),
    waluta: 'PLN',
    opis: `${sub.plan} — opłata za kolejny okres`,
    token,
    status: 'aktywny' as const,
    external: { imie: contact?.firma ?? contact?.imie ?? null, telefon: contact?.telefon ?? null, email: contact?.email ?? null },
    meta: { subscription_id: sub.id },
    payment_id: null,
    paid_at: null,
  };
  if (demo) {
    demoStore.createPaymentLink(linkRow);
  } else {
    await createAdminClient().from('payment_links').insert(linkRow);
  }
  const appUrl = (process.env.APP_URL ?? 'https://crm.stronevo.pl').replace(/\/$/, '');
  if (contact?.telefon) {
    await sendSms(
      contact.telefon,
      `${sub.plan}: opłata ${Number(sub.kwota).toFixed(2)} zł za kolejny okres. Zapłać wygodnie online: ${appUrl}/pay/${token}`
    );
  }
  const notif = {
    typ: 'biznes' as const,
    severity: 'warn' as const,
    tytul: `Subskrypcja: wysłano link do opłaty — ${sub.plan}`,
    opis: `${contact?.firma ?? 'klient'} · ${Number(sub.kwota).toFixed(2)} zł · ${appUrl}/pay/${token}`,
    related_typ: 'subscription',
    related_id: sub.id,
    status: 'nowe' as const,
    akcje: [],
  };
  if (demo) {
    demoStore.createNotification(notif);
  } else {
    await createAdminClient().from('notifications').insert(notif);
  }
}

async function chargeStripeOffSession(
  sub: Subscription
): Promise<{ ok: boolean; external_id: string | null; error?: string }> {
  try {
    const params = new URLSearchParams({
      amount: String(Math.round(Number(sub.kwota) * 100)),
      currency: 'pln',
      customer: sub.provider_ref!,
      off_session: 'true',
      confirm: 'true',
      description: sub.plan,
    });
    const res = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const json = await res.json();
    if (res.ok && json.status === 'succeeded') return { ok: true, external_id: json.id };
    return { ok: false, external_id: json.id ?? null, error: json?.error?.message ?? json.status };
  } catch (e) {
    return { ok: false, external_id: null, error: e instanceof Error ? e.message : 'Stripe nieosiągalny' };
  }
}
