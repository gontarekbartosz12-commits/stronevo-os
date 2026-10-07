'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const supabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!supabaseConfigured) {
    return (
      <div className="text-center">
        <p className="mb-4 text-sm text-stone-400">
          Supabase nie jest skonfigurowany — panel działa w trybie demo.
        </p>
        <button className="btn-primary w-full justify-center" onClick={() => router.push('/')}>
          Wejdź do panelu (demo)
        </button>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !data.user) {
      setError('Nieprawidłowy e-mail lub hasło.');
      setLoading(false);
      return;
    }

    // Rola (ceo / pracownik / klient) i routing na właściwy panel obsługuje
    // middleware.ts: ceo → pełny panel, pracownik → /zadania, klient → /klient
    // (z bramką opłat i wymuszoną zmianą hasła). Formularz nie blokuje ról.
    router.push('/');
    router.refresh();
  }

  // „Zapomniałem hasła" → Supabase wysyła maila z linkiem do /reset-haslo,
  // gdzie użytkownik ustawia nowe hasło (sesja recovery z URL).
  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!email) {
      setError('Podaj e-mail konta.');
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-haslo`,
    });
    setLoading(false);
    if (resetError) {
      setError(`Nie udało się wysłać linku: ${resetError.message}`);
      return;
    }
    // Neutralny komunikat (nie zdradzamy, czy konto istnieje).
    setInfo('Jeśli konto o tym adresie istnieje, wysłaliśmy link do ustawienia nowego hasła. Sprawdź skrzynkę (także SPAM).');
  }

  if (mode === 'forgot') {
    return (
      <form onSubmit={handleReset} className="space-y-4">
        <p className="text-sm text-stone-400">
          Podaj e-mail konta — wyślemy link do ustawienia nowego hasła.
        </p>
        <div>
          <label htmlFor="reset-email" className="label">
            E-mail
          </label>
          <input
            id="reset-email"
            type="email"
            required
            autoComplete="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {info && <p className="text-sm text-emerald-300">{info}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
          {loading ? 'Wysyłanie...' : 'Wyślij link resetu'}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('login');
            setError(null);
            setInfo(null);
          }}
          className="w-full text-center text-sm text-stone-500 transition hover:text-stone-300"
        >
          ← Wróć do logowania
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="label">
          E-mail
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="password" className="label">
          Hasło
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
        {loading ? 'Logowanie...' : 'Zaloguj się'}
      </button>
      <button
        type="button"
        onClick={() => {
          setMode('forgot');
          setError(null);
        }}
        className="w-full text-center text-sm text-gold-light/80 transition hover:text-gold-light"
      >
        Zapomniałem hasła
      </button>
    </form>
  );
}
