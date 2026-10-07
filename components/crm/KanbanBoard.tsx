'use client';

import { useState } from 'react';
import {
  Contact,
  PIPELINE_STATUSES,
  PipelineStatus,
  STATUS_COLORS,
  STATUS_LABELS,
} from '@/lib/types';
import ContactCard from './ContactCard';

export default function KanbanBoard({
  contacts,
  onMove,
  onSelect,
}: {
  contacts: Contact[];
  onMove: (id: string, status: PipelineStatus) => void;
  onSelect: (contact: Contact) => void;
}) {
  const [dragOver, setDragOver] = useState<PipelineStatus | null>(null);

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {PIPELINE_STATUSES.map((status) => {
        const items = contacts.filter((c) => c.status_pipeline === status);
        return (
          <div
            key={status}
            className={`flex w-64 shrink-0 flex-col rounded-lg border bg-ink-soft/60 transition ${
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
              const id = e.dataTransfer.getData('text/contact-id');
              if (id) onMove(id, status);
            }}
          >
            <div
              className="flex items-center justify-between rounded-t-lg border-b border-ink-border px-3 py-2.5"
              style={{ borderTop: `3px solid ${STATUS_COLORS[status]}` }}
            >
              <span className="text-xs font-semibold uppercase tracking-wider text-stone-300">
                {STATUS_LABELS[status]}
              </span>
              <span className="rounded-full bg-ink px-2 py-0.5 text-xs text-stone-500">
                {items.length}
              </span>
            </div>
            <div className="flex min-h-[120px] flex-1 flex-col gap-2 p-2">
              {items.map((contact) => (
                <ContactCard key={contact.id} contact={contact} onClick={() => onSelect(contact)} />
              ))}
              {items.length === 0 && (
                <p className="mt-6 text-center text-xs text-stone-700">Upuść kartę tutaj</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
