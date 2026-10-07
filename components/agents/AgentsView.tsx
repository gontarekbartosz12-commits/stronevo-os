'use client';

import { useEffect, useState } from 'react';
import {
  AgentRunWithTask,
  approveRunAndDeploy,
  dispatchAgent,
  escalateRunToClaude,
  listAgentRuns,
  markTaskDeployed,
  rejectRun,
} from '@/app/actions/agents';
import { TASK_CATEGORY_LABELS, TASK_STATUS_LABELS } from '@/lib/types';
import RunModal from './RunModal';

const POLL_MS = 20_000;

const STATUS_BADGE: Record<string, string> = {
  running: 'border-gold-dim/40 bg-gold/10 text-gold-light animate-pulse',
  done: 'border-emerald-800 bg-emerald-950/40 text-emerald-300',
  failed: 'border-red-800 bg-red-950/40 text-red-300',
};

const REVIEW_LABEL: Record<string, string> = {
  oczekuje: 'czeka na review',
  zaakceptowane: 'zaakceptowany',
  odrzucone: 'odrzucony',
  eskalowane_claude: 'u Claude',
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Oś czasu runów agentów + review (log, output, decyzje CEO/Claude)
export default function AgentsView({
  initialRuns,
  openRunId,
}: {
  initialRuns: AgentRunWithTask[];
  openRunId: string | null;
}) {
  const [runs, setRuns] = useState(initialRuns);
  const [selected, setSelected] = useState<AgentRunWithTask | null>(
    initialRuns.find((r) => r.id === openRunId) ?? null
  );
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Polling: lazy-completion kończy "pracujące" runy po stronie serwera
  useEffect(() => {
    const interval = setInterval(() => {
      listAgentRuns().then(setRuns).catch(() => {});
    }, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setMessage(null);
    try {
      setMessage(await fn());
      setRuns(await listAgentRuns());
      setSelected(null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Błąd akcji');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {message && (
        <div className="mb-4 rounded-md border border-gold-dim/40 bg-gold/5 px-4 py-2 text-sm text-gold-light">
          {message}
          <button className="ml-3 underline" onClick={() => setMessage(null)}>
            zamknij
          </button>
        </div>
      )}

      {/* Oś czasu */}
      <div className="relative space-y-3 border-l border-ink-border pl-6">
        {runs.map((r) => (
          <div key={r.id} className="relative">
            <span
              className={`absolute -left-[1.85rem] top-4 h-3 w-3 rounded-full border-2 border-ink ${
                r.status === 'running'
                  ? 'animate-pulse bg-gold'
                  : r.status === 'done'
                    ? 'bg-emerald-500'
                    : 'bg-red-500'
              }`}
            />
            <button
              onClick={() => setSelected(r)}
              className="card w-full p-4 text-left transition hover:border-gold-dim/60"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-stone-200">{r.task?.typ ?? r.task_id}</p>
                  <p className="mt-0.5 text-xs text-stone-500">
                    {r.agent} · start {fmt(r.created_at)}
                    {r.finished_at && <> · koniec {fmt(r.finished_at)}</>}
                    {r.koszt > 0 && <> · koszt {r.koszt} zł</>}
                    {r.task && (
                      <>
                        {' '}
                        · zadanie:{' '}
                        <span className="text-stone-400">{TASK_STATUS_LABELS[r.task.status]}</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {r.task && (
                    <span className="rounded bg-ink px-1.5 py-0.5 text-[10px] uppercase text-stone-500">
                      {TASK_CATEGORY_LABELS[r.task.kategoria]}
                    </span>
                  )}
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] ${STATUS_BADGE[r.status]}`}
                  >
                    {r.status === 'running' ? 'pracuje' : r.status === 'done' ? 'zakończony' : 'błąd'}
                  </span>
                  {r.wynik_review && (
                    <span className="text-[11px] text-stone-500">
                      {REVIEW_LABEL[r.wynik_review]}
                    </span>
                  )}
                </div>
              </div>
            </button>
          </div>
        ))}
        {runs.length === 0 && (
          <p className="card px-4 py-10 text-center text-stone-600">
            Brak runów — agenci uruchamiają się z kolejki zadań (build/naprawa) albo przez
            POST /api/agent/run.
          </p>
        )}
      </div>

      {selected && (
        <RunModal
          run={selected}
          busy={busy}
          onClose={() => setSelected(null)}
          onApprove={() => run(() => approveRunAndDeploy(selected.id))}
          onReject={() => run(() => rejectRun(selected.id))}
          onEscalate={() => run(() => escalateRunToClaude(selected.id))}
          onMarkDeployed={() => run(() => markTaskDeployed(selected.task_id))}
          onMoreAgents={() => run(() => dispatchAgent(selected.task_id))}
        />
      )}
    </div>
  );
}
