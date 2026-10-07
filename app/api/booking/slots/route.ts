import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/demo-store';
import { slotsForDay } from '@/lib/booking';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';
import { Booking, BookingCalendar, CalendarAvailability } from '@/lib/types';

// GET /api/booking/slots?slug=...&data=YYYY-MM-DD — wolne sloty widgetu (publiczne).

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug');
  const dataStr = request.nextUrl.searchParams.get('data');
  if (!slug || !dataStr || !/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) {
    return NextResponse.json({ error: 'Podaj slug i data=YYYY-MM-DD' }, { status: 400 });
  }
  const day = new Date(`${dataStr}T00:00:00`);

  try {
    let calendar: BookingCalendar | null;
    let availability: CalendarAvailability[];
    let bookings: Booking[];

    if (!isSupabaseConfigured()) {
      calendar = demoStore.getBookingCalendarBySlug(slug);
      if (!calendar) return NextResponse.json({ error: 'Kalendarz nie istnieje' }, { status: 404 });
      availability = demoStore.listCalendarAvailability(calendar.id);
      bookings = demoStore.listBookings(calendar.id);
    } else {
      if (!isAdminConfigured()) return NextResponse.json({ error: 'Brak service role' }, { status: 503 });
      const db = createAdminClient();
      const { data: cal } = await db.from('booking_calendars').select('*').eq('slug', slug).maybeSingle();
      calendar = cal as BookingCalendar | null;
      if (!calendar) return NextResponse.json({ error: 'Kalendarz nie istnieje' }, { status: 404 });
      const [{ data: av }, { data: bk }] = await Promise.all([
        db.from('calendar_availability').select('*').eq('calendar_id', calendar.id),
        db.from('bookings').select('*').eq('calendar_id', calendar.id).eq('status', 'potwierdzona'),
      ]);
      availability = (av ?? []).map((a) => ({ ...a, do: a.do ?? a['do'] })) as CalendarAvailability[];
      bookings = (bk ?? []) as Booking[];
    }
    if (!calendar.aktywny) return NextResponse.json({ error: 'Kalendarz nieaktywny' }, { status: 404 });

    return NextResponse.json({
      ok: true,
      kalendarz: { nazwa: calendar.nazwa, typ: calendar.typ, slot_min: calendar.slot_min },
      slots: slotsForDay(calendar, availability, bookings, day),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Błąd slotów' },
      { status: 500 }
    );
  }
}
