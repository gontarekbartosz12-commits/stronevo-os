import { BusinessHours, DAY_KEYS, DayKey } from './types';

// Logika godzin pracy — FUNDAMENT "Ekranu Kasy":
// połączenie poza godzinami = "byś nie odebrał" (wartość, którą pokazujemy klientowi).

export const DEFAULT_HOURS: BusinessHours = {
  dni: {
    pon: ['9:00', '18:00'],
    wt: ['9:00', '18:00'],
    sr: ['9:00', '18:00'],
    czw: ['9:00', '18:00'],
    pt: ['9:00', '18:00'],
    sob: null,
    nd: null,
  },
  wyjatki: [],
};

// JS getDay(): 0=niedziela ... 6=sobota
const JS_DAY_TO_KEY: DayKey[] = ['nd', 'pon', 'wt', 'sr', 'czw', 'pt', 'sob'];

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function dayKeyFor(date: Date): DayKey {
  return JS_DAY_TO_KEY[date.getDay()];
}

// Czy firma jest otwarta w danym momencie (uwzględnia wyjątki/święta)
export function isOpenAt(hours: BusinessHours, date: Date): boolean {
  const iso = date.toISOString().slice(0, 10);
  if (hours.wyjatki.some((w) => w.data === iso)) return false;

  const range = hours.dni[dayKeyFor(date)];
  if (!range) return false;

  const minutes = date.getHours() * 60 + date.getMinutes();
  return minutes >= toMinutes(range[0]) && minutes < toMinutes(range[1]);
}

export function isAfterHours(hours: BusinessHours | null, date: Date): boolean {
  // Bez zdefiniowanych godzin nie flagujemy niczego (brak fundamentu = brak wniosków)
  if (!hours) return false;
  return !isOpenAt(hours, date);
}

// Godzina zamknięcia dziś (do nagłówka "Salon zamyka dziś o 18:00"); null = dziś zamknięte
export function closingTimeToday(hours: BusinessHours, now: Date = new Date()): string | null {
  const iso = now.toISOString().slice(0, 10);
  if (hours.wyjatki.some((w) => w.data === iso)) return null;
  const range = hours.dni[dayKeyFor(now)];
  return range ? range[1] : null;
}

// Waliduje strukturę z formularza/JSON-a (defensywnie przy danych z bazy)
export function normalizeBusinessHours(raw: unknown): BusinessHours | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Partial<BusinessHours>;
  if (!obj.dni) return null;
  const dni = {} as BusinessHours['dni'];
  for (const key of DAY_KEYS) {
    const val = obj.dni[key];
    dni[key] =
      Array.isArray(val) && val.length === 2 && typeof val[0] === 'string'
        ? [val[0], val[1]]
        : null;
  }
  return {
    dni,
    wyjatki: Array.isArray(obj.wyjatki)
      ? obj.wyjatki.filter((w) => w && typeof w.data === 'string')
      : [],
  };
}
