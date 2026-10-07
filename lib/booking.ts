import {
  Booking,
  BookingCalendar,
  CalendarAvailability,
  CalendarMember,
} from './types';

// BOOKING (Faza 5) — sloty i przydział wg typu kalendarza (czysta logika).
//  osobisty/round_robin: 1 rezerwacja na slot (RR dodatkowo rotuje członków),
//  collective: 1 rezerwacja na slot (spotkanie z całym zespołem),
//  class: do `capacity` rezerwacji na slot (zajęcia grupowe).

export interface Slot {
  start: string; // ISO
  koniec: string;
  wolne_miejsca: number;
}

function hm(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}
function parseHm(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function slotsForDay(
  calendar: BookingCalendar,
  availability: CalendarAvailability[],
  bookings: Booking[], // potwierdzone rezerwacje tego kalendarza
  day: Date,
  now = new Date()
): Slot[] {
  const dayAvail = availability.filter((a) => a.dzien === day.getDay());
  if (dayAvail.length === 0) return [];

  const cap = calendar.typ === 'class' ? Math.max(1, calendar.capacity) : 1;
  const slots: Slot[] = [];

  for (const a of dayAvail) {
    const od = parseHm(a.od);
    const doM = parseHm(a.do);
    for (let m = od; m + calendar.slot_min <= doM; m += calendar.slot_min) {
      const start = new Date(day);
      start.setHours(Math.floor(m / 60), m % 60, 0, 0);
      if (start <= now) continue;
      const koniec = new Date(start.getTime() + calendar.slot_min * 60_000);

      const zajete = bookings.filter(
        (b) => b.status === 'potwierdzona' && new Date(b.start).getTime() === start.getTime()
      ).length;
      if (zajete >= cap) continue;

      slots.push({
        start: start.toISOString(),
        koniec: koniec.toISOString(),
        wolne_miejsca: cap - zajete,
      });
    }
  }
  return slots.sort((a, b) => a.start.localeCompare(b.start));
}

// Round-robin: członek z najmniejszą liczbą potwierdzonych rezerwacji
// (remis → kolejność) — sprawiedliwa rotacja bez trzymania stanu.
export function pickRoundRobinMember(
  members: CalendarMember[],
  bookings: Booking[]
): CalendarMember | null {
  if (members.length === 0) return null;
  const sorted = [...members].sort((a, b) => a.kolejnosc - b.kolejnosc);
  let best = sorted[0];
  let bestCount = Infinity;
  for (const m of sorted) {
    const count = bookings.filter(
      (b) => b.member_id === m.id && b.status === 'potwierdzona'
    ).length;
    if (count < bestCount) {
      best = m;
      bestCount = count;
    }
  }
  return best;
}

// walidacja: czy start jest poprawnym, wolnym slotem
export function isValidSlot(
  calendar: BookingCalendar,
  availability: CalendarAvailability[],
  bookings: Booking[],
  start: Date,
  now = new Date()
): boolean {
  const daySlots = slotsForDay(calendar, availability, bookings, start, now);
  return daySlots.some((s) => new Date(s.start).getTime() === start.getTime());
}

export function newCalendarSlug(nazwa: string): string {
  return (
    nazwa
      .toLowerCase()
      .replace(/[ąćęłńóśźż]/g, (c) => ({ ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' })[c] ?? c)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) + `-${Math.random().toString(36).slice(2, 6)}`
  );
}

// eksport hm dla testów spójności (nieużywane bezpośrednio w UI)
export const _internal = { hm, parseHm };
