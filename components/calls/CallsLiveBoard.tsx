'use client';

import { useCallback, useEffect, useState } from 'react';
import { CallWithMeta } from '@/lib/types';
import { CallsBoardData, getCallsBoard } from '@/app/actions/calls';

const POLL_MS = 20_000;

// RODO: pełny numer widzi tylko właściciel firmy (panel klienta = administrator
// danych dzwoniących). W panelu CEO STRONEVO (procesor) numer maskowany.
function maskNumber(numer: string): string {
  const digits = numer.replace(/\s/g, '');
  if (digits.length < 9) return numer;
  return `${numer.slice(0, Math.ceil(numer.length / 2))}••• ${numer.slice(-3)}`;
}

function timeHM(iso: string): string {
  return new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}

function dayLabel(iso: string): string {
  const today = new Date().toISOString().slice(0, 10);
  if (iso.slice(0, 10) === today) return 'dziś';
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  if (iso.slice(0, 10) === yesterday) return 'wczoraj';
  return new Date(iso).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
}

// Live dashboard połączeń (Ada/chatbot) — wspólny dla karty klienta w CRM
// i panelu klienta. Fundament "Ekranu Kasy": jawnie flaguje połączenia
// poza godzinami pracy ("byś nie odebrał").
export default function CallsLiveBoard({
  contactId,
  maskNumbers,
}: {
  contactId: string;
  maskNumbers: boolean;
}) {
  const [data, setData] = useState<CallsBoardData | null>(null);
  const [onlyAfterHours, setOnlyAfterHours] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    getCallsBoard(contactId)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Błąd pobierania połączeń'));
  }, [contactId]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  if (error) {
    return <div className="rounded-md border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</div>;
  }
  if (!data) {
    return <p className="py-6 text-center text-sm text-stone-600">Ładowanie połączeń...</p>;
  }

  const num = (n: string) => (maskNumbers ? maskNumber(n) : n);
  const visible = onlyAfterHours ? data.calls.filter((c) => c.poGodzinach) : data.calls;
  const afterHoursCount = data.calls.filter((c) => c.poGodzinach).length;

  return (
    <div className="space-y-3">
      {/* Nagłówek kontekstowy */}
      <div className="rounded-md border border-gold-dim/30 bg-gold/5 px-4 py-3">
        {!data.hoursDefined ? (
          <p className="text-sm text-stone-400">
            {maskNumbers
              ? 'Brak godzin pracy tej firmy — uzupełnij je w karcie klienta (zakładka „Godziny"), aby liczyć połączenia po godzinach.'
              : 'Godziny pracy Twojej firmy ustawia opiekun STRONEVO — bez nich nie policzymy, które telefony wpadły „po godzinach".'}
          </p>
        ) : (
          <>
            <p className="text-sm font-medium text-gold-light">
              {data.zamkniecieDzis
                ? `Firma zamyka dziś o ${data.zamkniecieDzis}`
                : 'Firma jest dziś zamknięta'}
              {data.dzisPoGodzinach.length > 0 && ' — dziś po godzinach:'}
            </p>
            {data.dzisPoGodzinach.length > 0 && (
              <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-300">
                {data.dzisPoGodzinach.map((c) => (
                  <span key={c.id}>
                    {timeHM(c.czas)} {num(c.numer)}{' '}
                    {c.wynik === 'umowiono' ? (
                      <span className="text-emerald-400">✓ umówiono</span>
                    ) : (
                      <span className="text-stone-500">— bez rezerwacji</span>
                    )}
                  </span>
                ))}
              </p>
            )}
          </>
        )}
      </div>

      {/* Pasek narzędzi */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-400">
          <input
            type="checkbox"
            checked={onlyAfterHours}
            onChange={(e) => setOnlyAfterHours(e.target.checked)}
            className="h-4 w-4 accent-[#7B2D3B]"
          />
          Tylko po godzinach ({afterHoursCount})
        </label>
        <span className="text-[11px] text-stone-600">
          {data.source === 'mock' ? 'dane przykładowe (mock) · ' : ''}
          odświeżono {timeHM(data.odswiezono)} · auto co {POLL_MS / 1000}s
        </span>
      </div>

      {/* Lista połączeń */}
      <div className="card divide-y divide-ink-border/60">
        {visible.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
            <div className="flex items-center gap-3">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  c.wynik === 'umowiono' ? 'bg-emerald-400' : 'bg-stone-600'
                }`}
              />
              <span className="font-mono text-sm text-stone-200">{num(c.numer)}</span>
              <span className="text-xs text-stone-500">
                {dayLabel(c.czas)} {timeHM(c.czas)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {c.poGodzinach && (
                <span className="rounded-full border border-bordo/60 bg-bordo/20 px-2 py-0.5 text-[10px] font-semibold uppercase text-bordo-glow">
                  Po godzinach
                </span>
              )}
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${
                  c.zrodlo === 'ada' ? 'bg-gold/15 text-gold-light' : 'bg-sky-900/40 text-sky-300'
                }`}
              >
                {c.zrodlo === 'ada' ? 'Ada' : 'Chatbot'}
              </span>
              <span
                className={`w-24 text-right text-xs ${
                  c.wynik === 'umowiono' ? 'text-emerald-300' : 'text-stone-500'
                }`}
              >
                {c.wynik === 'umowiono' ? '✓ umówiono' : 'nieumówiono'}
              </span>
            </div>
          </div>
        ))}
        {visible.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-stone-600">
            {onlyAfterHours ? 'Brak połączeń po godzinach.' : 'Brak połączeń.'}
          </p>
        )}
      </div>
    </div>
  );
}
