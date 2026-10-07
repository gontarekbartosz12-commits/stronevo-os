import { listInboxConversations, listTemplates } from '@/app/actions/conversations';
import { paymentsWired } from '@/lib/payments';
import Inbox from '@/components/rozmowy/Inbox';

export const metadata = { title: 'Rozmowy — STRONEVO OS' };
export const dynamic = 'force-dynamic';

// ROZMOWY (CEO/operator): jedna skrzynka na wszystkie kanały wszystkich
// klientów (SMS, e-mail, WhatsApp, czat WWW, FB/IG, Google). Bot AI odpowiada
// z wiedzy firmy i eskaluje do człowieka — konfiguracja bota = tylko tutaj
// (operator-first; klient w swoim panelu obsługuje ruch, nie automatyzacje).
export default async function RozmowyPage() {
  const [conversations, templates] = await Promise.all([
    listInboxConversations(),
    listTemplates(),
  ]);

  const czekaja = conversations.filter((c) => c.unanswered || c.status === 'oczekuje').length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-3xl font-bold text-stone-100">Rozmowy</h1>
        <p className="mt-1 text-sm text-stone-500">
          Wszystkie kanały w jednej skrzynce · {conversations.length} rozmów
          {czekaja > 0 && (
            <span className="text-bordo-glow"> · {czekaja} czeka na odpowiedź</span>
          )}
        </p>
      </div>

      <Inbox initial={conversations} templates={templates} variant="ceo" paymentsWired={paymentsWired()} />

      <p className="text-[11px] text-stone-600">
        Kanały wpina operator (n8n → /api/conversations/ingest); bot AI odpowiada wyłącznie z bazy
        wiedzy firmy (/api/knowledge/ingest) i przy niepewności przekazuje człowiekowi + łapie lead.
      </p>
    </div>
  );
}
