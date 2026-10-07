import { notFound } from 'next/navigation';
import BookingWidget from './BookingWidget';
import { demoStore } from '@/lib/demo-store';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { BookingCalendar, CALENDAR_TYPE_LABELS, Contact } from '@/lib/types';

// Publiczny widget bookingu /rezerwacja/[slug] (Faza 5) — klient końcowy firmy
// umawia wizytę; round-robin/collective/class liczy serwer. Jasny motyw.
export const metadata = {
  title: 'Rezerwacja — STRONEVO',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

async function getCalendar(slug: string): Promise<{ calendar: BookingCalendar; firma: string } | null> {
  if (!isSupabaseConfigured()) {
    const calendar = demoStore.getBookingCalendarBySlug(slug);
    if (!calendar || !calendar.aktywny) return null;
    const c = calendar.owner_contact_id ? demoStore.getContact(calendar.owner_contact_id) : null;
    return { calendar, firma: c?.firma ?? c?.imie ?? 'STRONEVO' };
  }
  const supabase = isAdminConfigured() ? createAdminClient() : await createClient();
  const { data } = await supabase
    .from('booking_calendars')
    .select('*')
    .eq('slug', slug)
    .eq('aktywny', true)
    .maybeSingle();
  if (!data) return null;
  const calendar = data as BookingCalendar;
  let firma = 'STRONEVO';
  if (calendar.owner_contact_id) {
    const { data: c } = await supabase
      .from('contacts')
      .select('firma, imie')
      .eq('id', calendar.owner_contact_id)
      .maybeSingle();
    firma = (c as Contact | null)?.firma ?? firma;
  }
  return { calendar, firma };
}

export default async function RezerwacjaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await getCalendar(slug);
  if (!found) notFound();

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-10 font-sans">
      <div className="mx-auto max-w-lg">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
          Rezerwacja online · {found.firma}
        </p>
        <h1 className="mt-1 font-serif text-2xl font-bold text-stone-900">{found.calendar.nazwa}</h1>
        <p className="mt-1 text-xs text-stone-500">
          {CALENDAR_TYPE_LABELS[found.calendar.typ]} · {found.calendar.slot_min} min
        </p>
        <BookingWidget slug={slug} />
        <p className="mt-8 text-center text-[11px] text-stone-400">rezerwacje: STRONEVO</p>
      </div>
    </main>
  );
}
