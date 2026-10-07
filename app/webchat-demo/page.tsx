import Script from 'next/script';

// Strona testowa widgetu czatu (Faza 2) — podgląd tego, co operator wpina
// na stronie klienta jedną linijką <script>. Demo: skrzynka Mercatury (c-1),
// bot odpowiada z jej bazy wiedzy. noindex — strona narzędziowa.
export const metadata = {
  title: 'Demo widgetu czatu — STRONEVO',
  robots: { index: false, follow: false },
};

export default function WebchatDemoPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-serif text-3xl font-bold text-gold">Demo: widget czatu WWW</h1>
      <p className="mt-3 text-sm leading-relaxed text-stone-400">
        Tak wygląda czat, który STRONEVO wpina na stronie klienta jedną linijką skryptu. Kliknij
        dymek w prawym dolnym rogu i zapytaj np. o{' '}
        <em className="text-stone-200">„ile kosztuje przegląd gaśnic?"</em> — bot odpowiada z bazy
        wiedzy firmy (tu: Mercatura), a przy prośbie o kontakt przekazuje rozmowę zespołowi
        i zapisuje lead w CRM.
      </p>
      <pre className="card mt-6 overflow-x-auto p-4 text-xs text-stone-400">
        {`<script src="https://crm.stronevo.pl/api/webchat/widget"
        data-owner="<uuid firmy>" data-name="Mercatura" defer></script>`}
      </pre>
      <Script src="/api/webchat/widget" data-owner="c-1" data-name="Mercatura (ppoż.)" />
    </main>
  );
}
