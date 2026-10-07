import {
  listCampaignsWithStats,
  listEmailListsAction,
  listFormsWithMeta,
  listReviewRequestsAction,
  listReviewsAction,
  listSitesWithMeta,
  listSocialPostsAction,
} from '@/app/actions/marketing';
import { listContacts } from '@/app/actions/contacts';
import { listAdCampaignsAction } from '@/app/actions/produktyzacja';
import { socialPublishWired } from '@/lib/social-publish';
import MarketingHub from '@/components/marketing/MarketingHub';

export const metadata = { title: 'Marketing — STRONEVO OS' };
export const dynamic = 'force-dynamic';

// MARKETING (operator): strony/funnele, formularze→leady, kampanie e-mail
// (Brevo + tracking + RODO), social planner, reputacja (prośby + AI-odpowiedzi).
// Klient w /klient dostaje wariant użytkowy (posty + opinie) — struktury,
// wysyłki i AI konfiguruje operator (model done-for-you).
export default async function MarketingPage() {
  const [sites, forms, campaigns, lists, posts, reviews, requests, adCampaigns, contacts] =
    await Promise.all([
      listSitesWithMeta(),
      listFormsWithMeta(),
      listCampaignsWithStats(),
      listEmailListsAction(),
      listSocialPostsAction(),
      listReviewsAction(),
      listReviewRequestsAction(),
      listAdCampaignsAction(),
      listContacts(),
    ]);

  const klienci = contacts.filter((c) => c.typ === 'klient' && !c.owner_contact_id);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-3xl font-bold text-stone-100">Marketing</h1>
        <p className="mt-1 text-sm text-stone-500">
          Strony, formularze, kampanie, social i opinie wszystkich klientów — silnik done-for-you.
        </p>
      </div>
      <MarketingHub
        sites={sites}
        forms={forms}
        campaigns={campaigns}
        lists={lists}
        posts={posts}
        reviews={reviews}
        requests={requests}
        adCampaigns={adCampaigns}
        klienci={klienci}
        publishWired={socialPublishWired()}
      />
    </div>
  );
}
