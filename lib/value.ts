import { CallWithMeta } from './types';

// PANEL WARTOŚCI — silnik wyceny Ekranu Kasy.
//
// Zasada: wszystkie kwoty to SZACUNKI KONSERWATYWNE. Umówienie ≠ zrealizowana
// wizyta, dlatego każdą wycenę mnożymy przez współczynnik 0.6–0.7
// (VALUE_CONSERVATIVE_FACTOR, domyślnie 0.65) — celowo zaniżamy, żeby liczby
// pokazywane klientowi były nie do podważenia.

export function conservativeFactor(): number {
  const raw = Number(process.env.VALUE_CONSERVATIVE_FACTOR);
  if (!Number.isFinite(raw)) return 0.65;
  return Math.min(0.7, Math.max(0.6, raw));
}

export const DEFAULT_VISIT_VALUE = 150; // zł — gdy CEO nie ustawił wartości wizyty

export interface DayValue {
  data: string; // ISO date
  umowienia: number;
  wartosc: number; // zł, po współczynniku
}

export interface ValueStats {
  okresDni: number;
  wartoscWizyty: number;
  wspolczynnik: number;
  // Ekran Kasy
  umowionePoGodzinach: number; // "byś nie odebrał, Ada umówiła"
  odzyskane: number; // zł = umówione po godzinach × wartość × współczynnik
  straconePoGodzinach: CallWithMeta[]; // nieumówione po godzinach = stracone leady
  zagrozone: number; // zł — wycena straconych (do odzyskania follow-upem)
  umowioneRazem: number;
  wartoscUmowionychRazem: number; // zł, cały okres, po współczynniku
  // Kalendarz Kasy
  kalendarz: DayValue[];
}

export function computeValueStats(
  calls: CallWithMeta[],
  wartoscWizyty: number | null
): ValueStats {
  const factor = conservativeFactor();
  const value = wartoscWizyty ?? DEFAULT_VISIT_VALUE;

  const umowione = calls.filter((c) => c.wynik === 'umowiono');
  const umowionePoGodz = umowione.filter((c) => c.poGodzinach);
  const straconePoGodz = calls.filter((c) => c.poGodzinach && c.wynik === 'nieumowiono');

  // Kalendarz Kasy: wartość umówień per dzień (ostatnie 14 dni, także dni bez umówień)
  const byDay = new Map<string, number>();
  for (const c of umowione) {
    const key = c.czas.slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }
  const kalendarz: DayValue[] = [];
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const n = byDay.get(key) ?? 0;
    kalendarz.push({ data: key, umowienia: n, wartosc: Math.round(n * value * factor) });
  }

  return {
    okresDni: 14,
    wartoscWizyty: value,
    wspolczynnik: factor,
    umowionePoGodzinach: umowionePoGodz.length,
    odzyskane: Math.round(umowionePoGodz.length * value * factor),
    straconePoGodzinach: straconePoGodz,
    zagrozone: Math.round(straconePoGodz.length * value * factor),
    umowioneRazem: umowione.length,
    wartoscUmowionychRazem: Math.round(umowione.length * value * factor),
    kalendarz,
  };
}
