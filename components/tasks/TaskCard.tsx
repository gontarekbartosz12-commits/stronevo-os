'use client';

import { Role, Task } from '@/lib/types';

const CATEGORY_BADGE: Record<Task['kategoria'], string | null> = {
  standard: null,
  build: 'bg-gold/15 text-gold-light',
  remediation: 'bg-bordo/25 text-bordo-glow',
};

const CATEGORY_LABEL: Record<Task['kategoria'], string> = {
  standard: '',
  build: 'Build',
  remediation: 'Naprawa',
};

export default function TaskCard({
  task,
  contactName,
  role,
  onClick,
  onSubmitReview,
  onReview,
  onDispatchAgent,
}: {
  task: Task;
  contactName?: string;
  role: Role;
  onClick: () => void;
  onSubmitReview: () => void;
  onReview: (accepted: boolean) => void;
  onDispatchAgent: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/task-id', task.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={onClick}
      className="cursor-grab rounded-md border border-ink-border bg-ink-card p-3 transition hover:border-gold-dim/60 hover:bg-ink-hover active:cursor-grabbing"
    >
      <p className="text-sm font-medium leading-snug text-stone-200">{task.typ}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
        <span
          className={`rounded px-1.5 py-0.5 font-medium uppercase ${
            task.wykonawca === 'agent'
              ? 'bg-sky-900/40 text-sky-300'
              : 'bg-stone-700/40 text-stone-400'
          }`}
        >
          {task.wykonawca === 'agent' ? 'Agent' : 'Człowiek'}
        </span>
        {CATEGORY_BADGE[task.kategoria] && (
          <span className={`rounded px-1.5 py-0.5 font-medium uppercase ${CATEGORY_BADGE[task.kategoria]}`}>
            {CATEGORY_LABEL[task.kategoria]}
          </span>
        )}
        {contactName && (
          <span className="rounded bg-bordo/20 px-1.5 py-0.5 text-bordo-glow">{contactName}</span>
        )}
        {task.review_status === 'odrzucone' && (
          <span className="rounded bg-red-950/60 px-1.5 py-0.5 text-red-300">odrzucone</span>
        )}
      </div>

      {task.status === 'do_zrobienia' && task.kategoria !== 'standard' && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDispatchAgent();
          }}
          className="mt-2 w-full rounded border border-sky-800 px-2 py-1 text-[11px] text-sky-300 transition hover:bg-sky-950/40"
        >
          Uruchom agenta
        </button>
      )}

      {task.status === 'w_budowie' && task.wykonawca === 'human' && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSubmitReview();
          }}
          className="mt-2 w-full rounded border border-gold-dim/40 px-2 py-1 text-[11px] text-gold-light transition hover:bg-gold/10"
        >
          Wyślij do zatwierdzenia CEO
        </button>
      )}

      {task.status === 'do_zatwierdzenia' && role === 'ceo' && (
        <div className="mt-2 flex gap-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onReview(true);
            }}
            className="flex-1 rounded bg-emerald-900/60 px-2 py-1 text-[11px] text-emerald-200 transition hover:bg-emerald-800/60"
          >
            Akceptuj
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onReview(false);
            }}
            className="flex-1 rounded bg-red-950/60 px-2 py-1 text-[11px] text-red-300 transition hover:bg-red-900/60"
          >
            Odrzuć
          </button>
        </div>
      )}
    </div>
  );
}
