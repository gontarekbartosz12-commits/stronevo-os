'use server';

import { revalidatePath } from 'next/cache';
import { demoStore } from '@/lib/demo-store';
import { sendSms } from '@/lib/integrations/sms';
import { newEnrollmentToken, newPaymentToken } from '@/lib/payments';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import {
  Course,
  Enrollment,
  Lesson,
  Payment,
  PaymentLink,
  Subscription,
  SubscriptionCycle,
} from '@/lib/types';

// COMMERCE (Faza 4) — akcje panelu.
// OPERATOR-FIRST: bramki/subskrypcje/struktura kursów = operator (CEO);
// klient (użytkowo) wystawia linki text-to-pay, czyta płatności, edytuje
// TREŚĆ lekcji (hybryda). Statusy płatności zmienia WYŁĄCZNIE webhook.

async function sessionRole(): Promise<'ceo' | 'pracownik' | 'klient'> {
  if (!isSupabaseConfigured()) return 'ceo';
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const role = user?.user_metadata?.role;
  return role === 'klient' ? 'klient' : role === 'pracownik' ? 'pracownik' : 'ceo';
}

async function requireOperator(co: string): Promise<void> {
  if ((await sessionRole()) === 'klient') {
    throw new Error(`${co} konfiguruje opiekun STRONEVO — napisz, a ustawimy to od ręki.`);
  }
}

// ===== Płatności / text-to-pay =====

export async function listPaymentsAction(contactId?: string): Promise<Payment[]> {
  if (!isSupabaseConfigured()) {
    return demoStore.listPayments(contactId === undefined ? undefined : contactId);
  }
  const supabase = await createClient(); // RLS: klient tylko własne
  let q = supabase.from('payments').select('*').order('created_at', { ascending: false }).limit(200);
  if (contactId !== undefined) q = q.eq('contact_id', contactId);
  const { data } = await q;
  return (data ?? []) as Payment[];
}

export async function listPaymentLinksAction(contactId?: string): Promise<PaymentLink[]> {
  if (!isSupabaseConfigured()) {
    return demoStore.listPaymentLinks(contactId === undefined ? undefined : contactId);
  }
  const supabase = await createClient();
  let q = supabase.from('payment_links').select('*').order('created_at', { ascending: false }).limit(200);
  if (contactId !== undefined) q = q.eq('contact_id', contactId);
  const { data } = await q;
  return (data ?? []) as PaymentLink[];
}

// Text-to-pay = funkcja UŻYTKOWA (klient wystawia linki dla swojej firmy)
export async function createPaymentLinkAction(input: {
  contact_id: string | null;
  kwota: number;
  opis: string;
  imie?: string;
  telefon?: string;
  email?: string;
  course_id?: string | null;
  sendSmsNow?: boolean;
}): Promise<{ link: PaymentLink; message: string }> {
  const kwota = Math.round(Number(input.kwota) * 100) / 100;
  if (!Number.isFinite(kwota) || kwota <= 0) throw new Error('Podaj poprawną kwotę (> 0).');
  if (!input.opis.trim()) throw new Error('Podaj opis płatności.');

  const row = {
    contact_id: input.contact_id,
    kwota,
    waluta: 'PLN',
    opis: input.opis.trim().slice(0, 200),
    token: newPaymentToken(),
    status: 'aktywny' as const,
    external: {
      imie: input.imie?.trim() || null,
      telefon: input.telefon?.trim() || null,
      email: input.email?.trim() || null,
    },
    meta: input.course_id ? { course_id: input.course_id } : {},
    payment_id: null,
    paid_at: null,
  };

  let link: PaymentLink;
  if (!isSupabaseConfigured()) {
    link = demoStore.createPaymentLink(row);
  } else {
    const supabase = await createClient(); // RLS: klient insert own
    const { data, error } = await supabase.from('payment_links').insert(row).select('*').single();
    if (error) throw new Error(`Nie udało się utworzyć linku: ${error.message}`);
    link = data as PaymentLink;
  }

  const appUrl = (process.env.APP_URL ?? 'https://crm.stronevo.pl').replace(/\/$/, '');
  const url = `${appUrl}/pay/${link.token}`;
  let message = `Link gotowy: ${url}`;
  if (input.sendSmsNow && row.external.telefon) {
    const r = await sendSms(
      row.external.telefon,
      `${row.opis}: ${kwota.toFixed(2)} zł. Zapłać wygodnie online: ${url}`
    );
    message =
      r.source === 'live' && r.data.sent
        ? `Link wysłany SMS-em na ${row.external.telefon}: ${url}`
        : `Link gotowy (SMS w trybie mock — brak kluczy bramy): ${url}`;
  }

  revalidatePath('/commerce');
  revalidatePath('/klient');
  return { link, message };
}

// ===== Subskrypcje (konfiguracja = OPERATOR) =====

export async function listSubscriptionsAction(contactId?: string): Promise<Subscription[]> {
  if (!isSupabaseConfigured()) {
    return demoStore.listSubscriptions(contactId === undefined ? undefined : contactId);
  }
  const supabase = await createClient();
  let q = supabase.from('subscriptions').select('*').order('next_charge');
  if (contactId !== undefined) q = q.eq('contact_id', contactId);
  const { data } = await q;
  return (data ?? []) as Subscription[];
}

export async function createSubscriptionAction(input: {
  contact_id: string;
  client_automation_id?: string | null;
  plan: string;
  kwota: number;
  cykl: SubscriptionCycle;
  next_charge: string; // ISO date
}): Promise<Subscription> {
  await requireOperator('Subskrypcje');
  const kwota = Math.round(Number(input.kwota) * 100) / 100;
  if (!Number.isFinite(kwota) || kwota <= 0) throw new Error('Podaj poprawną kwotę.');
  if (!input.plan.trim()) throw new Error('Podaj nazwę planu.');

  const row = {
    contact_id: input.contact_id,
    client_automation_id: input.client_automation_id ?? null,
    plan: input.plan.trim(),
    kwota,
    cykl: input.cykl,
    status: 'aktywna' as const,
    provider: (process.env.STRIPE_SECRET_KEY ? 'stripe' : 'mock') as Subscription['provider'],
    provider_ref: null,
    next_charge: input.next_charge,
  };
  let sub: Subscription;
  if (!isSupabaseConfigured()) {
    sub = demoStore.createSubscription(row);
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase.from('subscriptions').insert(row).select('*').single();
    if (error) throw new Error(error.message);
    sub = data as Subscription;
  }
  revalidatePath('/commerce');
  return sub;
}

export async function setSubscriptionStatus(
  id: string,
  status: Subscription['status']
): Promise<void> {
  await requireOperator('Subskrypcje');
  if (!isSupabaseConfigured()) {
    demoStore.updateSubscription(id, { status });
  } else {
    const supabase = await createClient();
    const { error } = await supabase.from('subscriptions').update({ status }).eq('id', id);
    if (error) throw new Error(error.message);
  }
  revalidatePath('/commerce');
}

// ===== Kursy =====

export interface CourseWithMeta extends Course {
  ownerName: string;
  lessons: Lesson[];
  enrollments: Enrollment[];
}

export async function listCoursesWithMeta(contactId?: string): Promise<CourseWithMeta[]> {
  if (!isSupabaseConfigured()) {
    const contacts = demoStore.listContacts();
    return demoStore
      .listCourses(contactId === undefined ? undefined : contactId)
      .map((c) => ({
        ...c,
        ownerName: c.contact_id
          ? contacts.find((x) => x.id === c.contact_id)?.firma ?? 'klient'
          : 'STRONEVO',
        lessons: demoStore.listLessons(c.id),
        enrollments: demoStore.listEnrollments(c.id),
      }));
  }
  const supabase = await createClient();
  let q = supabase.from('courses').select('*');
  if (contactId !== undefined) q = q.eq('contact_id', contactId);
  const [{ data: courses }, { data: lessons }, { data: enrollments }, { data: contacts }] =
    await Promise.all([
      q,
      supabase.from('lessons').select('*').order('kolejnosc'),
      supabase.from('enrollments').select('*'),
      supabase.from('contacts').select('id, firma, imie'),
    ]);
  return ((courses ?? []) as Course[]).map((c) => ({
    ...c,
    ownerName: c.contact_id
      ? (contacts ?? []).find((x) => x.id === c.contact_id)?.firma ?? 'klient'
      : 'STRONEVO',
    lessons: ((lessons ?? []) as Lesson[]).filter((l) => l.course_id === c.id),
    enrollments: ((enrollments ?? []) as Enrollment[]).filter((e) => e.course_id === c.id),
  }));
}

export async function createCourseAction(input: {
  contact_id: string | null;
  tytul: string;
  opis: string;
  cena: number | null;
}): Promise<Course> {
  await requireOperator('Strukturę kursów');
  if (!input.tytul.trim()) throw new Error('Podaj tytuł kursu.');
  const row = {
    contact_id: input.contact_id,
    tytul: input.tytul.trim(),
    opis: input.opis.trim() || null,
    cena: input.cena,
  };
  if (!isSupabaseConfigured()) {
    revalidatePath('/commerce');
    return demoStore.createCourse(row);
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from('courses').insert(row).select('*').single();
  if (error) throw new Error(error.message);
  revalidatePath('/commerce');
  return data as Course;
}

export async function addLessonAction(courseId: string, tytul: string): Promise<Lesson> {
  await requireOperator('Strukturę kursów');
  if (!tytul.trim()) throw new Error('Podaj tytuł lekcji.');

  if (!isSupabaseConfigured()) {
    const course = demoStore.getCourse(courseId);
    if (!course) throw new Error('Kurs nie istnieje.');
    const kolejnosc = demoStore.listLessons(courseId).length;
    revalidatePath('/commerce');
    return demoStore.createLesson({
      course_id: courseId,
      contact_id: course.contact_id,
      tytul: tytul.trim(),
      tresc: '',
      wideo_url: null,
      kolejnosc,
    });
  }
  const supabase = await createClient();
  const { data: course } = await supabase.from('courses').select('contact_id').eq('id', courseId).maybeSingle();
  const { count } = await supabase
    .from('lessons')
    .select('id', { count: 'exact', head: true })
    .eq('course_id', courseId);
  const { data, error } = await supabase
    .from('lessons')
    .insert({
      course_id: courseId,
      contact_id: course?.contact_id ?? null,
      tytul: tytul.trim(),
      tresc: '',
      kolejnosc: count ?? 0,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  revalidatePath('/commerce');
  return data as Lesson;
}

// Edycja TREŚCI lekcji — także klient (hybryda; RLS update own)
export async function saveLessonContent(
  lessonId: string,
  patch: { tytul?: string; tresc?: string; wideo_url?: string | null }
): Promise<void> {
  if (!isSupabaseConfigured()) {
    demoStore.updateLesson(lessonId, patch);
  } else {
    const supabase = await createClient();
    const { error } = await supabase.from('lessons').update(patch).eq('id', lessonId);
    if (error) throw new Error(error.message);
  }
  revalidatePath('/commerce');
}

// Ręczne nadanie dostępu do kursu (operator) — poza sprzedażą linkiem
export async function grantEnrollmentAction(input: {
  course_id: string;
  imie: string;
  email?: string;
}): Promise<{ token: string; url: string }> {
  await requireOperator('Nadawanie dostępów do kursów');
  const token = newEnrollmentToken();

  if (!isSupabaseConfigured()) {
    const course = demoStore.getCourse(input.course_id);
    if (!course) throw new Error('Kurs nie istnieje.');
    demoStore.createEnrollment({
      course_id: course.id,
      contact_id: course.contact_id,
      external: { imie: input.imie, email: input.email ?? null },
      token,
      payment_id: null,
      status: 'aktywny',
    });
  } else {
    const supabase = await createClient();
    const { data: course } = await supabase
      .from('courses')
      .select('contact_id')
      .eq('id', input.course_id)
      .maybeSingle();
    const { error } = await supabase.from('enrollments').insert({
      course_id: input.course_id,
      contact_id: course?.contact_id ?? null,
      external: { imie: input.imie, email: input.email ?? null },
      token,
      status: 'aktywny',
    });
    if (error) throw new Error(error.message);
  }
  const appUrl = (process.env.APP_URL ?? 'https://crm.stronevo.pl').replace(/\/$/, '');
  revalidatePath('/commerce');
  return { token, url: `${appUrl}/kurs/${token}` };
}
