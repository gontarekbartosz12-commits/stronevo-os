'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Automation, CONTRACT_STATUS_LABELS, Contract } from '@/lib/types';
import { listAutomations } from '@/app/actions/automations';
import { generateContract, listContracts } from '@/app/actions/contracts';

// Zakładka "Umowa": generowanie umowy z danych kontaktu + wybranego pakietu
// (checkboxy z katalogu) i lista wygenerowanych umów ze statusem e-akceptacji.
export default function ContractsTab({ contactId }: { contactId: string }) {
  const [contracts, setContracts] = useState<Contract[] | null>(null);
  const [catalog, setCatalog] = useState<Automation[]>([]);
  const [generating, setGenerating] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [dataStartu, setDataStartu] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listContracts(contactId), listAutomations()])
      .then(([c, a]) => {
        if (cancelled) return;
        setContracts(c);
        setCatalog(a);
      })
      .catch((e) => !cancelled && setMessage(e instanceof Error ? e.message : 'Błąd pobierania'));
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  const selectedAutomations = catalog.filter((a) => checked.has(a.id));
  const sumWdrozenie = selectedAutomations.reduce((s, a) => s + a.cena_wdrozenie, 0);
  const sumMc = selectedAutomations.reduce((s, a) => s + a.cena_mc, 0);

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleGenerate() {
    setBusy(true);
    setMessage(null);
    try {
      const created = await generateContract(contactId, [...checked], dataStartu);
      setContracts((prev) => [created, ...(prev ?? [])]);
      setGenerating(false);
      setChecked(new Set());
      setMessage('Umowa wygenerowana — otwórz podgląd, wyślij mailem lub zbierz e-akceptację.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Błąd generowania');
    } finally {
      setBusy(false);
    }
  }

  if (contracts === null) {
    return <p className="py-8 text-center text-sm text-stone-600">Ładowanie...</p>;
  }

  return (
    <div className="space-y-4">
      {message && (
        <div className="rounded-md border border-gold-dim/40 bg-gold/5 px-3 py-2 text-sm text-gold-light">
          {message}
        </div>
      )}

      {contracts.length > 0 && (
        <ul className="space-y-2">
          {contracts.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-md border border-ink-border bg-ink-soft px-3 py-2.5"
            >
              <div>
                <p className="text-sm font-medium text-stone-200">{c.pakiet_nazwa}</p>
                <p className="text-xs text-stone-500">
                  wdrożenie {c.cena_wdrozenie} zł · abonament {c.cena_abonament} zł/mc · start{' '}
                  {c.data_startu}
                  {c.accepted_at && (
                    <>
                      {' '}
                      · zaakceptowana {new Date(c.accepted_at).toLocaleDateString('pl-PL')} (IP{' '}
                      {c.accepted_ip})
                    </>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
                    c.status === 'zaakceptowana'
                      ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
                      : c.status === 'wyslana'
                        ? 'border-gold-dim/40 bg-gold/5 text-gold-dim'
                        : 'border-ink-border text-stone-500'
                  }`}
                >
                  {CONTRACT_STATUS_LABELS[c.status]}
                </span>
                <Link
                  href={`/umowa/${c.id}`}
                  className="rounded border border-gold-dim/40 px-2 py-1 text-[11px] text-gold-light transition hover:bg-gold/10"
                >
                  Otwórz
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!generating ? (
        <button className="btn-primary" onClick={() => setGenerating(true)}>
          Generuj umowę
        </button>
      ) : (
        <div className="rounded-md border border-gold-dim/30 bg-gold/5 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gold-dim">
            Pakiet do umowy
          </p>
          <div className="space-y-1.5">
            {catalog.map((a) => (
              <label
                key={a.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-stone-300 transition hover:bg-ink"
              >
                <input
                  type="checkbox"
                  checked={checked.has(a.id)}
                  onChange={() => toggle(a.id)}
                  className="h-4 w-4 accent-[#7B2D3B]"
                />
                <span className="flex-1">{a.nazwa}</span>
                <span className="text-xs text-stone-500">
                  {a.cena_wdrozenie} zł + {a.cena_mc} zł/mc
                </span>
              </label>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Data startu usług</label>
              <input
                type="date"
                className="input"
                value={dataStartu}
                onChange={(e) => setDataStartu(e.target.value)}
              />
            </div>
            {selectedAutomations.length > 0 && (
              <div className="flex items-end">
                <p className="text-sm text-stone-300">
                  Razem: <span className="font-semibold text-gold">{sumWdrozenie} zł</span> wdrożenie
                  + <span className="font-semibold text-gold">{sumMc} zł/mc</span>
                </p>
              </div>
            )}
          </div>

          <div className="mt-3 flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setGenerating(false)}>
              Anuluj
            </button>
            <button
              className="btn-primary"
              disabled={checked.size === 0 || busy}
              onClick={handleGenerate}
            >
              {busy ? 'Generowanie...' : 'Generuj umowę'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
