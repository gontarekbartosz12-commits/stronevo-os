import { notFound } from 'next/navigation';
import PayBox from './PayBox';
import { demoStore } from '@/lib/demo-store';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { Contact, PaymentLink } from '@/lib/types';

// Strona płatności /pay/[token] (text-to-pay, Faza 4) — publiczna, kapability
// URL wysyłany SMS-em. Jasny motyw (strona płatnika), kwota DOKŁADNA.
export const metadata = {
  title: 'Płatność — STRONEVO',
  robots: { index: false, follow: false, nocache: true },
};
export const dynamic = 'force-dynamic';

async function getLink(token: string): Promise<{ link: PaymentLink; firma: string } | null> {
  if (!isSupabaseConfigured()) {
    const link = demoStore.getPaymentLinkByToken(token);
    if (!link) return null;
    const c = link.contact_id ? demoStore.getContact(link.contact_id) : null;
    return { link, firma: c?.firma ?? c?.imie ?? 'STRONEVO' };
  }
  const supabase = isAdminConfigured() ? createAdminClient() : await createClient();
  const { data } = await supabase.from('payment_links').select('*').eq('token', token).maybeSingle();
  if (!data) return null;
  const link = data as PaymentLink;
  let firma = 'STRONEVO';
  if (link.contact_id) {
    const { data: c } = await supabase
      .from('contacts')
      .select('firma, imie')
      .eq('id', link.contact_id)
      .maybeSingle();
    firma = (c as Contact | null)?.firma ?? (c as Contact | null)?.imie ?? firma;
  }
  return { link, firma };
}

export default async function PayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await getLink(token);
  if (!found) notFound();
  const { link, firma } = found;

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 px-4 py-10 font-sans">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
          Płatność dla
        </p>
        <h1 className="mt-1 font-serif text-2xl font-bold text-stone-900">{firma}</h1>

        <div className="mt-6 rounded-xl border border-stone-200 bg-stone-50 p-5">
          <p className="text-sm text-stone-600">{link.opis}</p>
          <p className="mt-2 font-serif text-4xl font-bold text-stone-900">
            {Number(link.kwota).toFixed(2)} <span className="text-xl">{link.waluta}</span>
          </p>
          {link.external?.imie && (
            <p className="mt-1 text-xs text-stone-400">dla: {link.external.imie}</p>
          )}
        </div>

        {link.status === 'oplacony' ? (
          <div className="mt-6 rounded-xl border border-emerald-300 bg-emerald-50 p-5 text-center">
            <p className="font-semibold text-emerald-800">✓ Opłacono</p>
            <p className="mt-1 text-xs text-emerald-700">
              Dziękujemy! Potwierdzenie i faktura zostały wystawione.
            </p>
          </div>
        ) : link.status === 'wygasly' ? (
          <p className="mt-6 rounded-xl border border-stone-200 bg-stone-50 p-5 text-center text-sm text-stone-500">
            Ten link płatności wygasł — poproś o nowy.
          </p>
        ) : (
          <PayBox token={link.token} />
        )}

        <p className="mt-6 text-center text-[11px] text-stone-400">
          Bezpieczne płatności obsługuje STRONEVO · kwota pobierana dokładnie jak wyżej
        </p>
      </div>
    </main>
  );
}
