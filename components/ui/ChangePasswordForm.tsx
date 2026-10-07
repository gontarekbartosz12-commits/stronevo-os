'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const supabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function ChangePasswordForm() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!supabaseConfigured) {
    return (
      <p className="text-center text-sm text-stone-400">
        Tryb demo — zmiana hasła dostępna po podpięciu Supabase.
      </p>
    );
  }

  if (done) {
    return (
      <div className="text-center">
        <p className="text-sm text-emerald-300">Hasło ustawione.</p>
        <a href="/" className="btn-primary mt-4 inline-flex justify-center">
          Przejdź do panelu
        </a>
      </div>
    );
  }

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
    setLoading(true);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: { must_change_password: false },
    });

    if (updateError) {
      setError(`Nie udało się zmienić hasła: ${updateError.message}`);
      setLoading(false);
      return;
    }
    setDone(true);
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
        {loading ? 'Zapisywanie...' : 'Ustaw hasło'}
      </button>
    </form>
  );
}
