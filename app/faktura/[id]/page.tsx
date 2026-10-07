import Link from 'next/link';
import { notFound } from 'next/navigation';
import { demoStore } from '@/lib/demo-store';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import { Contact, Invoice } from '@/lib/types';
import InvoiceView from '@/components/crm/InvoiceView';

export const metadata = { title: 'Faktura — STRONEVO' };
export const dynamic = 'force-dynamic';

// Widok faktury do druku/PDF. Przy skonfigurowanej Fakturowni i realnym ID
// pokazuje też link do oryginalnego PDF-a z Fakturowni.
// Dostęp klienta do cudzych faktur odcina RLS (polityki w 0003).
export default async function FakturaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let invoice: Invoice | null;
  let contact: Contact | null = null;
  if (!isSupabaseConfigured()) {
    invoice = demoStore.getInvoice(id);
    if (invoice) contact = demoStore.getContact(invoice.contact_id);
  } else {
    const supabase = await createClient();
    const { data: inv } = await supabase.from('invoices').select('*').eq('id', id).maybeSingle();
    invoice = inv as Invoice | null;
    if (invoice) {
      const { data: c } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', invoice.contact_id)
        .maybeSingle();
      contact = c as Contact | null;
    }
  }
  if (!invoice || !contact) notFound();

  const fakturowniaPdfUrl =
    process.env.FAKTUROWNIA_DOMAIN &&
    invoice.fakturownia_id &&
    !invoice.fakturownia_id.startsWith('MOCK')
      ? `https://${process.env.FAKTUROWNIA_DOMAIN}.fakturownia.pl/invoices/${invoice.fakturownia_id}.pdf`
      : null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-4 print:hidden">
        <Link href="/klient" className="text-sm text-stone-500 transition hover:text-gold-light">
          &larr; Wróć do panelu
        </Link>
      </div>
      <InvoiceView invoice={invoice} contact={contact} fakturowniaPdfUrl={fakturowniaPdfUrl} />
    </main>
  );
}
