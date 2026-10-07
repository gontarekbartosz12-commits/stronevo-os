'use client';

import { useState } from 'react';
import {
  CustomObjectWithRecords,
  SmartListWithResults,
  createCustomObjectAction,
  createCustomObjectRecordAction,
  createSmartListAction,
} from '@/app/actions/produktyzacja';
import { describeFilter } from '@/lib/smart-lists';
import { Contact, CustomObjectField, PIPELINE_STATUSES, STATUS_LABELS } from '@/lib/types';

// BAZA (CRM+) — Faza 5: smart listy (zapisane filtry) + custom objects.
// Schematy obiektów = operator; rekordy + listy = funkcje użytkowe.

export default function BazaHub({
  smartLists,
  objects,
  klienci,
}: {
  smartLists: SmartListWithResults[];
  objects: CustomObjectWithRecords[];
  klienci: Contact[];
}) {
  const [tab, setTab] = useState<'Smart listy' | 'Obiekty'>('Smart listy');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openList, setOpenList] = useState<string | null>(null);

  const [listForm, setListForm] = useState({
    nazwa: '',
    statusy: [] as string[],
    ma_telefon: false,
    ma_email: false,
    miasto: '',
  });
  const [objForm, setObjForm] = useState({ ownerId: '', nazwa: '', ikona: '📦', pola: 'nazwa | Nazwa | text' });
  const [recForm, setRecForm] = useState<{ objectId: string; dane: Record<string, string> } | null>(null);

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setMessage(null);
    try {
      setMessage(await fn());
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Błąd');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg border border-ink-border p-1">
        {(['Smart listy', 'Obiekty'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-4 py-1.5 text-sm transition ${tab === t ? 'bg-bordo/30 font-semibold text-gold-light' : 'text-stone-500 hover:text-stone-300'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {message && (
        <div className="rounded-md border border-gold-dim/40 bg-gold/5 px-4 py-2 text-sm text-gold-light">
          {message}
          <button className="ml-3 underline" onClick={() => setMessage(null)}>zamknij</button>
        </div>
      )}

      {/* ===== SMART LISTY ===== */}
      {tab === 'Smart listy' && (
        <div className="space-y-4">
          <div className="card space-y-2.5 p-4">
            <h3 className="font-serif text-lg font-bold text-stone-200">Nowa smart lista (zapisany filtr)</h3>
            <div className="flex flex-wrap items-center gap-3">
              <input className="input !w-auto" placeholder="Nazwa listy" value={listForm.nazwa} onChange={(e) => setListForm({ ...listForm, nazwa: e.target.value })} />
              <input className="input !w-auto" placeholder="Miasto (opcjonalnie)" value={listForm.miasto} onChange={(e) => setListForm({ ...listForm, miasto: e.target.value })} />
              <label className="flex items-center gap-1.5 text-xs text-stone-300">
                <input type="checkbox" checked={listForm.ma_telefon} onChange={(e) => setListForm({ ...listForm, ma_telefon: e.target.checked })} className="accent-[#7B2D3B]" /> ma telefon
              </label>
              <label className="flex items-center gap-1.5 text-xs text-stone-300">
                <input type="checkbox" checked={listForm.ma_email} onChange={(e) => setListForm({ ...listForm, ma_email: e.target.checked })} className="accent-[#7B2D3B]" /> ma e-mail
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              {PIPELINE_STATUSES.map((s) => (
                <label key={s} className="flex items-center gap-1 rounded border border-ink-border px-2 py-1 text-[11px] text-stone-400">
                  <input
                    type="checkbox"
                    checked={listForm.statusy.includes(s)}
                    onChange={(e) =>
                      setListForm({
                        ...listForm,
                        statusy: e.target.checked
                          ? [...listForm.statusy, s]
                          : listForm.statusy.filter((x) => x !== s),
                      })
                    }
                    className="accent-[#7B2D3B]"
                  />
                  {STATUS_LABELS[s as keyof typeof STATUS_LABELS]}
                </label>
              ))}
              <button
                disabled={busy || !listForm.nazwa}
                onClick={() =>
                  run(async () => {
                    await createSmartListAction({
                      owner_contact_id: null,
                      nazwa: listForm.nazwa,
                      filtr: {
                        ...(listForm.statusy.length > 0 ? { status_pipeline: listForm.statusy } : {}),
                        ...(listForm.ma_telefon ? { ma_telefon: true } : {}),
                        ...(listForm.ma_email ? { ma_email: true } : {}),
                        ...(listForm.miasto ? { miasto: listForm.miasto } : {}),
                      },
                    });
                    setListForm({ nazwa: '', statusy: [], ma_telefon: false, ma_email: false, miasto: '' });
                    return 'Smart lista zapisana (odśwież stronę).';
                  })
                }
                className="btn-primary !py-1 text-xs"
              >
                Zapisz listę
              </button>
            </div>
          </div>

          {smartLists.map((l) => (
            <div key={l.id} className="card p-4">
              <button className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setOpenList(openList === l.id ? null : l.id)}>
                <div>
                  <p className="font-semibold text-stone-100">{l.nazwa}</p>
                  <p className="text-xs text-stone-500">{describeFilter(l.filtr)}</p>
                </div>
                <span className="rounded bg-bordo/25 px-2.5 py-1 font-serif text-lg font-bold text-gold">
                  {l.wyniki.length}
                </span>
              </button>
              {openList === l.id && (
                <ul className="mt-3 divide-y divide-ink-border/60 border-t border-ink-border pt-1">
                  {l.wyniki.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <span className="text-stone-200">
                        {c.firma ?? c.imie}
                        <span className="ml-2 text-xs text-stone-500">{c.miasto ?? ''}</span>
                      </span>
                      <span className="text-xs text-stone-500">
                        {STATUS_LABELS[c.status_pipeline]} · {c.telefon ?? c.email ?? '—'}
                      </span>
                    </li>
                  ))}
                  {l.wyniki.length === 0 && (
                    <li className="py-3 text-center text-xs text-stone-600">Filtr nic teraz nie łapie.</li>
                  )}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ===== OBIEKTY ===== */}
      {tab === 'Obiekty' && (
        <div className="space-y-4">
          <div className="card space-y-2 p-4">
            <h3 className="font-serif text-lg font-bold text-stone-200">Nowy typ obiektu (operator)</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              <select className="input" value={objForm.ownerId} onChange={(e) => setObjForm({ ...objForm, ownerId: e.target.value })}>
                <option value="">Właściciel: STRONEVO</option>
                {klienci.map((k) => (<option key={k.id} value={k.id}>{k.firma ?? k.imie}</option>))}
              </select>
              <input className="input" placeholder="Nazwa (np. Pojazd)" value={objForm.nazwa} onChange={(e) => setObjForm({ ...objForm, nazwa: e.target.value })} />
              <input className="input" placeholder="Ikona (emoji)" value={objForm.ikona} onChange={(e) => setObjForm({ ...objForm, ikona: e.target.value })} />
              <button
                disabled={busy || !objForm.nazwa}
                onClick={() =>
                  run(async () => {
                    const schema: CustomObjectField[] = objForm.pola
                      .split('\n')
                      .map((l) => l.trim())
                      .filter(Boolean)
                      .map((l) => {
                        const [name, label, typ] = l.split('|').map((x) => x.trim());
                        return {
                          name: name || 'pole',
                          label: label || name || 'Pole',
                          typ: (['text', 'number', 'date'].includes(typ) ? typ : 'text') as CustomObjectField['typ'],
                        };
                      });
                    await createCustomObjectAction({
                      owner_contact_id: objForm.ownerId || null,
                      nazwa: objForm.nazwa,
                      ikona: objForm.ikona,
                      schema,
                    });
                    return 'Typ obiektu utworzony (odśwież stronę).';
                  })
                }
                className="btn-primary !py-2 text-xs"
              >
                Utwórz typ
              </button>
            </div>
            <p className="text-[11px] text-stone-500">Pola — jedna linia: name | Etykieta | text/number/date</p>
            <textarea className="input font-mono text-xs" rows={3} value={objForm.pola} onChange={(e) => setObjForm({ ...objForm, pola: e.target.value })} />
          </div>

          {objects.map((o) => (
            <div key={o.id} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-stone-100">
                  {o.ikona} {o.nazwa}
                  <span className="ml-2 text-xs font-normal text-stone-500">
                    {o.ownerName} · {o.records.length} rekordów
                  </span>
                </p>
                <button
                  onClick={() => setRecForm(recForm?.objectId === o.id ? null : { objectId: o.id, dane: {} })}
                  className="rounded border border-gold-dim/40 px-2.5 py-1 text-[11px] text-gold-light hover:bg-gold/10"
                >
                  + Dodaj rekord
                </button>
              </div>

              {recForm?.objectId === o.id && (
                <div className="mt-3 space-y-2 rounded-md border border-ink-border bg-ink-soft/60 p-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {o.schema.map((f) => (
                      <input
                        key={f.name}
                        type={f.typ === 'number' ? 'number' : f.typ === 'date' ? 'date' : 'text'}
                        className="input"
                        placeholder={f.label}
                        value={recForm.dane[f.name] ?? ''}
                        onChange={(e) =>
                          setRecForm({ ...recForm, dane: { ...recForm.dane, [f.name]: e.target.value } })
                        }
                      />
                    ))}
                  </div>
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await createCustomObjectRecordAction({ object_id: o.id, dane: recForm.dane });
                        setRecForm(null);
                        return 'Rekord dodany (odśwież stronę).';
                      })
                    }
                    className="btn-primary !py-1 text-xs"
                  >
                    Zapisz rekord
                  </button>
                </div>
              )}

              {o.records.length > 0 && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-ink-border text-left uppercase tracking-wider text-stone-500">
                        {o.schema.map((f) => (
                          <th key={f.name} className="px-3 py-2">{f.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {o.records.map((r) => (
                        <tr key={r.id} className="border-b border-ink-border/50 text-stone-300">
                          {o.schema.map((f) => (
                            <td key={f.name} className="px-3 py-2">{String(r.dane[f.name] ?? '—')}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
