'use client';

import { useEffect, useState } from 'react';
import {
  ClientCredential,
  CREDENTIAL_STATUS_LABELS,
  POZYSKANIE_METODA_LABELS,
} from '@/lib/types';
import { listClientCredentials, setCredential } from '@/app/actions/credentials';

function maskValue(v: string | null): string {
  if (!v) return '';
  if (v.length <= 4) return '••••';
  return `••••${v.slice(-4)}`;
}

// Zakładka "Dostępy": wymagane od klienta dane/klucze (z kompendium usługi),
// status oczekuje/otrzymano + miejsce na wartość. Komplet = deploy odblokowany.
export default function CredentialsTab({ contactId }: { contactId: string }) {
  const [creds, setCreds] = useState<ClientCredential[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listClientCredentials(contactId)
      .then((c) => !cancelled && setCreds(c))
      .catch((e) => !cancelled && setMessage(e instanceof Error ? e.message : 'Błąd pobierania'));
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  async function patch(id: string, p: { status?: 'oczekuje' | 'otrzymano'; wartosc?: string | null }) {
    setBusy(id);
    setMessage(null);
    try {
      const updated = await setCredential(id, p);
      setCreds((prev) => (prev ?? []).map((c) => (c.id === id ? updated : c)));
      setEditing(null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Błąd zapisu');
    } finally {
      setBusy(null);
    }
  }

  if (creds === null) {
    return <p className="py-8 text-center text-sm text-stone-600">Ładowanie...</p>;
  }

  const gotowe = creds.filter((c) => c.status === 'otrzymano').length;
  const komplet = creds.length > 0 && gotowe === creds.length;

  return (
    <div className="space-y-4">
      {message && (
        <div className="rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">
          {message}
        </div>
      )}

      {creds.length === 0 ? (
        <p className="py-4 text-center text-sm text-stone-600">
          Brak wymaganych dostępów. Pojawią się po przypisaniu automatyzacji (z jej kompendium).
        </p>
      ) : (
        <>
          <div
            className={`rounded-md border px-3 py-2 text-sm ${
              komplet
                ? 'border-emerald-800 bg-emerald-950/30 text-emerald-300'
                : 'border-amber-800/60 bg-amber-950/20 text-amber-300'
            }`}
          >
            {gotowe}/{creds.length} zebrane —{' '}
            {komplet
              ? 'komplet, deploy odblokowany.'
              : 'brakuje dostępów, aktywacja automatyzacji zablokowana.'}
          </div>

          <ul className="space-y-2">
            {creds.map((c) => (
              <li key={c.id} className="rounded-md border border-ink-border bg-ink-soft px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-stone-200">{c.pozycja}</p>
                    <p className="mt-0.5 text-[11px] text-stone-500">
                      Metoda: {POZYSKANIE_METODA_LABELS[c.metoda]}
                      {c.wartosc && <> · zapisane: {maskValue(c.wartosc)}</>}
                    </p>
                  </div>
                  <button
                    disabled={busy === c.id}
                    onClick={() =>
                      patch(c.id, { status: c.status === 'otrzymano' ? 'oczekuje' : 'otrzymano' })
                    }
                    className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-medium uppercase transition ${
                      c.status === 'otrzymano'
                        ? 'bg-emerald-900/40 text-emerald-300 hover:bg-emerald-900/60'
                        : 'bg-amber-900/40 text-amber-300 hover:bg-amber-900/60'
                    }`}
                  >
                    {CREDENTIAL_STATUS_LABELS[c.status]}
                  </button>
                </div>

                {editing === c.id ? (
                  <div className="mt-2 flex gap-2">
                    <input
                      className="input flex-1 text-xs"
                      placeholder="Klucz / login / notatka (przechowywane, maskowane w widoku)"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                    />
                    <button
                      className="btn-primary px-3 py-1 text-xs"
                      disabled={busy === c.id}
                      onClick={() => patch(c.id, { wartosc: draft || null, status: 'otrzymano' })}
                    >
                      Zapisz
                    </button>
                    <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditing(null)}>
                      Anuluj
                    </button>
                  </div>
                ) : (
                  <button
                    className="mt-1.5 text-[11px] text-gold-dim hover:underline"
                    onClick={() => {
                      setEditing(c.id);
                      setDraft(c.wartosc ?? '');
                    }}
                  >
                    {c.wartosc ? 'Zmień wartość' : '+ Wklej klucz/notatkę'}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-stone-600">
            Uwaga: wartości przechowywane w bazie (RLS: tylko CEO), w widoku maskowane. Szyfrowanie
            at-rest = hardening na później.
          </p>
        </>
      )}
    </div>
  );
}
