'use client';

import { useEffect, useState } from 'react';
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_ICONS,
  ACTIVITY_TYPE_LABELS,
  ActivityType,
  Contact,
  LeadActivity,
  PipelineStatus,
  STATUS_COLORS,
  STATUS_LABELS,
} from '@/lib/types';
import {
  MyLeadInput,
  addActivity,
  deleteActivity,
  deleteMyLead,
  listActivities,
  updateMyLead,
} from '@/app/actions/client-crm';

const CLIENT_STAGES: PipelineStatus[] = [
  'NOWY',
  'PROBA_KONTAKTU',
  'UMOWIONY',
  'KLIENT',
  'STRACONY',
];

const field =
  'w-full rounded-md border border-ink-border bg-ink px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-gold-dim focus:outline-none';

function fmt(ts: string) {
  // yyyy-mm-ddThh:mm... → „dd.mm.yyyy, hh:mm"
  const d = ts.slice(0, 10).split('-').reverse().join('.');
  const t = ts.slice(11, 16);
  return t ? `${d}, ${t}` : d;
}

export default function LeadModal({
  lead,
  ownerContactId,
  onClose,
  onSaved,
  onDeleted,
}: {
  lead: Contact;
  ownerContactId: string;
  onClose: () => void;
  onSaved: (c: Contact) => void;
  onDeleted: (id: string) => void;
}) {
  const [form, setForm] = useState<MyLeadInput>({
    imie: lead.imie,
    firma: lead.firma ?? '',
    telefon: lead.telefon ?? '',
    email: lead.email ?? '',
    branza: lead.branza ?? '',
    miasto: lead.miasto ?? '',
    status_pipeline: lead.status_pipeline,
    nastepna_akcja: lead.nastepna_akcja ?? '',
    nastepna_akcja_data: lead.nastepna_akcja_data ?? '',
    notatki: lead.notatki ?? '',
    srednia_wartosc_wizyty: lead.srednia_wartosc_wizyty,
  });
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [loadingAct, setLoadingAct] = useState(true);
  const [newType, setNewType] = useState<ActivityType>('notatka');
  const [newText, setNewText] = useState('');
  const [busy, setBusy] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  function set<K extends keyof MyLeadInput>(k: K, v: MyLeadInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const a = await listActivities(lead.id, ownerContactId);
        if (alive) setActivities(a);
      } catch {
        /* pusta historia gdy brak dostępu */
      } finally {
        if (alive) setLoadingAct(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [lead.id, ownerContactId]);

  async function save() {
    if (!form.imie.trim()) {
      setError('Podaj imię/nazwę.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await updateMyLead(
        lead.id,
        {
          imie: form.imie.trim(),
          firma: form.firma || null,
          telefon: form.telefon || null,
          email: form.email || null,
          branza: form.branza || null,
          miasto: form.miasto || null,
          status_pipeline: form.status_pipeline,
          nastepna_akcja: form.nastepna_akcja || null,
          nastepna_akcja_data: form.nastepna_akcja_data || null,
          notatki: form.notatki || null,
          srednia_wartosc_wizyty: form.srednia_wartosc_wizyty ?? null,
        },
        ownerContactId
      );
      onSaved(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zapisać.');
    } finally {
      setBusy(false);
    }
  }

  async function addNote() {
    if (!newText.trim()) return;
    setAddingNote(true);
    setError(null);
    try {
      const a = await addActivity(lead.id, newType, newText.trim(), ownerContactId);
      setActivities((list) => [a, ...list]);
      setNewText('');
      setNewType('notatka');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się dodać wpisu.');
    } finally {
      setAddingNote(false);
    }
  }

  async function delNote(id: string) {
    setActivities((list) => list.filter((a) => a.id !== id));
    try {
      await deleteActivity(id, ownerContactId);
    } catch {
      /* zostaw usunięte lokalnie */
    }
  }

  async function del() {
    setBusy(true);
    try {
      await deleteMyLead(lead.id, ownerContactId);
      onDeleted(lead.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się usunąć.');
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-2xl rounded-xl border border-ink-border bg-ink-soft shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink-border px-5 py-4">
          <div className="flex items-center gap-3">
            <h3 className="font-serif text-xl font-bold text-stone-100">{form.imie || 'Lead'}</h3>
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-medium text-ink"
              style={{ backgroundColor: STATUS_COLORS[form.status_pipeline ?? 'NOWY'] }}
            >
              {STATUS_LABELS[form.status_pipeline ?? 'NOWY']}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-stone-500 transition hover:bg-ink hover:text-stone-200"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mx-5 mt-4 rounded-md border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {/* ===== Dane leada ===== */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs text-stone-500">
              Imię / nazwa
              <input className={`mt-1 ${field}`} value={form.imie} onChange={(e) => set('imie', e.target.value)} />
            </label>
            <label className="text-xs text-stone-500">
              Firma
              <input className={`mt-1 ${field}`} value={form.firma ?? ''} onChange={(e) => set('firma', e.target.value)} />
            </label>
            <label className="text-xs text-stone-500">
              Telefon
              <input className={`mt-1 ${field}`} value={form.telefon ?? ''} onChange={(e) => set('telefon', e.target.value)} />
            </label>
            <label className="text-xs text-stone-500">
              E-mail
              <input className={`mt-1 ${field}`} value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} />
            </label>
            <label className="text-xs text-stone-500">
              Branża
              <input className={`mt-1 ${field}`} value={form.branza ?? ''} onChange={(e) => set('branza', e.target.value)} />
            </label>
            <label className="text-xs text-stone-500">
              Miasto
              <input className={`mt-1 ${field}`} value={form.miasto ?? ''} onChange={(e) => set('miasto', e.target.value)} />
            </label>
            <label className="text-xs text-stone-500">
              Etap
              <select className={`mt-1 ${field}`} value={form.status_pipeline} onChange={(e) => set('status_pipeline', e.target.value as PipelineStatus)}>
                {CLIENT_STAGES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-stone-500">
              Śr. wartość klienta (zł)
              <input className={`mt-1 ${field}`} type="number" value={form.srednia_wartosc_wizyty ?? ''} onChange={(e) => set('srednia_wartosc_wizyty', e.target.value ? Number(e.target.value) : null)} />
            </label>
            <label className="text-xs text-stone-500">
              Następna akcja
              <input className={`mt-1 ${field}`} value={form.nastepna_akcja ?? ''} onChange={(e) => set('nastepna_akcja', e.target.value)} placeholder="np. oddzwonić z ofertą" />
            </label>
            <label className="text-xs text-stone-500">
              Termin akcji
              <input className={`mt-1 ${field}`} type="date" value={form.nastepna_akcja_data ?? ''} onChange={(e) => set('nastepna_akcja_data', e.target.value)} />
            </label>
          </div>
          <label className="mt-3 block text-xs text-stone-500">
            Opis / notatka główna
            <textarea className={`mt-1 ${field}`} rows={2} value={form.notatki ?? ''} onChange={(e) => set('notatki', e.target.value)} />
          </label>
          <div className="mt-3 flex justify-end">
            <button className="btn-primary" disabled={busy} onClick={save}>
              {busy ? 'Zapisywanie...' : 'Zapisz zmiany'}
            </button>
          </div>

          {/* ===== Historia kontaktu ===== */}
          <div className="mt-6 border-t border-ink-border pt-4">
            <h4 className="mb-3 font-serif text-lg font-bold text-stone-100">Historia kontaktu</h4>

            {/* Dodaj wpis */}
            <div className="rounded-lg border border-ink-border bg-ink p-3">
              <div className="flex flex-wrap gap-2">
                {ACTIVITY_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setNewType(t)}
                    className={`rounded-md px-2.5 py-1 text-xs transition ${
                      newType === t
                        ? 'bg-bordo text-stone-100'
                        : 'border border-ink-border text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    {ACTIVITY_TYPE_ICONS[t]} {ACTIVITY_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
              <textarea
                className={`mt-2 ${field}`}
                rows={2}
                placeholder="Co się wydarzyło? (np. rozmowa, ustalenia, e-mail)"
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
              />
              <div className="mt-2 flex justify-end">
                <button className="btn-primary" disabled={addingNote || !newText.trim()} onClick={addNote}>
                  {addingNote ? 'Dodawanie...' : 'Dodaj wpis'}
                </button>
              </div>
            </div>

            {/* Timeline */}
            <div className="mt-4 space-y-2">
              {loadingAct ? (
                <p className="text-center text-sm text-stone-600">Wczytywanie historii...</p>
              ) : activities.length === 0 ? (
                <p className="text-center text-sm text-stone-600">
                  Brak wpisów. Dodaj pierwszą notatkę lub zaloguj telefon powyżej.
                </p>
              ) : (
                activities.map((a) => (
                  <div key={a.id} className="flex items-start gap-3 rounded-lg border border-ink-border bg-ink px-3 py-2">
                    <span className="text-lg">{ACTIVITY_TYPE_ICONS[a.typ] ?? '📝'}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-stone-500">
                          {ACTIVITY_TYPE_LABELS[a.typ] ?? a.typ} · {fmt(a.created_at)}
                        </span>
                        <button className="text-xs text-stone-600 hover:text-red-400" onClick={() => delNote(a.id)}>
                          usuń
                        </button>
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap text-sm text-stone-200">{a.tresc}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer: usuń lead */}
        <div className="flex items-center justify-between border-t border-ink-border px-5 py-3">
          {confirmDel ? (
            <div className="flex items-center gap-2 text-sm text-red-300">
              Usunąć leada wraz z historią?
              <button className="rounded border border-red-800 px-2 py-1 text-xs text-red-300 hover:bg-red-950/40" disabled={busy} onClick={del}>
                Tak, usuń
              </button>
              <button className="rounded border border-ink-border px-2 py-1 text-xs text-stone-400" onClick={() => setConfirmDel(false)}>
                Anuluj
              </button>
            </div>
          ) : (
            <button className="text-sm text-red-400 hover:text-red-300" onClick={() => setConfirmDel(true)}>
              Usuń leada
            </button>
          )}
          <button className="rounded-md border border-ink-border px-3 py-1.5 text-sm text-stone-400 hover:text-stone-200" onClick={onClose}>
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
}
