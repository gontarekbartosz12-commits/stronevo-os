'use client';

import { useState } from 'react';
import { TrendPoint } from '@/lib/wyniki';

// Wykres trendu (słupki dzienne: wartość ~zł + liczba zdarzeń w tooltipie).
// points = pełne 90 dni; przełącznik 30/90 tnie końcówkę. Gdy windows ma
// jeden zakres (szczegół klienta) — przełącznik znika.
export default function TrendChart({
  points,
  windows = [30, 90],
  tytul = 'Trend wyników',
}: {
  points: TrendPoint[];
  windows?: number[];
  tytul?: string;
}) {
  const [win, setWin] = useState(windows[0]);
  const visible = points.slice(-win);
  const max = Math.max(...visible.map((p) => p.wartosc), 1);
  const suma = Math.round(visible.reduce((s, p) => s + p.wartosc, 0));
  const zdarzenia = visible.reduce((s, p) => s + p.zdarzenia, 0);

  return (
    <div className="card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg font-bold text-stone-200">{tytul}</h3>
          <p className="text-xs text-stone-500">
            {zdarzenia} zdarzeń · ~{suma.toLocaleString('pl-PL')} zł w {win} dni
          </p>
        </div>
        {windows.length > 1 && (
          <div className="flex gap-1 rounded-md border border-ink-border p-0.5">
            {windows.map((w) => (
              <button
                key={w}
                onClick={() => setWin(w)}
                className={`rounded px-3 py-1 text-xs transition ${
                  win === w
                    ? 'bg-bordo/30 font-semibold text-gold-light'
                    : 'text-stone-500 hover:text-stone-300'
                }`}
              >
                {w} dni
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex h-28 items-end gap-px">
        {visible.map((p) => (
          <div
            key={p.data}
            className="group relative flex-1 rounded-t-sm transition hover:opacity-80"
            style={{
              height: `${p.wartosc > 0 ? Math.max(6, (p.wartosc / max) * 100) : 2}%`,
              backgroundColor:
                p.wartosc > 0 ? `rgba(216, 182, 119, ${0.35 + (p.wartosc / max) * 0.65})` : '#372a2d',
            }}
            title={`${new Date(p.data).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })}: ${p.zdarzenia} zdarzeń ≈ ${p.wartosc.toLocaleString('pl-PL')} zł`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-stone-600">
        <span>
          {new Date(visible[0]?.data ?? '').toLocaleDateString('pl-PL', {
            day: '2-digit',
            month: '2-digit',
          })}
        </span>
        <span>dziś</span>
      </div>
    </div>
  );
}
