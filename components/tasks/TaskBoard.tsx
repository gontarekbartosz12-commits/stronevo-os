'use client';

import { useState } from 'react';
import {
  Role,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  Task,
  TaskStatus,
} from '@/lib/types';
import {
  createTask,
  moveTask,
  reviewTask,
  submitTaskForReview,
  updateTaskDiff,
} from '@/app/actions/tasks';
import { dispatchAgent } from '@/app/actions/agents';
import TaskCard from './TaskCard';
import TaskModal from './TaskModal';

const COLUMN_COLORS: Record<TaskStatus, string> = {
  do_zrobienia: '#8a8a8a',
  w_budowie: '#d8b677',
  do_zatwierdzenia: '#b05263',
  zatwierdzone: '#7fb0d6',
  wdrozone: '#5e9c6f',
  gotowe: '#5e9c6f',
};

export default function TaskBoard({
  initialTasks,
  contactNames,
  role,
}: {
  initialTasks: Task[];
  contactNames: Record<string, string>;
  role: Role;
}) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [selected, setSelected] = useState<Task | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTyp, setNewTyp] = useState('');
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  function replace(updated: Task) {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setSelected((s) => (s?.id === updated.id ? updated : s));
  }

  async function run(fn: () => Promise<Task>) {
    try {
      replace(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd zapisu');
    }
  }

  async function handleMove(id: string, status: TaskStatus) {
    // CEO może przesuwać wszędzie; pracownik nie wrzuca sam do "gotowe"
    // ani nie omija review (kanban dopuszcza tylko jego kolumny robocze)
    if (role !== 'ceo' && (status === 'gotowe' || status === 'do_zatwierdzenia')) {
      setError('Zadanie do zatwierdzenia wysyła się przyciskiem na karcie — decyduje CEO.');
      return;
    }
    const prev = tasks;
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, status } : t)));
    try {
      const updated = await moveTask(id, status);
      replace(updated);
    } catch (e) {
      setTasks(prev);
      setError(e instanceof Error ? e.message : 'Błąd zapisu');
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (newTyp.trim() === '') return;
    try {
      // Konwencja: "zbuduj..." w opisie = zadanie buildowe dla agenta
      const isBuild = /zbuduj|provisioning/i.test(newTyp);
      const created = await createTask({
        contact_id: null,
        typ: newTyp.trim(),
        wykonawca: isBuild ? 'agent' : 'human',
        kategoria: isBuild ? 'build' : 'standard',
      });
      setTasks((prev) => [created, ...prev]);
      setNewTyp('');
      setAdding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd zapisu');
    }
  }

  async function handleDispatchAgent(taskId: string) {
    try {
      await dispatchAgent(taskId);
      setTasks((ts) =>
        ts.map((t) => (t.id === taskId ? { ...t, status: 'w_budowie', wykonawca: 'agent' } : t))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd uruchamiania agenta');
    }
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <p className="text-sm text-stone-500">{tasks.length} zadań w kolejce</p>
        <button className="btn-primary" onClick={() => setAdding(true)}>
          <span className="text-lg leading-none">+</span> Nowe zadanie
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
        <form onSubmit={handleAdd} className="card mb-4 flex gap-2 p-3">
          <input
            autoFocus
            className="input flex-1"
            placeholder="Opis zadania, np. Provisioning: Recepcja AI — Klinika Uśmiech"
            value={newTyp}
            onChange={(e) => setNewTyp(e.target.value)}
          />
          <button type="submit" className="btn-primary">
            Dodaj
          </button>
          <button type="button" className="btn-ghost" onClick={() => setAdding(false)}>
            Anuluj
          </button>
        </form>
      )}

      <div className="flex gap-3 overflow-x-auto pb-4">
        {TASK_STATUSES.map((status) => {
          const items = tasks.filter((t) => t.status === status);
          return (
            <div
              key={status}
              className={`flex w-80 shrink-0 flex-col rounded-lg border bg-ink-soft/60 transition ${
                dragOver === status ? 'border-gold-dim bg-ink-hover' : 'border-ink-border'
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(status);
              }}
              onDragLeave={() => setDragOver((s) => (s === status ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                const id = e.dataTransfer.getData('text/task-id');
                if (id) handleMove(id, status);
              }}
            >
              <div
                className="flex items-center justify-between rounded-t-lg border-b border-ink-border px-3 py-2.5"
                style={{ borderTop: `3px solid ${COLUMN_COLORS[status]}` }}
              >
                <span className="text-xs font-semibold uppercase tracking-wider text-stone-300">
                  {TASK_STATUS_LABELS[status]}
                </span>
                <span className="rounded-full bg-ink px-2 py-0.5 text-xs text-stone-500">
                  {items.length}
                </span>
              </div>
              <div className="flex min-h-[140px] flex-1 flex-col gap-2 p-2">
                {items.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    contactName={task.contact_id ? contactNames[task.contact_id] : undefined}
                    role={role}
                    onClick={() => setSelected(task)}
                    onSubmitReview={() => run(() => submitTaskForReview(task.id))}
                    onReview={(accepted) => run(() => reviewTask(task.id, accepted))}
                    onDispatchAgent={() => handleDispatchAgent(task.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {selected && (
        <TaskModal
          task={selected}
          contactName={selected.contact_id ? contactNames[selected.contact_id] : undefined}
          role={role}
          onClose={() => setSelected(null)}
          onSaveDiff={(diff) => run(() => updateTaskDiff(selected.id, diff))}
          onSubmitReview={() => run(() => submitTaskForReview(selected.id))}
          onReview={(accepted) => run(() => reviewTask(selected.id, accepted))}
        />
      )}
    </div>
  );
}
