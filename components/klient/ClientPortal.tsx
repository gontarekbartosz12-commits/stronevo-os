'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  CLIENT_AUTOMATION_STATUS_LABELS,
  Invoice,
} from '@/lib/types';
import { ClientPortalData, createUpsellLead } from '@/app/actions/client-portal';
import CallsLiveBoard from '@/components/calls/CallsLiveBoard';

const CA_BADGE: Record<string, string> = {
  provisioning: 'bg-gold/15 text-gold-light',
  active: 'bg-emerald-900/40 text-emerald-300',
  paused: 'bg-stone-700/40 text-stone-400',
};

const INV_BADGE: Record<Invoice['status'], string> = {
  wystawiona: 'border-gold-dim/40 bg-gold/5 text-gold-dim',
  oplacona: 'border-emerald-800 bg-emerald-950/40 text-emerald-300',
  zalegla: 'border-red-800 bg-red-950/40 text-red-300',
};

export type ClientPortalPart = 'automatyzacje' | 'polaczenia' | 'faktury' | 'sprzedaz';

// `parts` = które sekcje wyrenderować (do rozłożenia po modułach panelu).
// Domyślnie wszystkie (kompatybilność wstecz).
export default function ClientPortal({
  data,
  parts = ['automatyzacje', 'polaczenia', 'faktury', 'sprzedaz'],
}: {
  data: ClientPortalData;
  parts?: ClientPortalPart[];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const show = (p: ClientPortalPart) => parts.includes(p);

  async function handleUpsell(interesuje: string | null, key: string) {
    setBusy(key);
    setMessage(null);
    try {
      setMessage(await createUpsellLead(data.contact.id, interesuje));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Błąd wysyłki zgłoszenia');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-10">
      {message && (
        <div className="rounded-md border border-gold-dim/40 bg-gold/5 px-4 py-3 text-sm text-gold-light">
          {message}
          <button className="ml-3 underline" onClick={() => setMessage(null)}>
            zamknij
          </button>
        </div>
      )}

      {/* ===== Moje automatyzacje ===== */}
      {show('automatyzacje') && (
      <section>
        <h2 className="mb-4 font-serif text-2xl font-bold text-stone-100">Moje automatyzacje</h2>
        {data.automations.length === 0 ? (
          <p className="card px-4 py-8 text-center text-sm text-stone-600">
            Nie masz jeszcze aktywnych automatyzacji — zobacz katalog poniżej.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {data.automations.map((ca) => (
              <div key={ca.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-serif text-lg font-bold text-stone-100">
                    {ca.automation?.nazwa ?? 'Automatyzacja'}
                  </p>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase ${CA_BADGE[ca.status]}`}
                  >
                    {CLIENT_AUTOMATION_STATUS_LABELS[ca.status]}
                  </span>
                </div>
                <p className="mt-1 text-sm text-stone-400">{ca.automation?.opis}</p>
                <p className="mt-2 text-xs text-stone-500">
                  {ca.automation && <>{ca.automation.cena_mc} zł/mc</>}
                  {ca.data_startu && <> · aktywna od {ca.data_startu}</>}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      )}

      {/* ===== Połączenia na żywo (Ekran Kasy — fundament) ===== */}
      {show('polaczenia') && (
      <section>
        <h2 className="mb-4 font-serif text-2xl font-bold text-stone-100">
          Połączenia na żywo
        </h2>
        {/* Panel właściciela firmy (administrator danych dzwoniących) — pełne numery */}
        <CallsLiveBoard contactId={data.contact.id} maskNumbers={false} />
      </section>
      )}

      {/* ===== Moje faktury ===== */}
      {show('faktury') && (
      <section>
        <h2 className="mb-4 font-serif text-2xl font-bold text-stone-100">Moje faktury</h2>
        {data.invoices.length === 0 ? (
          <p className="card px-4 py-8 text-center text-sm text-stone-600">Brak faktur.</p>
        ) : (
          <div className="card divide-y divide-ink-border">
            {data.invoices.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-stone-200">{inv.tytul}</p>
                  <p className="text-xs text-stone-500">
                    {inv.kwota} zł netto · {inv.cykl} · {inv.data}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] ${INV_BADGE[inv.status]}`}
                  >
                    {inv.status}
                  </span>
                  <Link
                    href={`/faktura/${inv.id}`}
                    className="rounded border border-gold-dim/40 px-2.5 py-1 text-[11px] text-gold-light transition hover:bg-gold/10"
                  >
                    PDF
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      )}

      {/* ===== Sprzedaż (upsell + promocje + kontakt) — wygnana do modułu „Moje konto" ===== */}
      {show('sprzedaz') && (
        <>
      {/* ===== Katalog upsell ===== */}
      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-serif text-2xl font-bold text-stone-100">
            Rozbuduj swój pakiet
          </h2>
          {data.rabatProcent > 0 && (
            <span className="rounded-full border border-gold-dim/40 bg-gold/10 px-3 py-1 text-xs text-gold-light">
              Twój rabat pakietowy: -{data.rabatProcent}% na wdrożenie
            </span>
          )}
        </div>
        {data.upsell.length === 0 ? (
          <p className="card px-4 py-8 text-center text-sm text-stone-600">
            Masz komplet automatyzacji z katalogu — brawo!
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {data.upsell.map((item) => (
              <div key={item.automation.id} className="card flex flex-col p-4">
                <p className="font-serif text-lg font-bold text-stone-100">
                  {item.automation.nazwa}
                </p>
                <p className="mt-1 flex-1 text-sm text-stone-400">{item.automation.opis}</p>
                <div className="mt-3 flex items-end justify-between border-t border-ink-border pt-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-stone-600">
                      Wdrożenie
                    </p>
                    {item.rabatProcent > 0 ? (
                      <p className="font-serif text-lg font-bold text-gold">
                        {item.cenaWdrozeniePoRabacie} zł{' '}
                        <span className="text-xs font-normal text-stone-600 line-through">
                          {item.automation.cena_wdrozenie} zł
                        </span>
                      </p>
                    ) : (
                      <p className="font-serif text-lg font-bold text-gold">
                        {item.automation.cena_wdrozenie} zł
                      </p>
                    )}
                    <p className="text-xs text-stone-500">
                      + {item.automation.cena_mc} zł/mc{' '}
                      <span className="text-emerald-400">(1. mc gratis)</span>
                    </p>
                  </div>
                  <button
                    disabled={busy !== null}
                    onClick={() => handleUpsell(item.automation.nazwa, item.automation.id)}
                    className="btn-primary"
                  >
                    {busy === item.automation.id ? 'Wysyłanie...' : 'Dodaj do pakietu'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ===== Promocje ===== */}
      <section>
        <h2 className="mb-4 font-serif text-2xl font-bold text-stone-100">Promocje</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {data.promotions.map((p) => (
            <div key={p.tytul} className="card p-4">
              <span className="rounded bg-bordo/25 px-2 py-0.5 text-[11px] font-bold text-bordo-glow">
                {p.badge}
              </span>
              <p className="mt-2 font-semibold text-stone-200">{p.tytul}</p>
              <p className="mt-1 text-sm text-stone-400">{p.opis}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Kontakt ===== */}
      <section className="card flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <p className="font-serif text-xl font-bold text-stone-100">
            Masz pytanie albo pomysł na automatyzację?
          </p>
          <p className="mt-1 text-sm text-stone-400">
            Zostaw zgłoszenie — oddzwonimy i doradzimy, co przyniesie największy zwrot.
          </p>
        </div>
        <button
          disabled={busy !== null}
          onClick={() => handleUpsell(null, 'kontakt')}
          className="btn-primary"
        >
          {busy === 'kontakt' ? 'Wysyłanie...' : 'Skontaktuj się z działem sprzedaży'}
        </button>
      </section>
        </>
      )}
    </div>
  );
}
