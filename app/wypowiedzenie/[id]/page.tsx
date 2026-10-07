import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getContract } from '@/app/actions/contracts';
import { mdToHtml } from '@/lib/markdown-lite';
import { renderTermination, TerminatingParty } from '@/lib/termination-template';
import TerminationView from '@/components/crm/TerminationView';

export const metadata = { title: 'Wypowiedzenie umowy — STRONEVO OS' };
export const dynamic = 'force-dynamic';

// Wzór wypowiedzenia umowy — generowany on-the-fly z danych umowy/kontaktu
// (bez zapisu w bazie; PDF przez druk). ?strona=zamawiajacy|wykonawca steruje
// kierunkiem oświadczenia (kto wypowiada).
export default async function WypowiedzeniePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ strona?: string }>;
}) {
  const { id } = await params;
  const { strona } = await searchParams;
  const found = await getContract(id);
  if (!found) notFound();

  const { contract, contact } = found;
  const wypowiadajacy: TerminatingParty =
    strona === 'wykonawca' ? 'Wykonawca' : 'Zamawiający';

  const renderedHtml = mdToHtml(
    renderTermination(contact, contract, { wypowiadajacy })
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-4 print:hidden">
        <Link
          href={`/umowa/${contract.id}`}
          className="text-sm text-stone-500 transition hover:text-gold-light"
        >
          &larr; Wróć do umowy
        </Link>
      </div>
      <TerminationView
        contractId={contract.id}
        wypowiadajacy={wypowiadajacy}
        renderedHtml={renderedHtml}
      />
    </main>
  );
}
