'use client';

import { useMemo, useState } from 'react';
import {
  Contact,
  PipelineStatus,
  STATUS_LABELS,
  STATUS_COLORS,
} from '@/lib/types';
import {
  MyLeadInput,
  createMyLead,
  updateMyLead,
  requestRemarketing,
} from '@/app/actions/client-crm';
import LeadModal from './LeadModal';

// Lejek widoczny dla klienta (podzbiór statusów STRONEVO — czytelny dla MŚP).
const CLIENT_STAGES: PipelineStatus[] = [
  'NOWY',
  'PROBA_KONTAKTU',
  'UMOWIONY',
  'KLIENT',
  'STRACONY',
];

type Tab = 'leady' | 'kalendarz' | 'remarketing';
type Kanal = 'meta' | 'sms' | 'email';

const EMPTY: MyLeadInput = {
  imie: '',
  firma: '',
  telefon: '',
  email: '',
  branza: '',
  miasto: '',
  status_pipeline: 'NOWY',
  nastepna_akcja: '',
  nastepna_akcja_data: '',
  notatki: '',
  srednia_wartosc_wizyty: null,
};

function StatusBadge({ status }: { status: PipelineStatus }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px] font-medium text-ink"
      style={{ backgroundColor: STATUS_COLORS[status] }}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export default function ClientCrm({
  initialLeads,
  ownerContactId,
}: {
  initialLeads: Contact[];
  ownerContactId: string;
}) {
  const [tab, setTab] = useState<Tab>('leady');
  const [leads, setLeads] = useState<Contact[]>(initialLeads);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<MyLeadInput>(EMPTY);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [view, setView] = useState<'tablica' | 'lista'>('tablica');
  const [dragOver, setDragOver] = useState<PipelineStatus | null>(null);

  function set<K extends keyof MyLeadInput>(k: K, v: MyLeadInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleAdd() {
    if (!form.imie.trim()) {
      setError('Podaj imię lub nazwę.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createMyLead(form, ownerContactId);
      setLeads((l) => [created, ...l]);
      setForm(EMPTY);
      setShowAdd(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się dodać leada.');
    } finally {
      setBusy(false);
    }
  }

  async function handleStatus(c: Contact, status: PipelineStatus) {
    setLeads((l) => l.map((x) => (x.id === c.id ? { ...x, status_pipeline: status } : x)));
    try {
      await updateMyLead(c.id, { status_pipeline: status }, ownerContactId);
    } catch {
      setLeads((l) => l.map((x) => (x.id === c.id ? c : x))); // rollback
      setError('Nie udało się zmienić etapu.');
    }
  }

  // ===== Kalendarz: leady z zaplanowaną akcją, pogrupowane po dacie =====
  const calendar = useMemo(() => {
    const withDate = leads.filter((c) => c.nastepna_akcja_data);
    const groups = new Map<string, Contact[]>();
    for (const c of withDate) {
      const d = c.nastepna_akcja_data as string;
      groups.set(d, [...(groups.get(d) ?? []), c]);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [leads]);

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
  }, []);

  // ===== Remarketing: segmenty po statusie + eksport / zlecenie kampanii =====
  const segments = useMemo(() => {
    const mk = (key: string, label: string, opis: string, list: Contact[]) => ({
      key,
      label,
      opis,
      list,
      emails: list.map((c) => c.email).filter(Boolean) as string[],
      phones: list.map((c) => c.telefon).filter(Boolean) as string[],
    });
    return [
      mk('nowi', 'Nowi do kontaktu', 'Świeże leady, jeszcze bez pierwszego kontaktu', leads.filter((c) => c.status_pipeline === 'NOWY')),
      mk('nieodebrali', 'Nie odebrali', 'Próba kontaktu — warto ponowić / wysłać SMS', leads.filter((c) => c.status_pipeline === 'PROBA_KONTAKTU')),
      mk('klienci', 'Klienci', 'Utrzymanie i upsell — Twoi obecni klienci', leads.filter((c) => c.status_pipeline === 'KLIENT')),
      mk('odzysk', 'Do odzyskania', 'Straceni — kampania odzyskowa / rabat', leads.filter((c) => c.status_pipeline === 'STRACONY')),
    ];
  }, [leads]);

  const [copied, setCopied] = useState<string | null>(null);
  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1800);
    } catch {
      setError('Nie udało się skopiować (przeglądarka zablokowała schowek).');
    }
  }

  const [kanal, setKanal] = useState<Record<string, Kanal>>({});
  const [zlecanie, setZlecanie] = useState<string | null>(null);
  async function zlecKampanie(segKey: string, label: string, count: number) {
    setZlecanie(segKey);
    setError(null);
    setMessage(null);
    try {
      const msg = await requestRemarketing(label, count, kanal[segKey] ?? 'meta', ownerContactId);
      setMessage(msg);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się wysłać zlecenia.');
    } finally {
      setZlecanie(null);
    }
  }

  // Lejek jako TABLICA (Kanban) — ten sam wzorzec co operator, ale na etapach klienta.
  // Kolumna pokazuje liczbę leadów + Σ wartość otwartych szans (odpowiedź na „ile
  // mam otwartych wycen i ile są warte"). Karty przeciągalne między etapami.
  const kanban = (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {CLIENT_STAGES.map((stage) => {
        const items = leads.filter((c) => c.status_pipeline === stage);
        const wartosc = items.reduce((s, c) => s + (c.srednia_wartosc_wizyty ?? 0), 0);
        return (
          <div
            key={stage}
            className={`flex w-60 shrink-0 flex-col rounded-lg border bg-ink-soft/60 transition ${
              dragOver === stage ? 'border-gold-dim bg-ink-hover' : 'border-ink-border'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(stage);
            }}
            onDragLeave={() => setDragOver((s) => (s === stage ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(null);
              const id = e.dataTransfer.getData('text/lead-id');
              const lead = leads.find((l) => l.id === id);
              if (lead && lead.status_pipeline !== stage) handleStatus(lead, stage);
            }}
          >
            <div
              className="flex items-center justify-between rounded-t-lg border-b border-ink-border px-3 py-2"
              style={{ borderTop: `3px solid ${STATUS_COLORS[stage]}` }}
            >
              <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-300">
                {STATUS_LABELS[stage]}
              </span>
              <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] text-stone-500">
                {items.length}
              </span>
            </div>
            {wartosc > 0 && (
              <p className="border-b border-ink-border/60 px-3 py-1 text-[11px] text-gold-light">
                ≈ {wartosc.toLocaleString('pl-PL')} zł otwartych
              </p>
            )}
            <div className="flex min-h-[120px] flex-1 flex-col gap-2 p-2">
              {items.map((c) => (
                <div
                  key={c.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/lead-id', c.id)}
                  onClick={() => setSelected(c)}
                  className="cursor-pointer rounded-md border border-ink-border bg-ink p-2.5 transition hover:border-gold-dim/50"
                >
                  <p className="truncate text-sm font-medium text-stone-100">
                    {c.imie}
                    {c.firma ? ` · ${c.firma}` : ''}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-stone-500">
                    {[c.telefon, c.miasto].filter(Boolean).join(' · ') || '—'}
                  </p>
                  {c.srednia_wartosc_wizyty ? (
                    <p className="mt-0.5 text-[11px] text-gold-dim">
                      ≈ {c.srednia_wartosc_wizyty.toLocaleString('pl-PL')} zł
                    </p>
                  ) : null}
                </div>
              ))}
              {items.length === 0 && (
                <p className="mt-6 text-center text-[11px] text-stone-700">Przeciągnij tu</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  const field =
    'w-full rounded-md border border-ink-border bg-ink px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-gold-dim focus:outline-none';

  return (
    <div className="space-y-5">
      {/* Zakładki */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['leady', `Moi klienci (${leads.length})`],
            ['kalendarz', 'Kalendarz'],
            ['remarketing', 'Remarketing'],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
              tab === t
                ? 'bg-bordo text-stone-100'
                : 'border border-ink-border text-stone-400 hover:text-stone-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-md border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-300">
          {error}
          <button className="ml-3 underline" onClick={() => setError(null)}>zamknij</button>
        </div>
      )}
      {message && (
        <div className="rounded-md border border-emerald-800 bg-emerald-950/40 px-4 py-2 text-sm text-emerald-300">
          {message}
          <button className="ml-3 underline" onClick={() => setMessage(null)}>zamknij</button>
        </div>
      )}

      {/* ===================== LEADY ===================== */}
      {tab === 'leady' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1 rounded-md border border-ink-border p-0.5">
              {(['tablica', 'lista'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`rounded px-3 py-1 text-xs font-medium transition ${
                    view === v ? 'bg-bordo text-stone-100' : 'text-stone-500 hover:text-stone-300'
                  }`}
                >
                  {v === 'tablica' ? 'Tablica (lejek)' : 'Lista'}
                </button>
              ))}
            </div>
            <button className="btn-primary" onClick={() => setShowAdd((s) => !s)}>
              {showAdd ? 'Anuluj' : '+ Dodaj klienta / leada'}
            </button>
          </div>

          {showAdd && (
            <div className="card space-y-3 p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input className={field} placeholder="Imię / nazwa *" value={form.imie} onChange={(e) => set('imie', e.target.value)} />
                <input className={field} placeholder="Firma" value={form.firma ?? ''} onChange={(e) => set('firma', e.target.value)} />
                <input className={field} placeholder="Telefon" value={form.telefon ?? ''} onChange={(e) => set('telefon', e.target.value)} />
                <input className={field} placeholder="E-mail" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} />
                <input className={field} placeholder="Branża" value={form.branza ?? ''} onChange={(e) => set('branza', e.target.value)} />
                <input className={field} placeholder="Miasto" value={form.miasto ?? ''} onChange={(e) => set('miasto', e.target.value)} />
                <select className={field} value={form.status_pipeline} onChange={(e) => set('status_pipeline', e.target.value as PipelineStatus)}>
                  {CLIENT_STAGES.map((s) => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
                <input className={field} type="date" value={form.nastepna_akcja_data ?? ''} onChange={(e) => set('nastepna_akcja_data', e.target.value)} />
                <input className={field} placeholder="Następna akcja (np. oddzwonić)" value={form.nastepna_akcja ?? ''} onChange={(e) => set('nastepna_akcja', e.target.value)} />
                <input className={field} type="number" placeholder="Śr. wartość klienta (zł)" value={form.srednia_wartosc_wizyty ?? ''} onChange={(e) => set('srednia_wartosc_wizyty', e.target.value ? Number(e.target.value) : null)} />
              </div>
              <textarea className={field} rows={2} placeholder="Notatki" value={form.notatki ?? ''} onChange={(e) => set('notatki', e.target.value)} />
              <div className="flex justify-end">
                <button className="btn-primary" disabled={busy} onClick={handleAdd}>
                  {busy ? 'Zapisywanie...' : 'Zapisz leada'}
                </button>
              </div>
            </div>
          )}

          {leads.length === 0 ? (
            <p className="card px-4 py-10 text-center text-sm text-stone-600">
              Nie masz jeszcze żadnych leadów. Dodaj pierwszego klienta przyciskiem powyżej.
            </p>
          ) : view === 'tablica' ? (
            kanban
          ) : (
            <div className="space-y-2">
              {leads.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setSelected(c)}
                  className="card cursor-pointer p-4 transition hover:border-gold-dim/50"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-serif text-lg font-bold text-stone-100">{c.imie}</p>
                        {c.firma && <span className="text-sm text-stone-500">· {c.firma}</span>}
                        <StatusBadge status={c.status_pipeline} />
                      </div>
                      <p className="mt-1 text-sm text-stone-400">
                        {[c.telefon, c.email, c.miasto, c.branza].filter(Boolean).join(' · ') || '—'}
                      </p>
                      {(c.nastepna_akcja || c.nastepna_akcja_data) && (
                        <p className="mt-1 text-xs text-gold-light">
                          ⏭ {c.nastepna_akcja ?? 'Akcja'}{c.nastepna_akcja_data ? ` — ${c.nastepna_akcja_data}` : ''}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2" onClick={(e) => e.stopPropagation()}>
                      <select
                        className="rounded-md border border-ink-border bg-ink px-2 py-1 text-xs text-stone-300"
                        value={c.status_pipeline}
                        onChange={(e) => handleStatus(c, e.target.value as PipelineStatus)}
                      >
                        {CLIENT_STAGES.map((s) => (
                          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                        ))}
                      </select>
                      <button className="text-xs text-gold-light underline" onClick={() => setSelected(c)}>
                        Otwórz →
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===================== KALENDARZ ===================== */}
      {tab === 'kalendarz' && (
        <div className="space-y-4">
          {calendar.length === 0 ? (
            <p className="card px-4 py-10 text-center text-sm text-stone-600">
              Brak zaplanowanych akcji. Ustaw „następną akcję" i datę na leadzie, aby pojawił się w kalendarzu.
            </p>
          ) : (
            calendar.map(([date, items]) => {
              const overdue = date < today;
              const isToday = date === today;
              return (
                <div key={date} className="card p-4">
                  <p className={`mb-2 text-sm font-bold ${overdue ? 'text-red-400' : isToday ? 'text-gold' : 'text-stone-300'}`}>
                    {date}{isToday && ' · dziś'}{overdue && ' · zaległe'}
                  </p>
                  <div className="space-y-2">
                    {items.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => setSelected(c)}
                        className="flex cursor-pointer flex-wrap items-center justify-between gap-2 border-t border-ink-border pt-2 text-sm hover:opacity-80"
                      >
                        <div>
                          <span className="font-medium text-stone-200">{c.imie}</span>
                          {c.firma && <span className="text-stone-500"> · {c.firma}</span>}
                          <span className="ml-2 text-gold-light">{c.nastepna_akcja ?? 'Akcja'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {c.telefon && <span className="text-xs text-stone-500">{c.telefon}</span>}
                          <StatusBadge status={c.status_pipeline} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ===================== REMARKETING ===================== */}
      {tab === 'remarketing' && (
        <div className="space-y-4">
          <p className="text-sm text-stone-500">
            Segmenty Twoich leadów. Możesz skopiować kontakty do własnej wysyłki albo
            <strong className="text-stone-300"> zlecić kampanię STRONEVO</strong> — uruchomimy ją (Meta / SMS / e-mail) zgodnie z RODO.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {segments.map((s) => (
              <div key={s.key} className="card flex flex-col p-4">
                <div className="flex items-baseline justify-between">
                  <p className="font-serif text-lg font-bold text-stone-100">{s.label}</p>
                  <span className="font-serif text-2xl font-bold text-gold">{s.list.length}</span>
                </div>
                <p className="mt-1 flex-1 text-sm text-stone-400">{s.opis}</p>
                <p className="mt-2 text-xs text-stone-500">
                  {s.emails.length} z e-mailem · {s.phones.length} z telefonem
                </p>

                {/* Zlecenie kampanii STRONEVO */}
                <div className="mt-3 flex items-center gap-2">
                  <select
                    className="rounded-md border border-ink-border bg-ink px-2 py-1.5 text-xs text-stone-300"
                    value={kanal[s.key] ?? 'meta'}
                    onChange={(e) => setKanal((k) => ({ ...k, [s.key]: e.target.value as Kanal }))}
                  >
                    <option value="meta">Meta Ads</option>
                    <option value="sms">SMS</option>
                    <option value="email">E-mail</option>
                  </select>
                  <button
                    disabled={s.list.length === 0 || zlecanie === s.key}
                    onClick={() => zlecKampanie(s.key, s.label, s.list.length)}
                    className="flex-1 rounded-md bg-bordo px-2.5 py-1.5 text-xs font-medium text-stone-100 transition hover:bg-bordo-glow disabled:opacity-40"
                  >
                    {zlecanie === s.key ? 'Wysyłanie...' : 'Zleć kampanię STRONEVO'}
                  </button>
                </div>

                {/* Eksport DIY */}
                <div className="mt-2 flex gap-2">
                  <button
                    disabled={s.emails.length === 0}
                    onClick={() => copy(s.emails.join(', '), `${s.key}-mail`)}
                    className="flex-1 rounded-md border border-gold-dim/40 px-2.5 py-1.5 text-xs text-gold-light transition hover:bg-gold/10 disabled:opacity-40"
                  >
                    {copied === `${s.key}-mail` ? 'Skopiowano ✓' : 'Kopiuj e-maile'}
                  </button>
                  <button
                    disabled={s.phones.length === 0}
                    onClick={() => copy(s.phones.join(', '), `${s.key}-tel`)}
                    className="flex-1 rounded-md border border-gold-dim/40 px-2.5 py-1.5 text-xs text-gold-light transition hover:bg-gold/10 disabled:opacity-40"
                  >
                    {copied === `${s.key}-tel` ? 'Skopiowano ✓' : 'Kopiuj telefony'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===================== MODAL LEADA ===================== */}
      {selected && (
        <LeadModal
          lead={selected}
          ownerContactId={ownerContactId}
          onClose={() => setSelected(null)}
          onSaved={(u) => {
            setLeads((l) => l.map((x) => (x.id === u.id ? u : x)));
            setSelected(u);
          }}
          onDeleted={(id) => {
            setLeads((l) => l.filter((x) => x.id !== id));
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}
