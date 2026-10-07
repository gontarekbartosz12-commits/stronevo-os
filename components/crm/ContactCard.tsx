'use client';

import { Contact, TYPE_LABELS } from '@/lib/types';

const TYPE_STYLES: Record<Contact['typ'], string> = {
  lead: 'bg-stone-700/40 text-stone-400',
  prospekt: 'bg-gold/15 text-gold-light',
  klient: 'bg-emerald-900/40 text-emerald-300',
};

function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dateStr) < today;
}

export default function ContactCard({
  contact,
  onClick,
}: {
  contact: Contact;
  onClick: () => void;
}) {
  const overdue = isOverdue(contact.nastepna_akcja_data);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/contact-id', contact.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={onClick}
      className="cursor-grab rounded-md border border-ink-border bg-ink-card p-3 transition hover:border-gold-dim/60 hover:bg-ink-hover active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-stone-200">{contact.imie}</p>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${TYPE_STYLES[contact.typ]}`}>
          {TYPE_LABELS[contact.typ]}
        </span>
      </div>
      {contact.firma && <p className="mt-0.5 truncate text-xs text-stone-400">{contact.firma}</p>}
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-stone-600">
        {contact.miasto && <span>{contact.miasto}</span>}
        {contact.branza && <span className="truncate">{contact.branza}</span>}
      </div>
      {contact.nastepna_akcja && (
        <div
          className={`mt-2 rounded border-l-2 px-2 py-1 text-[11px] ${
            overdue
              ? 'border-red-500 bg-red-950/30 text-red-300'
              : 'border-gold-dim bg-ink px-2 text-stone-400'
          }`}
        >
          {contact.nastepna_akcja}
          {contact.nastepna_akcja_data && (
            <span className="ml-1 opacity-70">({contact.nastepna_akcja_data})</span>
          )}
        </div>
      )}
    </div>
  );
}
