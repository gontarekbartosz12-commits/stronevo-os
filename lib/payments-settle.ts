import { sendOpsAlert } from './alerts';
import { demoStore } from './demo-store';
import { createInvoice } from './integrations/fakturownia';
import { sendSms } from './integrations/sms';
import { sendEmail } from './integrations/email';
import { newEnrollmentToken } from './payments';
import { isSupabaseConfigured } from './supabase/config';
import { createAdminClient, isAdminConfigured } from './supabase/admin';
import { Contact, Course, Payment, PaymentLink, PaymentProvider } from './types';

// ROZLICZENIE PŁATNOŚCI (Faza 4) — jedno miejsce, w którym płatność staje się
// „opłacona" + efekty: faktura (Fakturownia), notyfikacja+alert, odblokowanie
// (kurs po zakupie: enrollment + wysyłka linku dostępu). Wołane WYŁĄCZNIE po
// zweryfikowanym podpisie webhooka (lib/payments.verifyWebhook).
// ⚠️ Twarda weryfikacja kwoty: groszy z webhooka === round(kwota*100) linku.

export interface SettleResult {
  ok: boolean;
  error?: string;
  status?: number;
  payment_id?: string;
  invoice_id?: string | null;
  enrollment_token?: string | null;
  already_paid?: boolean;
}

export async function settlePaymentByToken(input: {
  token: string;
  groszy: number;
  provider: PaymentProvider;
  external_id: string | null;
}): Promise<SettleResult> {
  const demo = !isSupabaseConfigured();
  if (!demo && !isAdminConfigured()) {
    return { ok: false, error: 'Brak SUPABASE_SERVICE_ROLE_KEY', status: 503 };
  }

  // 1) Link po tokenie
  let link: PaymentLink | null;
  if (demo) {
    link = demoStore.getPaymentLinkByToken(input.token);
  } else {
    const { data } = await createAdminClient()
      .from('payment_links')
      .select('*')
      .eq('token', input.token)
      .maybeSingle();
    link = data as PaymentLink | null;
  }
  if (!link) return { ok: false, error: 'Nie znaleziono linku płatności (token)', status: 404 };
  if (link.status === 'oplacony') {
    return { ok: true, already_paid: true, payment_id: link.payment_id ?? undefined };
  }

  // 2) TWARDA weryfikacja kwoty (prawdziwe pieniądze — nie ~szacunek)
  const expectedGroszy = Math.round(Number(link.kwota) * 100);
  if (input.groszy !== expectedGroszy) {
    await sendOpsAlert(
      `⚠️ Płatność ODRZUCONA — niezgodna kwota! Link ${link.token}: oczekiwano ${expectedGroszy} gr, webhook ${input.groszy} gr (${input.provider}).`
    );
    return { ok: false, error: 'Kwota webhooka niezgodna z linkiem', status: 400 };
  }

  // 3) Payment: opłacona (upsert — start mógł już utworzyć rekord 'oczekuje')
  const paidAt = new Date().toISOString();
  let payment: Payment;
  if (demo) {
    const existing = demoStore
      .listPayments()
      .find((p) => p.payment_link_id === link.id && p.status !== 'oplacona');
    payment = existing
      ? demoStore.updatePayment(existing.id, {
          status: 'oplacona',
          paid_at: paidAt,
          external_id: input.external_id ?? existing.external_id,
          provider: input.provider,
        })!
      : demoStore.createPayment({
          contact_id: link.contact_id,
          payment_link_id: link.id,
          subscription_id: null,
          kwota: Number(link.kwota),
          waluta: link.waluta,
          status: 'oplacona',
          provider: input.provider,
          external_id: input.external_id,
          meta: { opis: link.opis },
          paid_at: paidAt,
        });
    demoStore.updatePaymentLink(link.id, {
      status: 'oplacony',
      payment_id: payment.id,
      paid_at: paidAt,
    });
  } else {
    const supabase = createAdminClient();
    const { data: existing } = await supabase
      .from('payments')
      .select('*')
      .eq('payment_link_id', link.id)
      .neq('status', 'oplacona')
      .limit(1)
      .maybeSingle();
    if (existing) {
      const { data } = await supabase
        .from('payments')
        .update({ status: 'oplacona', paid_at: paidAt, external_id: input.external_id, provider: input.provider })
        .eq('id', existing.id)
        .select('*')
        .single();
      payment = data as Payment;
    } else {
      const { data, error } = await supabase
        .from('payments')
        .insert({
          contact_id: link.contact_id,
          payment_link_id: link.id,
          kwota: Number(link.kwota),
          waluta: link.waluta,
          status: 'oplacona',
          provider: input.provider,
          external_id: input.external_id,
          meta: { opis: link.opis },
          paid_at: paidAt,
        })
        .select('*')
        .single();
      if (error) return { ok: false, error: error.message, status: 500 };
      payment = data as Payment;
    }
    await supabase
      .from('payment_links')
      .update({ status: 'oplacony', payment_id: payment.id, paid_at: paidAt })
      .eq('id', link.id);
  }

  // 4) Faktura po opłacie (Fakturownia stub/live + rekord invoices)
  let invoiceId: string | null = null;
  const contact = await getContact(link.contact_id);
  if (contact) {
    const fakturownia = await createInvoice(
      contact,
      [{ nazwa: link.opis, kwota: Number(link.kwota), cykl: 'jednorazowa' }],
      { firstMonthFree: false, simulated: input.provider === 'mock' }
    );
    const invoiceRow = {
      contact_id: contact.id,
      fakturownia_id: fakturownia.data.fakturowniaId,
      tytul: link.opis,
      kwota: Number(link.kwota),
      cykl: 'jednorazowa' as const,
      status: 'oplacona' as const,
      data: paidAt.slice(0, 10),
    };
    if (demo) {
      invoiceId = demoStore.createInvoice(invoiceRow).id;
    } else {
      const { data } = await createAdminClient().from('invoices').insert(invoiceRow).select('id').single();
      invoiceId = (data?.id as string) ?? null;
    }
  }

  // 5) Odblokowanie: kurs po zakupie (payment_links.meta.course_id)
  let enrollmentToken: string | null = null;
  const courseId = link.meta?.course_id ?? null;
  if (courseId) {
    enrollmentToken = await grantCourseAccess(demo, String(courseId), link, payment.id);
  }

  // 6) Notyfikacja + alert operatora
  const kto = link.external?.imie ?? 'płatnik';
  const notif = {
    typ: 'biznes' as const,
    severity: 'info' as const,
    tytul: `💰 Opłacono: ${link.opis} — ${Number(link.kwota).toFixed(2)} zł`,
    opis: `${kto} (${input.provider}) · faktura ${invoiceId ? 'wystawiona' : 'pominięta'}${enrollmentToken ? ' · dostęp do kursu nadany' : ''}.`,
    related_typ: 'payment',
    related_id: payment.id,
    status: 'nowe' as const,
    akcje: [],
  };
  if (demo) {
    demoStore.createNotification(notif);
  } else {
    await createAdminClient().from('notifications').insert(notif);
  }
  await sendOpsAlert(
    `💰 Płatność ${Number(link.kwota).toFixed(2)} zł: ${link.opis} (${kto}, ${input.provider}).`
  );

  return { ok: true, payment_id: payment.id, invoice_id: invoiceId, enrollment_token: enrollmentToken };
}

async function getContact(contactId: string | null): Promise<Contact | null> {
  if (!contactId) return null;
  if (!isSupabaseConfigured()) return demoStore.getContact(contactId);
  const { data } = await createAdminClient().from('contacts').select('*').eq('id', contactId).maybeSingle();
  return data as Contact | null;
}

// Dostęp do kursu po opłacie: enrollment + wysyłka kapability linku
async function grantCourseAccess(
  demo: boolean,
  courseId: string,
  link: PaymentLink,
  paymentId: string
): Promise<string | null> {
  let course: Course | null;
  if (demo) {
    course = demoStore.getCourse(courseId);
  } else {
    const { data } = await createAdminClient().from('courses').select('*').eq('id', courseId).maybeSingle();
    course = data as Course | null;
  }
  if (!course) return null;

  const token = newEnrollmentToken();
  const row = {
    course_id: course.id,
    contact_id: link.contact_id,
    external: { imie: link.external?.imie ?? null, email: link.external?.email ?? null },
    token,
    payment_id: paymentId,
    status: 'aktywny' as const,
  };
  if (demo) {
    demoStore.createEnrollment(row);
  } else {
    await createAdminClient().from('enrollments').insert(row);
  }

  // wysyłka linku dostępu (SMS/e-mail — co mamy)
  const appUrl = (process.env.APP_URL ?? 'https://crm.stronevo.pl').replace(/\/$/, '');
  const dostep = `${appUrl}/kurs/${token}`;
  if (link.external?.telefon) {
    await sendSms(
      link.external.telefon,
      `Dziękujemy za zakup! Twój dostęp do kursu "${course.tytul}": ${dostep}`
    );
  }
  if (link.external?.email) {
    await sendEmail({
      to: link.external.email,
      subject: `Dostęp do kursu: ${course.tytul}`,
      html: `<p>Dziękujemy za zakup!</p><p>Twój kurs: <a href="${dostep}">${dostep}</a></p><p>Link jest osobisty — nie udostępniaj go dalej.</p>`,
    });
  }
  return token;
}
