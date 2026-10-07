'use client';

import Link from 'next/link';

// Podgląd wypowiedzenia: przełącznik kierunku (kto wypowiada) + PDF przez druk.
// Dzień Zakończenia wyliczany od DZIŚ — przy realnej wysyłce decyduje data
// doręczenia (notka w dokumencie).
export default function TerminationView({
  contractId,
  wypowiadajacy,
  renderedHtml,
}: {
  contractId: string;
  wypowiadajacy: 'Zamawiający' | 'Wykonawca';
  renderedHtml: string;
}) {
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="font-serif text-2xl font-bold text-stone-100">
            Wypowiedzenie umowy
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Oświadczenie składa: <span className="text-gold-light">{wypowiadajacy}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-md border border-ink-border p-0.5">
            <Link
              href={`/wypowiedzenie/${contractId}?strona=zamawiajacy`}
              className={`rounded px-3 py-1.5 text-sm transition ${
                wypowiadajacy === 'Zamawiający'
                  ? 'bg-bordo text-stone-100'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              Zamawiający
            </Link>
            <Link
              href={`/wypowiedzenie/${contractId}?strona=wykonawca`}
              className={`rounded px-3 py-1.5 text-sm transition ${
                wypowiadajacy === 'Wykonawca'
                  ? 'bg-bordo text-stone-100'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              Wykonawca
            </Link>
          </div>
          <button className="btn-primary" onClick={() => window.print()}>
            Pobierz PDF (drukuj)
          </button>
        </div>
      </div>

      <div className="card contract-doc p-8 print:border-none print:bg-white print:p-0">
        <div dangerouslySetInnerHTML={{ __html: renderedHtml }} />
      </div>
    </div>
  );
}
