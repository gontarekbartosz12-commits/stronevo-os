'use client';

import { useState } from 'react';
import {
  Contact,
  ContactInput,
  PipelineStatus,
  Server,
} from '@/lib/types';
import {
  createContact,
  deleteContact,
  moveContact,
  updateContact,
} from '@/app/actions/contacts';
import KanbanBoard from './KanbanBoard';
import ContactList from './ContactList';
import ContactModal from './ContactModal';

type ViewMode = 'kanban' | 'lista';

export default function CrmView({
  initialContacts,
  servers,
}: {
  initialContacts: Contact[];
  servers: Server[];
}) {
  const [contacts, setContacts] = useState<Contact[]>(initialContacts);
  const [view, setView] = useState<ViewMode>('kanban');
  const [selected, setSelected] = useState<Contact | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function replaceContact(updated: Contact) {
    setContacts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  async function handleMove(id: string, status: PipelineStatus) {
    const prev = contacts;
    // Optymistycznie przesuwamy kartę, rollback przy błędzie
    setContacts((cs) =>
      cs.map((c) => (c.id === id ? { ...c, status_pipeline: status } : c))
    );
    try {
      const updated = await moveContact(id, status);
      replaceContact(updated);
    } catch (e) {
      setContacts(prev);
      setError(e instanceof Error ? e.message : 'Błąd zapisu');
    }
  }

  async function handleSave(id: string, patch: Partial<ContactInput>) {
    const updated = await updateContact(id, patch);
    replaceContact(updated);
    setSelected(updated);
  }

  async function handleCreate(input: ContactInput) {
    const created = await createContact(input);
    setContacts((prev) => [created, ...prev]);
    setAdding(false);
  }

  async function handleDelete(id: string) {
    await deleteContact(id);
    setContacts((prev) => prev.filter((c) => c.id !== id));
    setSelected(null);
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-md border border-ink-border p-0.5">
          {(['kanban', 'lista'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setView(mode)}
              className={`rounded px-4 py-1.5 text-sm capitalize transition ${
                view === mode
                  ? 'bg-bordo text-stone-100'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
        <button className="btn-primary" onClick={() => setAdding(true)}>
          <span className="text-lg leading-none">+</span> Dodaj kontakt
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

      {view === 'kanban' ? (
        <KanbanBoard contacts={contacts} onMove={handleMove} onSelect={setSelected} />
      ) : (
        <ContactList contacts={contacts} onMove={handleMove} onSelect={setSelected} />
      )}

      {selected && (
        <ContactModal
          contact={selected}
          servers={servers}
          onClose={() => setSelected(null)}
          onSave={(patch) => handleSave(selected.id, patch)}
          onDelete={() => handleDelete(selected.id)}
        />
      )}

      {adding && (
        <ContactModal
          contact={null}
          servers={servers}
          onClose={() => setAdding(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}
