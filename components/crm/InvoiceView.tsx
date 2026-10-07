'use client';

import { Contact, Invoice } from '@/lib/types';

const STATUS_LABEL: Record<Invoice['status'], string> = {
  wystawiona: 'Wystawiona — oczekuje na płatność',
  oplacona: 'Opłacona',
  zalegla: 'Zaległa',
};

// Podgląd faktury z eksportem do PDF (druk systemowy). Dokument poglądowy —
// oryginał wystawia Fakturownia (link, gdy skonfigurowana).
export default function InvoiceView({
  invoice,
  contact,
  fakturowniaPdfUrl,
}: {
  invoice: Invoice;
  contact: Contact;
  fakturowniaPdfUrl: string | null;
}) {
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="font-serif text-2xl font-bold text-stone-100">Faktura</h1>
        <div className="flex gap-2">
          {fakturowniaPdfUrl && (
            <a href={fakturowniaPdfUrl} target="_blank" rel="noreferrer" className="btn-primary">
              Oryginalny PDF (Fakturownia)
            </a>
          )}
          <button className="btn-ghost" onClick={() => window.print()}>
            Pobierz PDF (drukuj)
          </button>
        </div>
      </div>

      <div className="card p-8 print:border-none print:bg-white print:p-0 print:text-black">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="font-serif text-xl font-bold text-gold print:text-black">STRONEVO</p>
            <p className="text-xs text-stone-500 print:text-stone-600">Bartosz Gontarek</p>
          </div>
          <div className="text-right text-xs text-stone-500 print:text-stone-600">
            <p>Nr: {invoice.fakturownia_id ?? invoice.id}</p>
            <p>Data: {invoice.data}</p>
          </div>
        </div>

        <div className="mb-6 rounded-md border border-ink-border p-4 print:border-stone-300">
          <p className="text-[11px] uppercase tracking-wider text-stone-600">Nabywca</p>
          <p className="mt-1 font-medium text-stone-200 print:text-black">
            {contact.firma ?? contact.imie}
          </p>
          {contact.nip && <p className="text-sm text-stone-400 print:text-stone-700">NIP: {contact.nip}</p>}
          {contact.adres && <p className="text-sm text-stone-400 print:text-stone-700">{contact.adres}</p>}
        </div>

        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-ink-border text-[11px] uppercase tracking-wider text-stone-500 print:border-stone-300">
              <th className="py-2">Pozycja</th>
              <th className="py-2">Cykl</th>
              <th className="py-2 text-right">Kwota netto</th>
            </tr>
          </thead>
          <tbody>
            <tr className="text-stone-300 print:text-black">
              <td className="py-3">{invoice.tytul}</td>
              <td className="py-3">{invoice.cykl}</td>
              <td className="py-3 text-right font-semibold">{invoice.kwota} zł</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-6 flex items-center justify-between border-t border-ink-border pt-4 print:border-stone-300">
          <span
            className={`text-sm font-medium ${
              invoice.status === 'oplacona'
                ? 'text-emerald-400'
                : invoice.status === 'zalegla'
                  ? 'text-red-400'
                  : 'text-gold-light'
            } print:text-black`}
          >
            {STATUS_LABEL[invoice.status]}
          </span>
          <p className="font-serif text-2xl font-bold text-gold print:text-black">
            {invoice.kwota} zł
          </p>
        </div>

        <p className="mt-6 text-[11px] text-stone-600">
          Dokument poglądowy z panelu STRONEVO. Oryginał faktury wystawia system księgowy.
        </p>
      </div>
    </div>
  );
}
