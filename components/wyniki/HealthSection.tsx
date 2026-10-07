'use client';

import { useState } from 'react';
import { createRemediationTask } from '@/app/actions/wyniki';
import { setWorkflowErrorStatus } from '@/app/actions/errors';
import { AutomationRollup } from '@/lib/wyniki';
import {
  CLIENT_AUTOMATION_STATUS_LABELS,
  WORKFLOW_ERROR_STATUS_LABELS,
  WorkflowError,
} from '@/lib/types';
import HealthDot from './HealthDot';

function fmtDateTime(iso: string | null): string {
  if (!iso) return 'brak zdarzeń';
  return new Date(iso).toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// „Zdrowie wdrożeń" — automatyzacje z last-run i REALNYMI błędami z
// workflow_errors (globalny Error-Workflow n8n → /api/errors/ingest).
// Czerwone na górze. Akcje: zadanie remediacji + oznaczenie błędu rozwiązanym.
export default function HealthSection({
  rollups,
  errors = [],
}: {
  rollups: AutomationRollup[];
  errors?: WorkflowError[];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);

  const errorsByCa = new Map<string, WorkflowError[]>();
  for (const e of errors) {
    if (!e.client_automation_id || e.status === 'rozwiazany') continue;
    if (resolved.has(e.id)) continue;
    const list = errorsByCa.get(e.client_automation_id) ?? [];
    list.push(e);
    errorsByCa.set(e.client_automation_id, list);
  }
  const orphanErrors = errors.filter(
    (e) => !e.client_automation_id && e.status !== 'rozwiazany' && !resolved.has(e.id)
  );

  async function handleRemediation(r: AutomationRollup) {
    setBusy(r.ca.id);
    setMessage(null);
    try {
      const msg = await createRemediationTask(
        r.ca.id,
        r.nazwa,
        r.klient?.firma ?? r.klient?.imie ?? null,
        r.ca.contact_id
      );
      setDone((prev) => new Set(prev).add(r.ca.id));
      setMessage(msg);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Błąd tworzenia zadania');
    } finally {
      setBusy(null);
    }
  }

  async function handleResolve(errorId: string) {
    setBusy(errorId);
    setMessage(null);
    try {
      setMessage(await setWorkflowErrorStatus(errorId, 'rozwiazany'));
      setResolved((prev) => new Set(prev).add(errorId));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Błąd zapisu statusu');
    } finally {
      setBusy(null);
    }
  }

  function renderError(e: WorkflowError) {
    return (
      <div
        key={e.id}
        className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-bordo/40 bg-bordo/10 px-3 py-2"
      >
        <div className="min-w-0">
          <p className="text-xs text-stone-200">
            <span className="font-semibold text-bordo-glow">
              {WORKFLOW_ERROR_STATUS_LABELS[e.status]}
            </span>{' '}
            · {e.message}
          </p>
          <p className="text-[11px] text-stone-500">
            {fmtDateTime(e.created_at)}
            {e.node && <> · node: {e.node}</>}
            {e.workflow_id && <> · wf: {e.workflow_id}</>}
          </p>
        </div>
        <button
          disabled={busy === e.id}
          onClick={() => handleResolve(e.id)}
          className="rounded border border-ink-border px-2.5 py-1 text-[11px] text-stone-300 transition hover:border-gold-dim hover:text-gold-light disabled:opacity-50"
        >
          {busy === e.id ? 'Zapisywanie...' : 'Rozwiązany ✓'}
        </button>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <h3 className="mb-1 font-serif text-lg font-bold text-stone-200">Zdrowie wdrożeń</h3>
      <p className="mb-4 text-xs text-stone-500">
        OK = zdarzenie w ostatnich 48 h i brak otwartego błędu · uwaga = cisza 2–7 dni lub błąd
        w tygodniu · błąd = cisza &gt;7 dni lub nierozwiązany błąd. Błędy spływają na żywo
        z globalnego Error-Workflow n8n.
      </p>

      {message && (
        <div className="mb-3 rounded-md border border-gold-dim/40 bg-gold/5 px-4 py-2 text-sm text-gold-light">
          {message}
          <button className="ml-3 underline" onClick={() => setMessage(null)}>
            zamknij
          </button>
        </div>
      )}

      {rollups.length === 0 ? (
        <p className="py-4 text-center text-sm text-stone-600">Brak wdrożeń do monitorowania.</p>
      ) : (
        <ul className="divide-y divide-ink-border/60">
          {rollups.map((r) => {
            const alert = r.health === 'blad' || r.health === 'uwaga';
            const caErrors = errorsByCa.get(r.ca.id) ?? [];
            return (
              <li key={r.ca.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <HealthDot status={r.health} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-stone-200">
                        {r.nazwa}
                        <span className="ml-2 text-xs text-stone-500">
                          {r.klient?.firma ?? r.klient?.imie ?? '—'}
                        </span>
                      </p>
                      <p className="text-xs text-stone-500">
                        ostatnie zdarzenie: {fmtDateTime(r.lastEventAt)} · 30 dni: {r.zdarzenia30d}{' '}
                        zdarzeń
                        {caErrors.length > 0 && (
                          <span className="text-bordo-glow">
                            {' '}
                            · otwarte błędy: {caErrors.length}
                          </span>
                        )}
                        {r.ca.status !== 'active' && (
                          <span> · {CLIENT_AUTOMATION_STATUS_LABELS[r.ca.status]}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  {alert &&
                    (done.has(r.ca.id) ? (
                      <span className="text-xs text-stone-500">zadanie utworzone ✓</span>
                    ) : (
                      <button
                        disabled={busy === r.ca.id}
                        onClick={() => handleRemediation(r)}
                        className="rounded border border-bordo/60 px-3 py-1.5 text-xs text-bordo-glow transition hover:bg-bordo/15 disabled:opacity-50"
                      >
                        {busy === r.ca.id ? 'Tworzenie...' : 'Utwórz zadanie remediacji'}
                      </button>
                    ))}
                </div>
                {caErrors.map(renderError)}
              </li>
            );
          })}
        </ul>
      )}

      {orphanErrors.length > 0 && (
        <div className="mt-4 border-t border-ink-border pt-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-stone-500">
            Błędy bez przypisanego wdrożenia
          </p>
          {orphanErrors.map(renderError)}
        </div>
      )}
    </div>
  );
}
