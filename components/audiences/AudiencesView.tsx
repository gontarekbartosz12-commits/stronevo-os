'use client';

import { useState } from 'react';
import { AudienceSegment } from '@/lib/types';
import { PushSegmentResult, SegmentInfo, pushSegmentToMeta } from '@/app/actions/audiences';

// Wybór segmentu i wysyłka do Meta Custom Audiences (stub bez META_TOKEN).
export default function AudiencesView({ segments }: { segments: SegmentInfo[] }) {
  const [selected, setSelected] = useState<AudienceSegment | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PushSegmentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = segments.find((s) => s.segment === selected) ?? null;

  async function handlePush() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await pushSegmentToMeta(selected));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd wysyłki segmentu');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {segments.map((s) => (
          <button
            key={s.segment}
            onClick={() => {
              setSelected(s.segment);
              setResult(null);
            }}
            className={`card p-5 text-left transition ${
              selected === s.segment
                ? 'border-gold-dim bg-ink-hover'
                : 'hover:border-gold-dim/50'
            }`}
          >
            <p className="font-serif text-lg font-bold text-stone-100">{s.label}</p>
            <p className="mt-1 text-sm text-stone-400">{s.opis}</p>
            <p className="mt-3 font-serif text-3xl font-bold text-gold">{s.liczba}</p>
            <p className="text-xs text-stone-500">
              kontaktów · {s.zDanymi} z e-mailem/telefonem (wysyłalne)
            </p>
          </button>
        ))}
      </div>

      {active && (
        <div className="card mt-5 flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-sm text-stone-300">
              Segment: <span className="font-semibold text-gold-light">{active.label}</span> —{' '}
              {active.zDanymi} z {active.liczba} kontaktów trafi do audiencji (reszta bez
              e-maila/telefonu).
            </p>
            <p className="mt-1 text-xs text-stone-500">
              Dane osobowe są hashowane SHA-256 przed wysyłką (wymóg Meta). Bez META_TOKEN wysyłka
              działa w trybie mock.
            </p>
          </div>
          <button className="btn-primary" disabled={busy || active.zDanymi === 0} onClick={handlePush}>
            {busy ? 'Wysyłanie...' : 'Wyślij segment do Meta Custom Audiences'}
          </button>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-md border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {result && (
        <div
          className={`mt-4 rounded-md border px-4 py-3 text-sm ${
            result.source === 'live'
              ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
              : 'border-gold-dim/40 bg-gold/5 text-gold-light'
          }`}
        >
          {result.source === 'live' ? (
            <>
              Audiencja <strong>{result.audienceName}</strong> wysłana do Meta: {result.wyslanych}{' '}
              rekordów ({result.pominietych} pominiętych — brak danych kontaktowych).
            </>
          ) : (
            <>
              Tryb mock (brak META_TOKEN): audiencja <strong>{result.audienceName}</strong>{' '}
              przygotowana — {result.wyslanych} zahashowanych rekordów, {result.pominietych}{' '}
              pominiętych. Po wpięciu tokena ta sama akcja wyśle dane do Meta.
            </>
          )}
        </div>
      )}
    </div>
  );
}
