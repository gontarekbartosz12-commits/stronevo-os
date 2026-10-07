'use client';

import { useEffect, useState } from 'react';
import {
  Automation,
  CLIENT_AUTOMATION_STATUS_LABELS,
  ClientRequirement,
  POZYSKANIE_METODA_LABELS,
  PozyskanieMetoda,
} from '@/lib/types';
import {
  ClientAutomationWithMeta,
  assignAutomation,
  listAutomations,
  listClientAutomations,
  markClientAutomationActive,
} from '@/app/actions/automations';

const STATUS_BADGE: Record<string, string> = {
  oczekuje_oplaty: 'bg-amber-900/40 text-amber-300',
  provisioning: 'bg-gold/15 text-gold-light',
  active: 'bg-emerald-900/40 text-emerald-300',
  paused: 'bg-stone-700/40 text-stone-400',
};

const METODA_BADGE: Record<PozyskanieMetoda, string> = {
  wideo: 'bg-sky-900/40 text-sky-300',
  poradnik: 'bg-violet-900/40 text-violet-300',
  przeslij: 'bg-amber-900/30 text-amber-300',
  sami: 'bg-stone-700/50 text-stone-300',
};

// Lista "co uzyskać od klienta" (kompendium) dla danej usługi
function Kompendium({ wymagania }: { wymagania: ClientRequirement[] }) {
  const [open, setOpen] = useState(false);
  if (!wymagania || wymagania.length === 0) return null;
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-[11px] font-medium text-gold-dim underline-offset-2 hover:underline"
      >
        {open ? '▾' : '▸'} Co uzyskać od klienta ({wymagania.length})
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1.5 border-l border-ink-border pl-3">
          {wymagania.map((w, i) => (
            <li key={i} className="text-xs">
              <div className="flex items-start justify-between gap-2">
                <span className="text-stone-300">{w.pozycja}</span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase ${METODA_BADGE[w.metoda]}`}
                >
                  {POZYSKANIE_METODA_LABELS[w.metoda]}
                </span>
              </div>
              {w.szczegoly && <p className="mt-0.5 text-[11px] text-stone-500">{w.szczegoly}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Zakładka "Automatyzacje" na karcie kontaktu: przypisane usługi (ze statusem
// bramki opłacenia + kompendium wiedzy) + flow "Przypisz automatyzację".
export default function AutomationsTab({ contactId }: { contactId: string }) {
  const [assigned, setAssigned] = useState<ClientAutomationWithMeta[] | null>(null);
  const [catalog, setCatalog] = useState<Automation[]>([]);
  const [picking, setPicking] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listClientAutomations(contactId), listAutomations()])
      .then(([a, c]) => {
        if (cancelled) return;
        setAssigned(a);
        setCatalog(c);
      })
      .catch((e) => !cancelled && setMessage(e instanceof Error ? e.message : 'Błąd pobierania'));
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  const selected = catalog.find((a) => a.id === selectedId) ?? null;

  async function handleAssign() {
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await assignAutomation(contactId, selected.id);
      setAssigned((prev) => [
        { ...result.clientAutomation, automation: selected },
        ...(prev ?? []),
      ]);
      setMessage(
        `Przypisano "${selected.nazwa}" — status: czeka na opłatę. ` +
          `Wystawiono fakturę wdrożeniową ${selected.cena_wdrozenie} zł + abonament ${selected.cena_mc} zł/mc (od 2. mc, 1. mc gratis). ` +
          (result.contractCreated ? 'Podstawiono szkic umowy. ' : '') +
          'Budowa ruszy po opłaceniu faktury wdrożeniowej.'
      );
      setPicking(false);
      setSelectedId(null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Błąd przypisania');
    } finally {
      setBusy(false);
    }
  }

  async function handleActivate(caId: string) {
    setActivating(caId);
    setMessage(null);
    try {
      const res = await markClientAutomationActive(caId);
      if (res.ok && res.automation) {
        const updated = res.automation;
        setAssigned((prev) =>
          (prev ?? []).map((ca) => (ca.id === caId ? { ...ca, ...updated } : ca))
        );
      }
      setMessage(res.message);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Błąd aktywacji');
    } finally {
      setActivating(null);
    }
  }

  if (assigned === null) {
    return <p className="py-8 text-center text-sm text-stone-600">Ładowanie...</p>;
  }

  return (
    <div className="space-y-4">
      {message && (
        <div className="rounded-md border border-gold-dim/40 bg-gold/5 px-3 py-2 text-sm text-gold-light">
          {message}
        </div>
      )}

      {assigned.length === 0 ? (
        <p className="py-4 text-center text-sm text-stone-600">
          Brak przypisanych automatyzacji.
        </p>
      ) : (
        <ul className="space-y-2">
          {assigned.map((ca) => (
            <li
              key={ca.id}
              className="rounded-md border border-ink-border bg-ink-soft px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-stone-200">
                    {ca.automation?.nazwa ?? 'Nieznana automatyzacja'}
                  </p>
                  <p className="text-xs text-stone-500">
                    {ca.automation && <>{ca.automation.cena_mc} zł/mc</>}
                    {ca.data_startu && <> · start {ca.data_startu}</>}
                    {ca.n8n_workflow_id && <> · workflow: {ca.n8n_workflow_id}</>}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-medium uppercase ${
                    STATUS_BADGE[ca.status]
                  }`}
                >
                  {CLIENT_AUTOMATION_STATUS_LABELS[ca.status]}
                </span>
              </div>

              {ca.status === 'oczekuje_oplaty' && (
                <p className="mt-1.5 text-[11px] text-amber-300/80">
                  Czeka na opłatę faktury wdrożeniowej — po zaksięgowaniu budowa ruszy automatycznie.
                </p>
              )}

              {ca.automation && <Kompendium wymagania={ca.automation.wymagania_od_klienta} />}

              {ca.status === 'provisioning' && (
                <div className="mt-2 flex justify-end">
                  <button
                    className="rounded border border-emerald-800 px-2 py-1 text-[11px] text-emerald-300 transition hover:bg-emerald-950/40 disabled:opacity-50"
                    disabled={activating === ca.id}
                    onClick={() => handleActivate(ca.id)}
                  >
                    {activating === ca.id ? 'Aktywuję...' : 'Oznacz jako wdrożoną → aktywna'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {!picking ? (
        <button className="btn-primary" onClick={() => setPicking(true)}>
          <span className="text-lg leading-none">+</span> Przypisz automatyzację
        </button>
      ) : (
        <div className="rounded-md border border-gold-dim/30 bg-gold/5 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gold-dim">
            Wybierz automatyzację z katalogu
          </p>
          <select
            className="input"
            value={selectedId ?? ''}
            onChange={(e) => setSelectedId(e.target.value || null)}
          >
            <option value="">— wybierz —</option>
            {catalog.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nazwa}
              </option>
            ))}
          </select>

          {selected && (
            <div className="mt-3 rounded-md bg-ink px-3 py-2.5 text-sm">
              <p className="text-stone-300">{selected.opis}</p>
              <p className="mt-2 text-stone-200">
                Wdrożenie: <span className="font-semibold text-gold">{selected.cena_wdrozenie} zł</span>{' '}
                (płatne od razu) · Abonament:{' '}
                <span className="font-semibold text-gold">{selected.cena_mc} zł/mc</span>{' '}
                <span className="text-emerald-400">(1. miesiąc gratis, faktura cykliczna od 2. mc)</span>
              </p>
              <Kompendium wymagania={selected.wymagania_od_klienta} />
            </div>
          )}

          <div className="mt-3 flex justify-end gap-2">
            <button
              className="btn-ghost"
              onClick={() => {
                setPicking(false);
                setSelectedId(null);
              }}
            >
              Anuluj
            </button>
            <button className="btn-primary" disabled={!selected || busy} onClick={handleAssign}>
              {busy ? 'Przypisywanie...' : 'Przypisz'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
