'use client';

import { useState } from 'react';
import {
  createSnapshotAction,
  deploySnapshotAction,
} from '@/app/actions/produktyzacja';
import { Contact, Snapshot } from '@/lib/types';

// SNAPSHOTY (Faza 5, operator): zrzut działającego setupu klienta X →
// wdrożenie 1-klik u klienta Y (client_automations + taski build w control-plane
// + klon golden-template n8n + szablony + wiedza bota + monitoring).

export default function SnapshotsPanel({
  snapshots,
  klienci,
}: {
  snapshots: Snapshot[];
  klienci: Contact[];
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({ contactId: '', nazwa: '' });
  const [deployTarget, setDeployTarget] = useState<Record<string, string>>({});

  async function handleCreate() {
    setBusy('create');
    setMessage(null);
    try {
      const s = await createSnapshotAction({
        contactId: createForm.contactId,
        nazwa: createForm.nazwa,
      });
      setMessage(
        `Snapshot „${s.nazwa}" utworzony: ${s.payload.automatyzacje.length} automatyzacji, ${s.payload.szablony.length} szablonów, ${s.payload.wiedza.length} dok. wiedzy, ${s.payload.uptime.length} monitorów. Odśwież stronę.`
      );
      setCreateForm({ contactId: '', nazwa: '' });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Błąd');
    } finally {
      setBusy(null);
    }
  }

  async function handleDeploy(snapshotId: string) {
    const target = deployTarget[snapshotId];
    if (!target) return;
    setBusy(snapshotId);
    setMessage(null);
    try {
      const r = await deploySnapshotAction(snapshotId, target);
      const n8n = r.n8n_klony.map((k) => `${k.nazwa}: ${k.ok ? '✓' : ''} ${k.szczegoly}`).join(' · ');
      setMessage(
        `📦 Wdrożono: ${r.automatyzacje} automatyzacji (${r.taski} tasków build dla agentów), ${r.szablony} szablonów, ${r.wiedza} dok. wiedzy (bot AI gotowy), ${r.uptime} monitorów. n8n: ${n8n}`
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Błąd wdrożenia');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-8">
      <h2 className="mb-1 font-serif text-xl font-bold text-stone-100">
        Snapshoty — produktyzacja setupów
      </h2>
      <p className="mb-4 text-sm text-stone-500">
        Zrzut działającego wdrożenia klienta → sklonuj u nowego 1 klikiem (automatyzacje + wiedza
        bota + szablony + monitoring; agenci dostają taski build w control-plane).
      </p>

      {message && (
        <div className="mb-3 rounded-md border border-gold-dim/40 bg-gold/5 px-4 py-2 text-sm text-gold-light">
          {message}
          <button className="ml-3 underline" onClick={() => setMessage(null)}>zamknij</button>
        </div>
      )}

      {/* Utwórz snapshot z klienta X */}
      <div className="card mb-4 flex flex-wrap items-center gap-2 p-4">
        <span className="text-sm font-semibold text-stone-300">Utwórz snapshot z:</span>
        <select
          className="input !w-auto !py-1.5 text-xs"
          value={createForm.contactId}
          onChange={(e) => setCreateForm({ ...createForm, contactId: e.target.value })}
        >
          <option value="">— klient źródłowy —</option>
          {klienci.map((k) => (
            <option key={k.id} value={k.id}>{k.firma ?? k.imie}</option>
          ))}
        </select>
        <input
          className="input !w-auto text-xs"
          placeholder="Nazwa snapshotu (np. Setup: usługi lokalne)"
          value={createForm.nazwa}
          onChange={(e) => setCreateForm({ ...createForm, nazwa: e.target.value })}
        />
        <button
          disabled={busy === 'create' || !createForm.contactId || !createForm.nazwa}
          onClick={handleCreate}
          className="btn-primary !py-1.5 text-xs"
        >
          {busy === 'create' ? 'Tworzenie...' : '📸 Utwórz snapshot'}
        </button>
      </div>

      {/* Lista + deploy */}
      {snapshots.length === 0 ? (
        <p className="card px-4 py-6 text-center text-sm text-stone-600">
          Brak snapshotów — utwórz pierwszy z działającego klienta.
        </p>
      ) : (
        <div className="space-y-3">
          {snapshots.map((s) => (
            <div key={s.id} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-stone-100">{s.nazwa}</p>
                  <p className="text-xs text-stone-500">
                    źródło: {s.payload.zrodlo_nazwa} · {s.payload.automatyzacje.map((a) => a.nazwa).join(', ')} ·{' '}
                    {s.payload.wiedza.length} dok. wiedzy · {s.payload.szablony.length} szablonów
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className="input !w-auto !py-1.5 text-xs"
                    value={deployTarget[s.id] ?? ''}
                    onChange={(e) => setDeployTarget({ ...deployTarget, [s.id]: e.target.value })}
                  >
                    <option value="">— wdroż u klienta —</option>
                    {klienci
                      .filter((k) => k.id !== s.payload.zrodlo_contact_id)
                      .map((k) => (
                        <option key={k.id} value={k.id}>{k.firma ?? k.imie}</option>
                      ))}
                  </select>
                  <button
                    disabled={busy === s.id || !deployTarget[s.id]}
                    onClick={() => handleDeploy(s.id)}
                    className="btn-primary !py-1.5 text-xs"
                  >
                    {busy === s.id ? 'Wdrażanie...' : '🚀 Wdroż'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
