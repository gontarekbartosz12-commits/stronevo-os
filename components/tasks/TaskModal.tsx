'use client';

import { useState } from 'react';
import { Role, TASK_STATUS_LABELS, Task } from '@/lib/types';

// Szczegóły zadania: diff (opis wykonanej pracy) do edycji przez pracownika
// i review przez CEO.
export default function TaskModal({
  task,
  contactName,
  role,
  onClose,
  onSaveDiff,
  onSubmitReview,
  onReview,
}: {
  task: Task;
  contactName?: string;
  role: Role;
  onClose: () => void;
  onSaveDiff: (diff: string) => void;
  onSubmitReview: () => void;
  onReview: (accepted: boolean) => void;
}) {
  const [diff, setDiff] = useState(task.diff ?? '');

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card my-8 w-full max-w-xl p-6 shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl font-bold leading-snug text-stone-100">
              {task.typ}
            </h2>
            <p className="mt-1 text-xs text-stone-500">
              {TASK_STATUS_LABELS[task.status]}
              {contactName && <> · {contactName}</>} · wykonawca:{' '}
              {task.wykonawca === 'agent' ? 'agent' : 'człowiek'}
              {task.review_status && <> · review: {task.review_status}</>}
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

        <label className="label">Wykonana praca / diff (do review CEO)</label>
        <textarea
          rows={7}
          className="input resize-y font-mono text-xs"
          placeholder="Co zostało zrobione, gdzie, jakie zmiany — podstawa do zatwierdzenia."
          value={diff}
          onChange={(e) => setDiff(e.target.value)}
        />

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button className="btn-ghost" onClick={() => onSaveDiff(diff)}>
            Zapisz opis
          </button>
          {task.status === 'w_budowie' && (
            <button
              className="btn-primary"
              onClick={() => {
                onSaveDiff(diff);
                onSubmitReview();
                onClose();
              }}
            >
              Wyślij do zatwierdzenia CEO
            </button>
          )}
          {task.status === 'do_zatwierdzenia' && role === 'ceo' && (
            <>
              <button
                className="rounded-md bg-red-950 px-4 py-2 text-sm text-red-300 transition hover:bg-red-900"
                onClick={() => {
                  onReview(false);
                  onClose();
                }}
              >
                Odrzuć
              </button>
              <button
                className="rounded-md bg-emerald-900 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-800"
                onClick={() => {
                  onReview(true);
                  onClose();
                }}
              >
                Akceptuj — gotowe
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
