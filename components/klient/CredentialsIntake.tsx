'use client';

import { useState } from 'react';
import {
  CredentialsIntakeData,
  IntakeStep,
  submitCredential,
} from '@/app/actions/credentials';
import { POZYSKANIE_METODA_LABELS } from '@/lib/types';

// KROKOWY intake dostępów (Faza 1 zaufania) — jeden krok na ekranie, nie
// mega-formularz. Klient uzupełnia brakujące pozycje; wartości wracają z
// serwera WYŁĄCZNIE zamaskowane. Po komplecie provisioning odblokowuje się sam.
export default function CredentialsIntake({
  contactId,
  initial,
}: {
  contactId: string;
  initial: CredentialsIntakeData;
}) {
  const [intake, setIntake] = useState(initial);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const missing = intake.steps.filter((s) => s.status === 'oczekuje');
  const current: IntakeStep | undefined = missing[0];
  const progressPct =
    intake.wszystkie === 0 ? 100 : Math.round((intake.zebrane / intake.wszystkie) * 100);

  async function handleSubmit() {
    if (!current) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await submitCredential(contactId, current.id, value);
      setIntake(result.intake);
      setMessage(result.message);
      setValue('');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Błąd zapisu');
    } finally {
      setBusy(false);
    }
  }

  if (intake.wszystkie === 0) return null;

  return (
    <div className="card border-gold-dim/40 p-6">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-serif text-lg font-bold text-stone-100">
          Dostępy do wdrożenia — {intake.zebrane}/{intake.wszystkie} zebrane
        </h3>
        {intake.complete && <span className="text-sm text-emerald-300">komplet ✓</span>}
      </div>

      {/* Pasek postępu */}
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-ink-hover">
        <div
          className="h-full rounded-full bg-gradient-to-r from-bordo to-gold transition-all"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {message && (
        <div className="mb-4 rounded-md border border-gold-dim/40 bg-gold/5 px-4 py-2 text-sm text-gold-light">
          {message}
          <button className="ml-3 underline" onClick={() => setMessage(null)}>
            zamknij
          </button>
        </div>
      )}

      {current ? (
        <div>
          <p className="text-[11px] uppercase tracking-wider text-stone-500">
            Krok {intake.zebrane + 1} z {intake.wszystkie} · {current.automationNazwa} ·{' '}
            {POZYSKANIE_METODA_LABELS[current.metoda]}
          </p>
          <p className="mt-1.5 font-medium text-stone-100">{current.pozycja}</p>
          <p className="mt-1 text-xs text-stone-500">
            {current.metoda === 'przeslij' &&
              'Wklej poniżej link, dane lub klucz — trafiają bezpiecznie do opiekuna wdrożenia.'}
            {current.metoda === 'wideo' &&
              'To ustalamy razem na spotkaniu — jeśli już było, wpisz krótką notatkę (np. „podpięte na spotkaniu 24.06”).'}
            {current.metoda === 'poradnik' &&
              'Skorzystaj z poradnika od opiekuna i potwierdź poniżej (np. „zgody zebrane”).'}
            {current.metoda === 'sami' &&
              'To zbieramy my — jeśli już przekazałeś/aś, potwierdź krótką notatką.'}
          </p>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={2}
            placeholder="Wpisz wartość / link / potwierdzenie..."
            className="input mt-3"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-[11px] text-stone-600">
              Wartości są maskowane w panelu — pełną treść widzi tylko system STRONEVO.
            </p>
            <button
              onClick={handleSubmit}
              disabled={busy || !value.trim()}
              className="btn-primary !py-1.5 text-xs"
            >
              {busy ? 'Zapisywanie...' : missing.length === 1 ? 'Zapisz — to ostatni krok' : 'Zapisz i dalej'}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-stone-300">
          Wszystkie dostępy zebrane — wdrożenie w rękach opiekuna STRONEVO. 🎉
        </p>
      )}

      {/* Zebrane pozycje (zamaskowane) */}
      {intake.zebrane > 0 && (
        <ul className="mt-5 space-y-1.5 border-t border-ink-border pt-3">
          {intake.steps
            .filter((s) => s.status === 'otrzymano')
            .map((s) => (
              <li key={s.id} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="text-stone-400">✓ {s.pozycja}</span>
                {s.maskedValue && (
                  <span className="font-mono text-stone-600">{s.maskedValue}</span>
                )}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
