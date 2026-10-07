'use client';

import { useState } from 'react';
import { CONTRACT_STATUS_LABELS, Contract } from '@/lib/types';
import { sendContractEmail, signContract } from '@/app/actions/contracts';

// Podgląd umowy: eksport do PDF przez druk systemowy (Ctrl+P → zapisz jako PDF),
// wysyłka mailem (stub) i e-akceptacja (timestamp + IP).
export default function ContractView({
  contract: initial,
  contactEmail,
  renderedHtml,
  canManage = true,
}: {
  contract: Contract;
  contactEmail: string | null;
  renderedHtml: string;
  canManage?: boolean; // true = CEO (akcje zarządcze); false = publiczny widok prospekta
}) {
  const [contract, setContract] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSend() {
    setBusy(true);
    setMessage(null);
    try {
      const msg = await sendContractEmail(contract.id);
      setMessage(msg);
      setContract((c) => (c.status === 'szkic' ? { ...c, status: 'wyslana' } : c));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Błąd wysyłki');
    } finally {
      setBusy(false);
    }
  }

  async function handleSign() {
    setBusy(true);
    setMessage(null);
    try {
      const updated = await signContract(contract.id);
      setContract(updated);
      setMessage('Umowa zaakceptowana elektronicznie.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Błąd akceptacji');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="font-serif text-2xl font-bold text-stone-100">
            Umowa — {contract.pakiet_nazwa}
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Status: <span className="text-gold-light">{CONTRACT_STATUS_LABELS[contract.status]}</span>
            {contract.accepted_at && (
              <>
                {' '}
                · zaakceptowana {new Date(contract.accepted_at).toLocaleString('pl-PL')} (IP:{' '}
                {contract.accepted_ip})
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && contract.status === 'zaakceptowana' && (
            <a href={`/wypowiedzenie/${contract.id}`} className="btn-ghost">
              Generuj wypowiedzenie
            </a>
          )}
          <button className="btn-ghost" onClick={() => window.print()}>
            Pobierz PDF (drukuj)
          </button>
          {canManage && (
            <button className="btn-ghost" disabled={busy || !contactEmail} onClick={handleSend}>
              {contactEmail ? 'Wyślij mailem' : 'Brak e-maila kontaktu'}
            </button>
          )}
          {contract.status !== 'zaakceptowana' && (
            <button className="btn-primary" disabled={busy} onClick={handleSign}>
              Akceptuję warunki
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className="mb-4 rounded-md border border-gold-dim/40 bg-gold/5 px-4 py-2 text-sm text-gold-light print:hidden">
          {message}
        </div>
      )}

      <div className="card contract-doc p-8 print:border-none print:bg-white print:p-0">
        <div dangerouslySetInnerHTML={{ __html: renderedHtml }} />
        {contract.accepted_at && (
          <div className="mt-8 border-t border-ink-border pt-4 text-xs text-stone-500 print:border-stone-300 print:text-stone-600">
            Zaakceptowano elektronicznie: {new Date(contract.accepted_at).toLocaleString('pl-PL')} ·
            IP: {contract.accepted_ip}
          </div>
        )}
      </div>
    </div>
  );
}
