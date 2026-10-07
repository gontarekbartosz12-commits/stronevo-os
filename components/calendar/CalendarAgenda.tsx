'use client';

import { useMemo, useState } from 'react';
import { CalendarEntry, assignOwner } from '@/app/actions/calendar';
import { STATUS_COLORS, STATUS_LABELS } from '@/lib/types';

function dayLabel(iso: string): { label: string; overdue: boolean; today: boolean } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${iso}T00:00:00`);
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  const nice = d.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
  if (diff < 0) return { label: `${nice} (zaległe)`, overdue: true, today: false };
  if (diff === 0) return { label: `Dziś — ${nice}`, overdue: false, today: true };
  if (diff === 1) return { label: `Jutro — ${nice}`, overdue: false, today: false };
  return { label: nice, overdue: false, today: false };
}

export default function CalendarAgenda({
  entries,
  reps: initialReps,
}: {
  entries: CalendarEntry[];
  reps: string[];
}) {
  const [reps, setReps] = useState<string[]>(initialReps);
  const [owners, setOwners] = useState<Record<string, string | null>>(
    Object.fromEntries(entries.map((e) => [e.contact_id, e.przypisany_do]))
  );
  const [newRep, setNewRep] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const g = new Map<string, CalendarEntry[]>();
    for (const e of entries) {
      if (!g.has(e.data)) g.set(e.data, []);
      g.get(e.data)!.push(e);
    }
    return [...g.entries()];
  }, [entries]);

  async function setOwner(contactId: string, value: string) {
    setBusy(contactId);
    const owner = value === 'Ty (CEO)' ? null : value;
    setOwners((o) => ({ ...o, [contactId]: owner }));
    try {
      await assignOwner(contactId, owner);
    } finally {
      setBusy(null);
    }
  }

  function addRep() {
    const r = newRep.trim();
    if (r && r !== 'Ty (CEO)' && !reps.includes(r)) setReps((prev) => [...prev, r].sort());
    setNewRep('');
  }

  if (entries.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-ink-border p-8 text-center text-sm text-stone-500">
        Brak zaplanowanych spotkań. Ustaw „Następną akcję" z datą na karcie kontaktu — pojawi się tutaj.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-ink-border bg-ink-soft px-3 py-2.5">
        <span className="text-xs text-stone-500">Handlowcy:</span>
        <span className="rounded bg-gold/15 px-2 py-0.5 text-xs text-gold-light">Ty (CEO)</span>
        {reps.map((r) => (
          <span key={r} className="rounded bg-sky-900/40 px-2 py-0.5 text-xs text-sky-300">
            {r}
          </span>
        ))}
        <input
          className="input ml-auto h-8 w-44 text-xs"
          placeholder="+ dodaj handlowca"
          value={newRep}
          onChange={(e) => setNewRep(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addRep()}
        />
        <button className="btn-ghost px-3 py-1 text-xs" onClick={addRep} disabled={!newRep.trim()}>
          Dodaj
        </button>
      </div>

      {grouped.map(([date, items]) => {
        const d = dayLabel(date);
        return (
          <div key={date}>
            <h3
              className={`mb-2 text-sm font-semibold capitalize ${
                d.overdue ? 'text-red-400' : d.today ? 'text-gold-light' : 'text-stone-300'
              }`}
            >
              {d.label} · {items.length}
            </h3>
            <ul className="space-y-2">
              {items.map((e) => (
                <li
                  key={e.contact_id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-ink-border bg-ink-soft px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-200">
                      {e.imie}
                      {e.firma && <span className="text-stone-500"> · {e.firma}</span>}
                      <span
                        className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase"
                        style={{ backgroundColor: `${STATUS_COLORS[e.status_pipeline]}22`, color: STATUS_COLORS[e.status_pipeline] }}
                      >
                        {STATUS_LABELS[e.status_pipeline]}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-stone-500">
                      {e.akcja ?? 'Spotkanie / kontakt'}
                      {e.telefon && <> · {e.telefon}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-stone-600">przydział:</span>
                    <select
                      className="input h-8 w-40 text-xs"
                      disabled={busy === e.contact_id}
                      value={owners[e.contact_id] ?? 'Ty (CEO)'}
                      onChange={(ev) => setOwner(e.contact_id, ev.target.value)}
                    >
                      <option value="Ty (CEO)">Ty (CEO)</option>
                      {reps.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
