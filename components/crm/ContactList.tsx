'use client';

import {
  Contact,
  PIPELINE_STATUSES,
  PipelineStatus,
  STATUS_COLORS,
  STATUS_LABELS,
  TYPE_LABELS,
} from '@/lib/types';

export default function ContactList({
  contacts,
  onMove,
  onSelect,
}: {
  contacts: Contact[];
  onMove: (id: string, status: PipelineStatus) => void;
  onSelect: (contact: Contact) => void;
}) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead>
          <tr className="border-b border-ink-border text-[11px] uppercase tracking-wider text-stone-500">
            <th className="px-4 py-3">Kontakt</th>
            <th className="px-4 py-3">Typ</th>
            <th className="px-4 py-3">Miasto</th>
            <th className="px-4 py-3">Telefon</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Następna akcja</th>
            <th className="px-4 py-3">Ost. kontakt</th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((c) => (
            <tr
              key={c.id}
              className="cursor-pointer border-b border-ink-border/60 transition hover:bg-ink-hover"
              onClick={() => onSelect(c)}
            >
              <td className="px-4 py-3">
                <p className="font-medium text-stone-200">{c.imie}</p>
                {c.firma && <p className="text-xs text-stone-500">{c.firma}</p>}
              </td>
              <td className="px-4 py-3 text-stone-400">{TYPE_LABELS[c.typ]}</td>
              <td className="px-4 py-3 text-stone-400">{c.miasto ?? '—'}</td>
              <td className="px-4 py-3 text-stone-400">{c.telefon ?? '—'}</td>
              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                <select
                  value={c.status_pipeline}
                  onChange={(e) => onMove(c.id, e.target.value as PipelineStatus)}
                  className="rounded border border-ink-border bg-ink-soft px-2 py-1 text-xs"
                  style={{ color: STATUS_COLORS[c.status_pipeline] }}
                >
                  {PIPELINE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-4 py-3 text-xs text-stone-400">
                {c.nastepna_akcja ?? '—'}
                {c.nastepna_akcja_data && (
                  <span className="ml-1 text-stone-600">({c.nastepna_akcja_data})</span>
                )}
              </td>
              <td className="px-4 py-3 text-xs text-stone-500">
                {c.data_ostatniego_kontaktu ?? '—'}
              </td>
            </tr>
          ))}
          {contacts.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-stone-600">
                Brak kontaktów — dodaj pierwszy przyciskiem powyżej.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
