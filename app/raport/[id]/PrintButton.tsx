'use client';

// „Pobierz PDF" = natywny druk przeglądarki (strona ma style print) —
// zero zależności, klient zapisuje PDF jednym kliknięciem.
export default function PrintButton() {
  return (
    <button onClick={() => window.print()} className="btn-ghost !py-1.5 text-xs print:hidden">
      Pobierz PDF / Drukuj
    </button>
  );
}
