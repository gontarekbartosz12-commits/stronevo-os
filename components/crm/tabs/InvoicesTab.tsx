'use client';

import { useEffect, useState } from 'react';
import { Invoice } from '@/lib/types';
import {
  checkInvoicePayment,
  listInvoices,
  markInvoiceOverdue,
  markInvoicePaid,
} from '@/app/actions/invoices';

const STATUS_BADGE: Record<Invoice['status'], string> = {
  wystawiona: 'border-gold-dim/40 bg-gold/5 text-gold-dim',
  oplacona: 'border-emerald-800 bg-emerald-950/40 text-emerald-300',
  zalegla: 'border-red-800 bg-red-950/40 text-red-300',
};

// Zakładka "Faktury": lista + status; "Sprawdź płatność" (Fakturownia/live),
// ręczne oznaczenia dla przelewów poza systemem i do testów w demo.
// Opłacenie faktury odpala automat "dostęp po opłacie" (konto klienta + mail).
export default function InvoicesTab({ contactId }: { contactId: string }) {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listInvoices(contactId)
      .then((data) => !cancelled && setInvoices(data))
      .catch((e) => !cancelled && setMessage(e instanceof Error ? e.message : 'Błąd pobierania'));
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  function replace(updated: Invoice) {
    setInvoices((prev) => (prev ?? []).map((i) => (i.id === updated.id ? updated : i)));
  }

  async function handleCheck(inv: Invoice) {
    setBusyId(inv.id);
    setMessage(null);
    try {
      const result = await checkInvoicePayment(inv.id);
      replace(result.invoice);
      setMessage(result.message);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Błąd sprawdzania');
    } finally {
      setBusyId(null);
    }
  }

  async function handlePaid(inv: Invoice) {
    setBusyId(inv.id);
    setMessage(null);
    try {
      const result = await markInvoicePaid(inv.id);
      replace(result.invoice);
      setMessage(result.message);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Błąd zapisu');
    } finally {
      setBusyId(null);
    }
  }

  async function handleOverdue(inv: Invoice) {
    setBusyId(inv.id);
    setMessage(null);
    try {
      replace(await markInvoiceOverdue(inv.id));
      setMessage('Faktura oznaczona jako zaległa — powiadomienie biznesowe pojawi się w centrum.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Błąd zapisu');
    } finally {
      setBusyId(null);
    }
  }

  if (invoices === null) {
    return <p className="py-8 text-center text-sm text-stone-600">Ładowanie...</p>;
  }

  return (
    <div className="space-y-4">
      {message && (
        <div className="rounded-md border border-gold-dim/40 bg-gold/5 px-3 py-2 text-sm text-gold-light">
          {message}
        </div>
      )}

      {invoices.length === 0 ? (
        <p className="py-4 text-center text-sm text-stone-600">
          Brak faktur — powstają przy przypisaniu automatyzacji.
        </p>
      ) : (
        <ul className="space-y-2">
          {invoices.map((inv) => (
            <li key={inv.id} className="rounded-md border border-ink-border bg-ink-soft px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-stone-200">{inv.tytul}</p>
                  <p className="text-xs text-stone-500">
                    {inv.kwota} zł · {inv.cykl} · {inv.data}
                    {inv.fakturownia_id && <> · {inv.fakturownia_id}</>}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] ${STATUS_BADGE[inv.status]}`}
                >
                  {inv.status}
                </span>
              </div>
              {inv.status !== 'oplacona' && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    disabled={busyId === inv.id}
                    onClick={() => handleCheck(inv)}
                    className="rounded border border-gold-dim/40 px-2 py-1 text-[11px] text-gold-light transition hover:bg-gold/10 disabled:opacity-50"
                  >
                    Sprawdź płatność
                  </button>
                  <button
                    disabled={busyId === inv.id}
                    onClick={() => handlePaid(inv)}
                    className="rounded border border-emerald-800 px-2 py-1 text-[11px] text-emerald-300 transition hover:bg-emerald-950/40 disabled:opacity-50"
                  >
                    Oznacz jako opłaconą
                  </button>
                  {inv.status !== 'zalegla' && (
                    <button
                      disabled={busyId === inv.id}
                      onClick={() => handleOverdue(inv)}
                      className="rounded border border-red-900 px-2 py-1 text-[11px] text-red-300 transition hover:bg-red-950/40 disabled:opacity-50"
                    >
                      Oznacz jako zaległą
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
