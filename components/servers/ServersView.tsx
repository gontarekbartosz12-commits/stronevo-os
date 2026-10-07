'use client';

import { useEffect, useState } from 'react';
import { Server, ServerOverview } from '@/lib/types';
import { createServer, getServerOverview } from '@/app/actions/servers';
import ServerPanel from './ServerPanel';

// Zakładki serwerów (Serwer 1/2/...) + formularz dodania nowego VPS.
export default function ServersView({ servers: initialServers }: { servers: Server[] }) {
  const [servers, setServers] = useState(initialServers);
  const [activeId, setActiveId] = useState<string | null>(initialServers[0]?.id ?? null);
  const [overview, setOverview] = useState<ServerOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ nazwa: '', host: '', port: '22', n8n_url: '', notatka: '' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    setLoading(true);
    getServerOverview(activeId)
      .then((data) => {
        if (cancelled) return;
        setOverview(data);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Błąd pobierania serwera');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const created = await createServer({
        nazwa: form.nazwa.trim(),
        host: form.host.trim() || null,
        port: form.port.trim() === '' ? null : Number(form.port),
        notatka: form.notatka.trim() || null,
        n8n_url: form.n8n_url.trim() || null,
        n8n_api_key: null, // klucz API n8n wpina Claude przy deployu (nie z UI)
      });
      setServers((prev) => [...prev, created]);
      setActiveId(created.id);
      setAdding(false);
      setForm({ nazwa: '', host: '', port: '22', n8n_url: '', notatka: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd dodawania serwera');
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {servers.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveId(s.id)}
            className={`rounded-md border px-4 py-2 text-sm transition ${
              activeId === s.id
                ? 'border-gold-dim bg-bordo/25 font-semibold text-gold-light'
                : 'border-ink-border text-stone-400 hover:text-stone-200'
            }`}
          >
            {s.nazwa}
          </button>
        ))}
        <button
          onClick={() => setAdding((a) => !a)}
          className="rounded-md border border-dashed border-ink-border px-4 py-2 text-sm text-stone-500 transition hover:border-gold-dim hover:text-gold-light"
        >
          + Dodaj serwer
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-300">
          {error}
          <button className="ml-3 underline" onClick={() => setError(null)}>
            zamknij
          </button>
        </div>
      )}

      {adding && (
        <form onSubmit={handleAdd} className="card mb-5 grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="label">Nazwa *</label>
            <input
              required
              className="input"
              placeholder="Serwer 2 (klienci-A)"
              value={form.nazwa}
              onChange={(e) => setForm({ ...form, nazwa: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Host</label>
            <input
              className="input"
              placeholder="vps2.stronevo.pl"
              value={form.host}
              onChange={(e) => setForm({ ...form, host: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Port</label>
            <input
              type="number"
              className="input"
              value={form.port}
              onChange={(e) => setForm({ ...form, port: e.target.value })}
            />
          </div>
          <div>
            <label className="label">URL n8n (opcjonalnie)</label>
            <input
              className="input"
              placeholder="https://n8n2.stronevo.pl"
              value={form.n8n_url}
              onChange={(e) => setForm({ ...form, n8n_url: e.target.value })}
            />
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn-primary flex-1 justify-center">
              Dodaj
            </button>
            <button type="button" className="btn-ghost" onClick={() => setAdding(false)}>
              Anuluj
            </button>
          </div>
          <div className="sm:col-span-2 lg:col-span-5">
            <label className="label">Notatka / kontekst działania</label>
            <input
              className="input"
              placeholder="Do czego służy ten serwer, co na nim stoi"
              value={form.notatka}
              onChange={(e) => setForm({ ...form, notatka: e.target.value })}
            />
          </div>
        </form>
      )}

      {loading && <p className="py-10 text-center text-sm text-stone-600">Ładowanie serwera...</p>}
      {!loading && overview && <ServerPanel overview={overview} />}
      {!loading && !overview && servers.length === 0 && (
        <p className="card px-4 py-12 text-center text-stone-600">
          Brak serwerów — dodaj pierwszy przyciskiem powyżej.
        </p>
      )}
    </div>
  );
}
