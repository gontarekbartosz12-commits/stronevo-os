'use client';

import { useState } from 'react';
import {
  BusinessHours,
  Contact,
  ContactInput,
  DAY_KEYS,
  DAY_LABELS,
  DayKey,
} from '@/lib/types';
import { DEFAULT_HOURS } from '@/lib/business-hours';
import { fetchHoursFromGoogle } from '@/app/actions/contacts';

// <input type="time"> wymaga HH:MM — dopełniamy "9:00" → "09:00"
function pad(hhmm: string): string {
  const [h, m] = hhmm.split(':');
  return `${h.padStart(2, '0')}:${(m ?? '00').padStart(2, '0')}`;
}

// Formularz "Godziny pracy" — FUNDAMENT Ekranu Kasy: połączenie poza tymi
// godzinami = "byś nie odebrał". Ręczna edycja + auto-zaczyt z Google (stub).
export default function HoursTab({
  contact,
  onSave,
}: {
  contact: Contact;
  onSave: (patch: Partial<ContactInput>) => Promise<void>;
}) {
  const [hours, setHours] = useState<BusinessHours>(() => {
    const src = contact.business_hours ?? DEFAULT_HOURS;
    const dni = {} as BusinessHours['dni'];
    for (const key of DAY_KEYS) {
      const range = src.dni[key];
      dni[key] = range ? [pad(range[0]), pad(range[1])] : null;
    }
    return { dni, wyjatki: [...(src.wyjatki ?? [])] };
  });
  const [query, setQuery] = useState(() =>
    [contact.firma, contact.adres, contact.miasto].filter(Boolean).join(', ')
  );
  const [newException, setNewException] = useState({ data: '', opis: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function setDay(key: DayKey, range: [string, string] | null) {
    setHours((h) => ({ ...h, dni: { ...h.dni, [key]: range } }));
  }

  async function handleGoogle() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await fetchHoursFromGoogle(query.trim());
      if (result.data) {
        const dni = {} as BusinessHours['dni'];
        for (const key of DAY_KEYS) {
          const range = result.data.dni[key];
          dni[key] = range ? [pad(range[0]), pad(range[1])] : null;
        }
        setHours({ dni, wyjatki: result.data.wyjatki });
      }
      const matched = result.placeName ? ` Dopasowano: ${result.placeName}.` : '';
      setMessage(
        result.source === 'live'
          ? result.data
            ? `Godziny pobrane z Google — sprawdź i zapisz.${matched}`
            : `Google nie zwrócił godzin dla tej firmy${matched} Uzupełnij ręcznie i zapisz.`
          : 'Godziny przykładowe (Google Places nieskonfigurowany) — popraw ręcznie i zapisz.'
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Błąd pobierania z Google');
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    setBusy(true);
    setMessage(null);
    try {
      await onSave({ business_hours: hours });
      setMessage('Godziny pracy zapisane.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Błąd zapisu');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {message && (
        <div className="rounded-md border border-gold-dim/40 bg-gold/5 px-3 py-2 text-sm text-gold-light">
          {message}
        </div>
      )}

      {/* Auto-zaczyt z Google Maps po nazwie firmy + adresie */}
      <div className="flex flex-wrap items-end gap-2 rounded-md border border-ink-border bg-ink-soft p-3">
        <div className="min-w-0 flex-1">
          <label className="label">Firma + adres (szukanie w Google Maps)</label>
          <input
            className="input"
            placeholder="np. Klinika Uśmiech, ul. Zdrowa 5, Poznań"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button className="btn-ghost" disabled={busy || query.trim().length < 3} onClick={handleGoogle}>
          Pobierz z Google Maps
        </button>
      </div>

      {/* Godziny per dzień tygodnia */}
      <div className="space-y-1.5">
        {DAY_KEYS.map((key) => {
          const range = hours.dni[key];
          return (
            <div key={key} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-ink-soft">
              <label className="flex w-36 cursor-pointer items-center gap-2 text-sm text-stone-300">
                <input
                  type="checkbox"
                  checked={range !== null}
                  onChange={(e) => setDay(key, e.target.checked ? ['09:00', '18:00'] : null)}
                  className="h-4 w-4 accent-[#7B2D3B]"
                />
                {DAY_LABELS[key]}
              </label>
              {range ? (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    className="input w-32"
                    value={range[0]}
                    onChange={(e) => setDay(key, [e.target.value, range[1]])}
                  />
                  <span className="text-stone-600">—</span>
                  <input
                    type="time"
                    className="input w-32"
                    value={range[1]}
                    onChange={(e) => setDay(key, [range[0], e.target.value])}
                  />
                </div>
              ) : (
                <span className="text-sm text-stone-600">zamknięte</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Wyjątki / święta */}
      <div className="rounded-md border border-gold-dim/30 bg-gold/5 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gold-dim">
          Wyjątki / święta (dni zamknięte)
        </p>
        {hours.wyjatki.length > 0 && (
          <ul className="mb-3 space-y-1">
            {hours.wyjatki.map((w) => (
              <li key={w.data} className="flex items-center justify-between gap-2 text-sm text-stone-300">
                <span>
                  {w.data} — {w.opis || 'zamknięte'}
                </span>
                <button
                  className="text-xs text-stone-600 transition hover:text-red-400"
                  onClick={() =>
                    setHours((h) => ({ ...h, wyjatki: h.wyjatki.filter((x) => x.data !== w.data) }))
                  }
                >
                  usuń
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            className="input w-40"
            value={newException.data}
            onChange={(e) => setNewException({ ...newException, data: e.target.value })}
          />
          <input
            className="input flex-1"
            placeholder="Opis, np. Boże Narodzenie"
            value={newException.opis}
            onChange={(e) => setNewException({ ...newException, opis: e.target.value })}
          />
          <button
            className="btn-ghost"
            disabled={!newException.data}
            onClick={() => {
              setHours((h) => ({
                ...h,
                wyjatki: [
                  ...h.wyjatki.filter((x) => x.data !== newException.data),
                  { ...newException },
                ].sort((a, b) => a.data.localeCompare(b.data)),
              }));
              setNewException({ data: '', opis: '' });
            }}
          >
            Dodaj wyjątek
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        <button className="btn-primary" disabled={busy} onClick={handleSave}>
          {busy ? 'Zapisywanie...' : 'Zapisz godziny pracy'}
        </button>
      </div>
    </div>
  );
}
