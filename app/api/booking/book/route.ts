import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/demo-store';
import { isValidSlot, pickRoundRobinMember } from '@/lib/booking';
import { sendSms } from '@/lib/integrations/sms';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';
import {
  Booking,
  BookingCalendar,
  CalendarAvailability,
  CalendarMember,
} from '@/lib/types';

// POST /api/booking/book — rezerwacja z publicznego widgetu (Faza 5).
// Przydział wg typu: round_robin=rotacja członków (najmniej rezerwacji),
// collective=cały zespół, class=do limitu miejsc. Po rezerwacji: lead w CRM
// właściciela + notyfikacja + webhook operatora (BOOKING_WEBHOOK_URL → n8n:
// Google Calendar/Cal.com/SMS potwierdzenie — konfiguruje STRONEVO).
// Body: { slug, start (ISO), imie, telefon?, email? }

export async function POST(request: NextRequest) {
  let body: { slug?: string; start?: string; imie?: string; telefon?: string; email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body musi być JSON-em' }, { status: 400 });
  }
  if (!body.slug || !body.start || !body.imie?.trim()) {
    return NextResponse.json({ error: 'Podaj slug, start i imie' }, { status: 400 });
  }
  const start = new Date(body.start);
  if (Number.isNaN(start.getTime())) {
    return NextResponse.json({ error: 'Niepoprawny start (ISO)' }, { status: 400 });
  }

  try {
    const demo = !isSupabaseConfigured();
    if (!demo && !isAdminConfigured()) {
      return NextResponse.json({ error: 'Brak service role' }, { status: 503 });
    }

    let calendar: BookingCalendar | null;
    let availability: CalendarAvailability[];
    let bookings: Booking[];
    let members: CalendarMember[];

    if (demo) {
      calendar = demoStore.getBookingCalendarBySlug(body.slug);
      if (!calendar) return NextResponse.json({ error: 'Kalendarz nie istnieje' }, { status: 404 });
      availability = demoStore.listCalendarAvailability(calendar.id);
      bookings = demoStore.listBookings(calendar.id);
      members = demoStore.listCalendarMembers(calendar.id);
    } else {
      const db = createAdminClient();
      const { data: cal } = await db.from('booking_calendars').select('*').eq('slug', body.slug).maybeSingle();
      calendar = cal as BookingCalendar | null;
      if (!calendar) return NextResponse.json({ error: 'Kalendarz nie istnieje' }, { status: 404 });
      const [{ data: av }, { data: bk }, { data: mb }] = await Promise.all([
        db.from('calendar_availability').select('*').eq('calendar_id', calendar.id),
        db.from('bookings').select('*').eq('calendar_id', calendar.id).eq('status', 'potwierdzona'),
        db.from('calendar_members').select('*').eq('calendar_id', calendar.id),
      ]);
      availability = (av ?? []) as CalendarAvailability[];
      bookings = (bk ?? []) as Booking[];
      members = (mb ?? []) as CalendarMember[];
    }
    if (!calendar.aktywny) return NextResponse.json({ error: 'Kalendarz nieaktywny' }, { status: 404 });

    // twarda walidacja slotu (dostępność + kolizje + capacity)
    if (!isValidSlot(calendar, availability, bookings, start)) {
      return NextResponse.json({ error: 'Ten termin jest już zajęty lub niedostępny' }, { status: 409 });
    }

    // przydział członka wg typu kalendarza
    let member: CalendarMember | null = null;
    if (calendar.typ === 'round_robin') {
      member = pickRoundRobinMember(members, bookings);
    } else if (calendar.typ === 'osobisty') {
      member = members[0] ?? null;
    } // collective/class: bez pojedynczego członka (cały zespół / grupa)

    const koniec = new Date(start.getTime() + calendar.slot_min * 60_000);
    const row = {
      calendar_id: calendar.id,
      owner_contact_id: calendar.owner_contact_id,
      member_id: member?.id ?? null,
      external: { imie: body.imie.trim(), telefon: body.telefon?.trim() || null, email: body.email?.trim() || null },
      start: start.toISOString(),
      koniec: koniec.toISOString(),
      status: 'potwierdzona' as const,
    };

    let booking: Booking;
    if (demo) {
      booking = demoStore.createBooking(row);
    } else {
      const { data, error } = await createAdminClient().from('bookings').insert(row).select('*').single();
      if (error) throw new Error(error.message);
      booking = data as Booking;
    }

    // lead w CRM właściciela kalendarza (jak Ada)
    const leadRow = {
      server_id: null,
      typ: 'lead' as const,
      imie: body.imie.trim(),
      firma: null, nip: null, adres: null, branza: null, miasto: null,
      telefon: body.telefon?.trim() || null,
      email: body.email?.trim() || null,
      zrodlo: `rezerwacja: ${calendar.nazwa}`,
      status_pipeline: 'UMOWIONY' as const,
      nastepna_akcja: `Wizyta: ${start.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}${member ? ` (${member.nazwa})` : ''}`,
      nastepna_akcja_data: start.toISOString().slice(0, 10),
      data_ostatniego_kontaktu: new Date().toISOString().slice(0, 10),
      notatki: `Rezerwacja z widgetu ${calendar.slug} (${calendar.typ}).`,
      business_hours: null, srednia_wartosc_wizyty: null, auto_followup_sms: false,
      przypisany_do: member?.nazwa ?? null,
      owner_contact_id: calendar.owner_contact_id,
    };
    if (demo) {
      demoStore.createContact(leadRow);
      demoStore.createNotification({
        typ: 'biznes', severity: 'info',
        tytul: `📅 Nowa rezerwacja: ${calendar.nazwa}`,
        opis: `${body.imie} · ${start.toLocaleString('pl-PL')}${member ? ` · przydzielono: ${member.nazwa}` : ''}`,
        related_typ: 'booking', related_id: booking.id, status: 'nowe', akcje: [],
      });
    } else {
      const db = createAdminClient();
      await db.from('contacts').insert(leadRow);
      await db.from('notifications').insert({
        typ: 'biznes', severity: 'info',
        tytul: `📅 Nowa rezerwacja: ${calendar.nazwa}`,
        opis: `${body.imie} · ${start.toLocaleString('pl-PL')}${member ? ` · przydzielono: ${member.nazwa}` : ''}`,
        related_typ: 'booking', related_id: booking.id, status: 'nowe', akcje: [],
      });
    }

    // SMS potwierdzenie rezerwacji (Zadarma, jeśli podano telefon)
    if (row.external.telefon) {
      const kiedy = start.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      try {
        await sendSms(
          row.external.telefon,
          `Rezerwacja potwierdzona: ${kiedy}${member ? ` (${member.nazwa})` : ''}. ${calendar.nazwa}. Do zobaczenia!`
        );
      } catch {}
    }

    // webhook operatora (n8n → Google Calendar)
    const webhook = process.env.BOOKING_WEBHOOK_URL;
    if (webhook) {
      try {
        await fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ booking_id: booking.id, calendar: calendar.slug, ...row }),
        });
      } catch {
        // webhook nie może blokować rezerwacji
      }
    }

    return NextResponse.json({
      ok: true,
      booking_id: booking.id,
      start: booking.start,
      przydzielono: member?.nazwa ?? (calendar.typ === 'collective' ? 'cały zespół' : null),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Błąd rezerwacji' },
      { status: 500 }
    );
  }
}
