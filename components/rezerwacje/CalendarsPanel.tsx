'use client';

import { useState } from 'react';
import { CalendarWithMeta, createCalendarAction } from '@/app/actions/produktyzacja';
import { CALENDAR_TYPE_LABELS, CalendarType, Contact, DAY_LABELS } from '@/lib/types';

// KALENDARZE BOOKINGU (Faza 5, operator): round-robin / collective / class.
// Publiczny widget: /rezerwacja/[slug] (wysyłany klientom / wpinany na stronę).

const DNI: { dzien: number; label: string }[] = [
  { dzien: 1, label: DAY_LABELS.pon },
  { dzien: 2, label: DAY_LABELS.wt },
  { dzien: 3, label: DAY_LABELS.sr },
  { dzien: 4, label: DAY_LABELS.czw },
  { dzien: 5, label: DAY_LABELS.pt },
  { dzien: 6, label: DAY_LABELS.sob },
  { dzien: 0, label: DAY_LABELS.nd },
];

export default function CalendarsPanel({
  calendars,
  klienci,
}: {
  calendars: CalendarWithMeta[];
  klienci: Contact[];
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    ownerId: '',
    nazwa: '',
    typ: 'round_robin' as CalendarType,
    slot: '30',
    capacity: '10',
    members: '',
    dni: [1, 2, 3, 4, 5] as number[],
    od: '09:00',
    do: '17:00',
  });

  async function handleCreate() {
    setBusy(true);
    setMessage(null);
    try {
      const cal = await createCalendarAction({
        owner_contact_id: form.ownerId || null,
        nazwa: form.nazwa,
        typ: form.typ,
        slot_min: Number(form.slot) || 30,
        capacity: Number(form.capacity) || 1,
        members: form.members.split(',').map((m) => m.trim()).filter(Boolean),
        dni: form.dni.map((d) => ({ dzien: d, od: form.od, do: form.do })),
      });
      setMessage(`Kalendarz utworzony — widget: /rezerwacja/${cal.slug} (odśwież stronę).`);
      setForm({ ...form, nazwa: '', members: '' });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Błąd');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {message && (
        <div className="rounded-md border border-gold-dim/40 bg-gold/5 px-4 py-2 text-sm text-gold-light">
          {message}
          <button className="ml-3 underline" onClick={() => setMessage(null)}>zamknij</button>
        </div>
      )}

      {/* Nowy kalendarz */}
      <div className="card space-y-2.5 p-4">
        <h3 className="font-serif text-lg font-bold text-stone-200">Nowy kalendarz (operator)</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
          <select className="input" value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}>
            <option value="">Firma: STRONEVO</option>
            {klienci.map((k) => (<option key={k.id} value={k.id}>{k.firma ?? k.imie}</option>))}
          </select>
          <input className="input sm:col-span-2" placeholder="Nazwa (np. Konsultacje)" value={form.nazwa} onChange={(e) => setForm({ ...form, nazwa: e.target.value })} />
          <select className="input" value={form.typ} onChange={(e) => setForm({ ...form, typ: e.target.value as CalendarType })}>
            {Object.entries(CALENDAR_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <input className="input" placeholder="Slot (min)" value={form.slot} onChange={(e) => setForm({ ...form, slot: e.target.value })} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {form.typ !== 'class' ? (
            <input className="input !w-auto" placeholder="Członkowie (po przecinku)" value={form.members} onChange={(e) => setForm({ ...form, members: e.target.value })} />
          ) : (
            <input className="input !w-24" placeholder="Miejsc" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
          )}
          <span className="text-xs text-stone-500">Dostępność:</span>
          {DNI.map((d) => (
            <label key={d.dzien} className="flex items-center gap-1 text-[11px] text-stone-400">
              <input
                type="checkbox"
                checked={form.dni.includes(d.dzien)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    dni: e.target.checked ? [...form.dni, d.dzien] : form.dni.filter((x) => x !== d.dzien),
                  })
                }
                className="accent-[#7B2D3B]"
              />
              {d.label.slice(0, 3)}
            </label>
          ))}
          <input type="time" className="input !w-auto !py-1 text-xs" value={form.od} onChange={(e) => setForm({ ...form, od: e.target.value })} />
          <span className="text-xs text-stone-500">–</span>
          <input type="time" className="input !w-auto !py-1 text-xs" value={form.do} onChange={(e) => setForm({ ...form, do: e.target.value })} />
          <button disabled={busy || !form.nazwa} onClick={handleCreate} className="btn-primary !py-1.5 text-xs">
            {busy ? 'Tworzenie...' : 'Utwórz kalendarz'}
          </button>
        </div>
      </div>

      {/* Lista kalendarzy */}
      {calendars.map((c) => (
        <div key={c.id} className="card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-stone-100">{c.nazwa}</p>
              <p className="text-xs text-stone-500">
                {c.ownerName} · {CALENDAR_TYPE_LABELS[c.typ]} · {c.slot_min} min
                {c.typ === 'class' && ` · ${c.capacity} miejsc/slot`}
                {c.members.length > 0 && ` · zespół: ${c.members.join(', ')}`}
              </p>
            </div>
            <a
              href={`/rezerwacja/${c.slug}`}
              target="_blank"
              className="rounded border border-gold-dim/40 px-2.5 py-1 text-[11px] text-gold-light hover:bg-gold/10"
            >
              Widget: /rezerwacja/{c.slug}
            </a>
          </div>
          {c.rezerwacje.length > 0 && (
            <ul className="mt-3 divide-y divide-ink-border/60 border-t border-ink-border pt-1">
              {c.rezerwacje.slice(0, 6).map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="text-stone-200">
                    {b.external?.imie ?? 'rezerwacja'}
                    <span className="ml-2 text-xs text-stone-500">{b.external?.telefon ?? ''}</span>
                  </span>
                  <span className="text-xs text-stone-400">
                    {new Date(b.start).toLocaleString('pl-PL', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    {b.member_id && c.members.length > 0 && ' · przydzielone'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
