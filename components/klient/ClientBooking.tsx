'use client';

import { useState } from 'react';
import type { CalendarWithMeta } from '@/app/actions/produktyzacja';
import { CALENDAR_TYPE_LABELS } from '@/lib/types';

// REZERWACJE w panelu KLIENTA (funkcja użytkowa): klient widzi SWÓJ kalendarz
// bookingu — link „umów wizytę" dla JEGO klientów (24/7) + nadchodzące rezerwacje.
// Kalendarz zakłada operator (done-for-you); brak kalendarza = teaser „w pakiecie".

export default function ClientBooking({ calendars }: { calendars: CalendarWithMeta[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  const now = Date.now();

  async function copyLink(slug: string) {
    const url = `${window.location.origin}/rezerwacja/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(slug);
      setTimeout(() => setCopied((s) => (s === slug ? null : s)), 1800);
    } catch {
      // schowek zablokowany przez przeglądarkę — link i tak jest pod „Podgląd"
    }
  }

  // Brak kalendarza = rezerwacje nie są uruchomione dla tego klienta (entitlement).
  if (calendars.length === 0) {
    return (
      <div className="card border-gold-dim/30 p-5">
        <p className="text-sm text-stone-300">
          <span className="font-semibold text-gold-light">Rezerwacje online</span> pozwalają Twoim
          klientom umawiać się samodzielnie 24/7. Kalendarz ustawia dla Ciebie opiekun STRONEVO —
          dostaniesz gotowy link, który wyślesz klientom albo wpniesz na stronę.
        </p>
        <p className="mt-2 text-xs text-stone-500">
          Chcesz uruchomić rezerwacje? Napisz do opiekuna — skonfigurujemy kalendarz pod Twoje
          godziny i usługi.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {calendars.map((c) => {
        const upcoming = c.rezerwacje
          .filter((b) => new Date(b.start).getTime() >= now)
          .sort((a, b) => a.start.localeCompare(b.start));
        return (
          <div key={c.id} className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-serif text-lg font-bold text-stone-100">{c.nazwa}</p>
                <p className="text-xs text-stone-500">
                  {CALENDAR_TYPE_LABELS[c.typ]} · {c.slot_min} min
                  {c.typ === 'class' && ` · ${c.capacity} miejsc/slot`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyLink(c.slug)}
                  className="rounded border border-gold-dim/40 px-2.5 py-1 text-[11px] text-gold-light transition hover:bg-gold/10"
                >
                  {copied === c.slug ? 'Skopiowano ✓' : 'Kopiuj link „umów wizytę"'}
                </button>
                <a
                  href={`/rezerwacja/${c.slug}`}
                  target="_blank"
                  className="rounded border border-ink-border px-2.5 py-1 text-[11px] text-stone-400 transition hover:text-stone-200"
                >
                  Podgląd →
                </a>
              </div>
            </div>

            <div className="mt-3 border-t border-ink-border pt-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                Nadchodzące rezerwacje ({upcoming.length})
              </p>
              {upcoming.length === 0 ? (
                <p className="text-sm text-stone-600">
                  Brak nadchodzących rezerwacji — udostępnij link, a klienci umówią się sami.
                </p>
              ) : (
                <ul className="divide-y divide-ink-border/60">
                  {upcoming.slice(0, 8).map((b) => (
                    <li
                      key={b.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                    >
                      <span className="text-stone-200">
                        {b.external?.imie ?? 'Rezerwacja'}
                        {b.external?.telefon && (
                          <span className="ml-2 text-xs text-stone-500">{b.external.telefon}</span>
                        )}
                      </span>
                      <span className="text-xs text-gold-light">
                        {new Date(b.start).toLocaleString('pl-PL', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'long',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
