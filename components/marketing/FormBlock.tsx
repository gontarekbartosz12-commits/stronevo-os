'use client';

import { useState } from 'react';
import { FormDef } from '@/lib/types';

// Publiczny formularz (blok 'form' + embed) — POST /api/forms/submit.
// RODO: checkbox zgody POD formularzem, wymagany (bez zgody = brak wysyłki).
export default function FormBlock({ form, accent }: { form: FormDef; accent: string }) {
  const [dane, setDane] = useState<Record<string, string>>({});
  const [zgoda, setZgoda] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/forms/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form_id: form.id, dane, zgoda_rodo: zgoda }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Nie udało się wysłać.');
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się wysłać.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-6 text-center text-sm text-emerald-800">
        Dziękujemy! Zgłoszenie dotarło — odezwiemy się najszybciej, jak to możliwe.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {form.pola.map((f) => (
        <div key={f.name}>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">
            {f.label}
            {f.required && ' *'}
          </label>
          {f.typ === 'textarea' ? (
            <textarea
              required={f.required}
              rows={3}
              value={dane[f.name] ?? ''}
              onChange={(e) => setDane((d) => ({ ...d, [f.name]: e.target.value }))}
              className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:outline-none"
              style={{ borderColor: undefined }}
            />
          ) : f.typ === 'select' ? (
            <select
              required={f.required}
              value={dane[f.name] ?? ''}
              onChange={(e) => setDane((d) => ({ ...d, [f.name]: e.target.value }))}
              className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800"
            >
              <option value="">— wybierz —</option>
              {(f.options ?? []).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={f.typ}
              required={f.required}
              value={dane[f.name] ?? ''}
              onChange={(e) => setDane((d) => ({ ...d, [f.name]: e.target.value }))}
              className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:outline-none"
            />
          )}
        </div>
      ))}

      {/* Zgoda RODO — POD formularzem, wymagana */}
      <label className="flex cursor-pointer items-start gap-2 text-xs text-stone-500">
        <input
          type="checkbox"
          checked={zgoda}
          onChange={(e) => setZgoda(e.target.checked)}
          className="mt-0.5"
          required
        />
        <span>{form.zgoda_tekst} *</span>
      </label>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={busy || !zgoda}
        className="w-full rounded-md px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50"
        style={{ backgroundColor: accent }}
      >
        {busy ? 'Wysyłanie...' : 'Wyślij'}
      </button>
    </form>
  );
}
