'use client';

import { useState } from 'react';

// Przycisk płatności: start → redirect do bramki (P24/Stripe/PayU) albo —
// w trybie demo — JAWNIE oznaczona symulacja (mock provider, podpisany webhook).
export default function PayBox({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [mockMode, setMockMode] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/payments/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Błąd startu płatności');
      if (json.redirect_url) {
        window.location.href = json.redirect_url;
        return;
      }
      setMockMode(true); // demo: brak bramki → symulacja
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd');
    } finally {
      setBusy(false);
    }
  }

  async function handleMockPay() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/payments/mock-pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Błąd symulacji');
      setDone(true);
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="mt-6 rounded-xl border border-emerald-300 bg-emerald-50 p-5 text-center text-sm font-semibold text-emerald-800">
        ✓ Płatność przyjęta — odświeżam...
      </p>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      {error && <p className="text-center text-xs text-red-600">{error}</p>}
      {!mockMode ? (
        <button
          onClick={handleStart}
          disabled={busy}
          className="w-full rounded-xl bg-[#9b2242] px-6 py-3.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Łączenie z bramką...' : 'Zapłać teraz'}
        </button>
      ) : (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            Tryb demo — symulacja bramki
          </p>
          <p className="mt-1 text-[11px] text-amber-700">
            Brak skonfigurowanej bramki (P24/Stripe/PayU) — poniższy przycisk symuluje
            podpisaną notyfikację płatności.
          </p>
          <button
            onClick={handleMockPay}
            disabled={busy}
            className="mt-3 w-full rounded-xl bg-amber-600 px-6 py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Przetwarzanie...' : 'Symuluj opłacenie'}
          </button>
        </div>
      )}
    </div>
  );
}
