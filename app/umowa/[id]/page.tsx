import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getContract } from '@/app/actions/contracts';
import ContractView from '@/components/crm/ContractView';
import { CONTRACT_TEMPLATE, renderContract } from '@/lib/contract-template';
import { mdToHtml } from '@/lib/markdown-lite';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';

// Umowa dostępna przez nieodgadywalny UUID (capability URL). noindex/nofollow —
// wyszukiwarki NIGDY nie indeksują umów (brak ryzyka wycieku w wynikach Google).
export const metadata = {
  title: 'Umowa — STRONEVO',
  robots: { index: false, follow: false, nocache: true },
};
export const dynamic = 'force-dynamic';

export default async function UmowaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await getContract(id);
  if (!found) notFound();

  const { contract, contact } = found;
  // Szablon (markdown z polami merge) → treść umowy → HTML
  const renderedHtml = mdToHtml(renderContract(CONTRACT_TEMPLATE, contact, contract));

  // Publiczny widok (prospekt z linku) NIE widzi akcji zarządczych — tylko CEO.
  let canManage = false;
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    canManage = user?.user_metadata?.role === 'ceo';
  } else {
    canManage = true; // tryb demo
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      {canManage && (
        <div className="mb-4 print:hidden">
          <Link href="/crm" className="text-sm text-stone-500 transition hover:text-gold-light">
            &larr; Wróć do CRM
          </Link>
        </div>
      )}
      <ContractView
        contract={contract}
        contactEmail={contact.email}
        renderedHtml={renderedHtml}
        canManage={canManage}
      />
    </main>
  );
}
