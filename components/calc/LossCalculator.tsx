'use client';

import { useState } from 'react';

// Aktualne ceny pakietów (netto/mc) — spójne z katalogiem 2026-07-04
const PAKIETY = [
  { nazwa: 'Starter', mc: 499 },
  { nazwa: 'Pro', mc: 699 },
  { nazwa: 'Premium', mc: 1490 },
];

const NOWY_KLIENT_RATE = 0.33; // co trzeci nieodebrany = nowy klient
const KONSERW = 0.65; // współczynnik konserwatywny (nie zawyżamy)
const TYG_NA_MC = 4.33;

const fmt = (n: number) => Math.round(n).toLocaleString('pl-PL');

function Field({
  label,
  value,
  set,
  suffix,
  min = 0,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  set: (n: number) => void;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => set(Number(e.target.value))}
          className="flex-1 accent-[#7B2D3B]"
        />
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => set(Number(e.target.value) || 0)}
            className="input w-24 text-right"
          />
          {suffix && <span className="text-xs text-stone-500">{suffix}</span>}
        </div>
      </div>
    </div>
  );
}

export default function LossCalculator() {
  const [firma, setFirma] = useState('');
  const [polaczenia, setPolaczenia] = useState(15);
  const [nieodebrane, setNieodebrane] = useState(40); // %
  const [paragon, setParagon] = useState(200); // zł
  const [noShow, setNoShow] = useState(3); // / tydzień

  const missedNowi = polaczenia * 30 * (nieodebrane / 100) * NOWY_KLIENT_RATE;
  const strataTelefony = missedNowi * paragon * KONSERW;
  const strataNoShow = noShow * TYG_NA_MC * paragon;
  const strataMc = strataTelefony + strataNoShow;
  const strataRok = strataMc * 12;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Wejście */}
        <div className="card p-5">
          <div className="mb-4">
            <label className="label">Firma klienta (opcjonalnie)</label>
            <input
              className="input"
              placeholder="np. Salon Uśmiech"
              value={firma}
              onChange={(e) => setFirma(e.target.value)}
            />
          </div>
          <div className="space-y-4">
            <Field label="Telefony dziennie" value={polaczenia} set={setPolaczenia} max={60} suffix="poł." />
            <Field label="Nieodebrane" value={nieodebrane} set={setNieodebrane} max={100} suffix="%" />
            <Field label="Średnia wartość klienta" value={paragon} set={setParagon} max={2000} step={10} suffix="zł" />
            <Field label="Nieprzyjścia (no-show) / tydzień" value={noShow} set={setNoShow} max={30} suffix="/tydz." />
          </div>
          <p className="mt-4 text-[11px] text-stone-600">
            Liczby konserwatywne: tylko co 3. nieodebrany = nowy klient, ×0,65 współczynnik ostrożności.
            To dolna granica realnej straty, nie górna.
          </p>
        </div>

        {/* Wynik */}
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-red-900/50 bg-gradient-to-br from-red-950/40 to-stone-950 p-6 text-center">
            <p className="text-xs uppercase tracking-wide text-red-300/80">
              {firma ? `${firma} traci` : 'Ta firma traci'} miesięcznie (szacunek konserwatywny)
            </p>
            <p className="mt-1 font-serif text-5xl font-bold text-red-400">{fmt(strataMc)} zł</p>
            <p className="mt-2 text-sm text-stone-400">
              to <span className="font-semibold text-red-300">{fmt(strataRok)} zł rocznie</span>, które
              dziś wyparowują
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-left text-xs">
              <div className="rounded-lg bg-stone-900/60 p-3">
                <p className="text-stone-500">Nieodebrane telefony</p>
                <p className="mt-0.5 text-lg font-bold text-stone-200">{fmt(strataTelefony)} zł/mc</p>
              </div>
              <div className="rounded-lg bg-stone-900/60 p-3">
                <p className="text-stone-500">Nieprzyjścia (no-show)</p>
                <p className="mt-0.5 text-lg font-bold text-stone-200">{fmt(strataNoShow)} zł/mc</p>
              </div>
            </div>
          </div>

          {/* ROI vs pakiety */}
          <div className="card p-5">
            <p className="mb-3 text-sm font-semibold text-stone-200">
              A ile kosztuje to naprawić? Twój zysk netto po odzyskaniu:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-border text-left text-xs uppercase tracking-wide text-stone-500">
                    <th className="py-2 pr-3 font-medium">Pakiet</th>
                    <th className="py-2 pr-3 text-right font-medium">Koszt/mc</th>
                    <th className="py-2 pr-3 text-right font-medium">Zwraca się po</th>
                    <th className="py-2 text-right font-medium">Zysk netto/mc</th>
                  </tr>
                </thead>
                <tbody>
                  {PAKIETY.map((p) => {
                    const zysk = strataMc - p.mc;
                    const wizyt = paragon > 0 ? Math.ceil(p.mc / paragon) : 0;
                    return (
                      <tr key={p.nazwa} className="border-b border-ink-border/60">
                        <td className="py-2.5 pr-3 font-medium text-stone-200">{p.nazwa}</td>
                        <td className="py-2.5 pr-3 text-right text-stone-400">{fmt(p.mc)} zł netto</td>
                        <td className="py-2.5 pr-3 text-right text-stone-400">{wizyt} wiz.</td>
                        <td
                          className={`py-2.5 text-right font-semibold ${
                            zysk > 0 ? 'text-emerald-400' : 'text-stone-500'
                          }`}
                        >
                          {zysk > 0 ? `+${fmt(zysk)} zł` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] text-stone-600">
              Ceny netto. „Zwraca się po" = ile odzyskanych wizyt pokrywa abonament. Zysk netto = strata
              miesięczna − abonament (przy pełnym odzysku szacowanej straty).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
