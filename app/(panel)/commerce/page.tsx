import {
  listCoursesWithMeta,
  listPaymentLinksAction,
  listPaymentsAction,
  listSubscriptionsAction,
} from '@/app/actions/commerce';
import { listContacts } from '@/app/actions/contacts';
import CommerceHub from '@/components/commerce/CommerceHub';

export const metadata = { title: 'Commerce — STRONEVO OS' };
export const dynamic = 'force-dynamic';

// COMMERCE (operator): linki płatnicze text-to-pay (P24/Stripe/PayU),
// subskrypcje z auto-obciążeniem i smart dunningiem, kursy/membership.
// ⚠️ Prawdziwe pieniądze — statusy zmienia wyłącznie webhook z podpisem.
export default async function CommercePage() {
  const [payments, links, subscriptions, courses, contacts] = await Promise.all([
    listPaymentsAction(),
    listPaymentLinksAction(),
    listSubscriptionsAction(),
    listCoursesWithMeta(),
    listContacts(),
  ]);

  const klienci = contacts.filter((c) => c.typ === 'klient' && !c.owner_contact_id);
  const oplacone = payments.filter((p) => p.status === 'oplacona');
  const suma = oplacone.reduce((s, p) => s + Number(p.kwota), 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-3xl font-bold text-stone-100">Commerce</h1>
        <p className="mt-1 text-sm text-stone-500">
          Płatności, subskrypcje i kursy wszystkich klientów · opłacone: {oplacone.length} ·{' '}
          <span className="font-semibold text-gold">{suma.toFixed(2)} zł</span> (kwoty dokładne)
        </p>
      </div>
      <CommerceHub
        payments={payments}
        links={links}
        subscriptions={subscriptions}
        courses={courses}
        klienci={klienci}
      />
    </div>
  );
}
