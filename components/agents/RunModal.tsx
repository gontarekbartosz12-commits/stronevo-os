'use client';

import { AgentRunWithTask } from '@/app/actions/agents';

// Widok agenta: log kroków + output/diff + decyzje.
// "Zatwierdź → deploy" ustawia zadanie na Zatwierdzone; faktyczny deploy
// wykonuje Claude/playbook, po czym "Oznacz wdrożone" domyka cykl.
export default function RunModal({
  run,
  busy,
  onClose,
  onApprove,
  onReject,
  onEscalate,
  onMarkDeployed,
  onMoreAgents,
}: {
  run: AgentRunWithTask;
  busy: boolean;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onEscalate: () => void;
  onMarkDeployed: () => void;
  onMoreAgents: () => void;
}) {
  const reviewable = run.status === 'done' && run.wynik_review === 'oczekuje';
  const approved = run.wynik_review === 'zaakceptowane';
  const deployPending = approved && run.task?.status === 'zatwierdzone';

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card my-8 w-full max-w-2xl p-6 shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl font-bold leading-snug text-stone-100">
              {run.task?.typ ?? run.task_id}
            </h2>
            <p className="mt-1 text-xs text-stone-500">
              {run.agent} · run {run.id} · status: {run.status}
              {run.koszt > 0 && <> · koszt {run.koszt} zł</>}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-stone-500 transition hover:text-stone-200"
            aria-label="Zamknij"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <p className="label">Log kroków agenta</p>
        <div className="mb-4 max-h-56 overflow-y-auto rounded-md border border-ink-border bg-ink p-3 font-mono text-xs leading-relaxed text-stone-400">
          {run.log.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
          {run.status === 'running' && <p className="animate-pulse text-gold-light">▍ agent pracuje...</p>}
        </div>

        <p className="label">Output / diff (kod, JSON)</p>
        <pre className="mb-4 max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-ink-border bg-ink p-3 font-mono text-xs text-stone-300">
          {run.output ?? '— brak outputu (run w toku) —'}
        </pre>

        <div className="flex flex-wrap justify-end gap-2">
          <button className="btn-ghost" disabled={busy} onClick={onMoreAgents}>
            Dorzuć agenta
          </button>
          {reviewable && (
            <>
              <button className="btn-ghost" disabled={busy} onClick={onEscalate}>
                Wyślij do Claude do weryfikacji
              </button>
              <button
                className="rounded-md bg-red-950 px-4 py-2 text-sm text-red-300 transition hover:bg-red-900 disabled:opacity-50"
                disabled={busy}
                onClick={onReject}
              >
                Odrzuć
              </button>
              <button className="btn-primary" disabled={busy} onClick={onApprove}>
                Zatwierdź → deploy
              </button>
            </>
          )}
          {run.wynik_review === 'eskalowane_claude' && (
            <button className="btn-primary" disabled={busy} onClick={onApprove}>
              Zatwierdź → deploy (po review Claude)
            </button>
          )}
          {deployPending && (
            <button
              className="rounded-md bg-emerald-900 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-800 disabled:opacity-50"
              disabled={busy}
              onClick={onMarkDeployed}
            >
              Oznacz wdrożone ✓
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
