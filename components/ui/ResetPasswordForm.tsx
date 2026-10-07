'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// Ustawienie nowego hasła po kliknięciu linku „reset" z maila.
// Link niesie token recovery w URL — browser-client (detectSessionInUrl)
// wymienia go na sesję recovery i odpala event PASSWORD_RECOVERY. Dopiero
// wtedy odblokowujemy formularz (updateUser wymaga tej sesji). Strona
// /reset-haslo jest PUBLICZNA (middleware) — sesja przychodzi z URL, nie z cookie.

const supabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function ResetPasswordForm() {
  const [supabase] = useState(() => (supabaseConfigured ? createClient() : null));
  const [ready, setReady] = useState(false); // sesja recovery gotowa
  const [checked, setChecked] = useState(false); // zakończono sprawdzanie linku
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setChecked(true);
      return;
    }
    // 1) nasłuch zdarzenia recovery (detectSessionInUrl przetworzy hash)
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setReady(true);
      setChecked(true);
    });
    // 2) fallback: sesja mogła już powstać zanim podpięliśmy listener
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
      setChecked(true);
    });
    // 3) po 4s przestań udawać, że ładujemy (link wygasły/nieprawidłowy)
    const t = setTimeout(() => setChecked(true), 4000);
    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(t);
    };
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 10) {
      setError('Hasło musi mieć co najmniej 10 znaków.');
      return;
    }
    if (password !== confirm) {
      setError('Hasła nie są identyczne.');
      return;
    }
    if (!supabase) return;
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: { must_change_password: false },
    });
    if (updateError) {
      setError(`Nie udało się ustawić hasła: ${updateError.message}`);
      setLoading(false);
      return;
    }
    setDone(true);
  }

  if (!supabaseConfigured) {
    return <p className="text-center text-sm text-stone-400">Tryb demo — reset hasła po podpięciu Supabase.</p>;
  }

  if (done) {
    return (
      <div className="text-center">
        <p className="text-sm text-emerald-300">Hasło ustawione. Możesz się zalogować.</p>
        <a href="/login" className="btn-primary mt-4 inline-flex justify-center">
          Przejdź do logowania
        </a>
      </div>
    );
  }

  if (!checked) {
    return <p className="text-center text-sm text-stone-400">Weryfikuję link resetu...</p>;
  }

  if (!ready) {
    return (
      <div className="text-center">
        <p className="text-sm text-red-400">
          Link resetu jest nieprawidłowy lub wygasł.
        </p>
        <a href="/login" className="mt-3 inline-block text-sm text-gold-light underline">
          Poproś o nowy link na ekranie logowania
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="new-password" className="label">
          Nowe hasło (min. 10 znaków)
        </label>
        <input
          id="new-password"
          type="password"
          required
          autoComplete="new-password"
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="confirm-password" className="label">
          Powtórz hasło
        </label>
        <input
          id="confirm-password"
          type="password"
          required
          autoComplete="new-password"
          className="input"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
        {loading ? 'Zapisywanie...' : 'Ustaw nowe hasło'}
      </button>
    </form>
  );
}
