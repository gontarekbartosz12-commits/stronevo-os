'use client';

import { useState } from 'react';
import {
  CampaignWithStats,
  FormWithMeta,
  SiteWithMeta,
} from '@/app/actions/marketing';
import {
  AdCampaign,
  Contact,
  EmailList,
  Review,
  ReviewRequest,
  SocialPost,
} from '@/lib/types';
import AdsTab from './AdsTab';
import EmailTab from './EmailTab';
import ReviewsTab from './ReviewsTab';
import SitesTab from './SitesTab';
import SocialTab from './SocialTab';

// HUB MARKETINGOWY (operator): Strony · Formularze · E-mail · Social · Opinie · Reklamy.

const TABS = ['Strony', 'Formularze', 'E-mail', 'Social', 'Opinie', 'Reklamy'] as const;
type Tab = (typeof TABS)[number];

export default function MarketingHub({
  sites,
  forms,
  campaigns,
  lists,
  posts,
  reviews,
  requests,
  adCampaigns,
  klienci,
  publishWired,
}: {
  sites: SiteWithMeta[];
  forms: FormWithMeta[];
  campaigns: CampaignWithStats[];
  lists: EmailList[];
  posts: SocialPost[];
  reviews: Review[];
  requests: ReviewRequest[];
  adCampaigns: AdCampaign[];
  klienci: Contact[];
  publishWired: boolean;
}) {
  const [tab, setTab] = useState<Tab>('Strony');
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-lg border border-ink-border p-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-4 py-1.5 text-sm transition ${
              tab === t
                ? 'bg-bordo/30 font-semibold text-gold-light'
                : 'text-stone-500 hover:text-stone-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {message && (
        <div className="rounded-md border border-gold-dim/40 bg-gold/5 px-4 py-2 text-sm text-gold-light">
          {message}
          <button className="ml-3 underline" onClick={() => setMessage(null)}>
            zamknij
          </button>
        </div>
      )}

      {tab === 'Strony' && <SitesTab sites={sites} klienci={klienci} onMessage={setMessage} />}

      {tab === 'Formularze' && (
        <div className="space-y-3">
          <p className="text-sm text-stone-500">
            Definicje formularzy i webhooki on-submit konfiguruje operator (n8n). Zgłoszenia
            automatycznie tworzą leady w CRM właściciela (z twardą zgodą RODO).
          </p>
          {forms.map((f) => (
            <div key={f.id} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-stone-100">
                  {f.nazwa}
                  <span className="ml-2 text-xs font-normal text-stone-500">
                    {f.ownerName} · id: <code className="text-gold-dim">{f.id}</code>
                  </span>
                </p>
                <span className="text-xs text-stone-400">{f.zgloszenia} zgłoszeń</span>
              </div>
              <p className="mt-1 text-xs text-stone-500">
                Pola: {f.pola.map((p) => p.label).join(', ')} · zgoda RODO wymagana
              </p>
              {f.ostatnie.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-ink-border/60 pt-2">
                  {f.ostatnie.map((s) => (
                    <li key={s.id} className="truncate text-xs text-stone-400">
                      {new Date(s.created_at).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}{' '}
                      — {JSON.stringify(s.dane).slice(0, 120)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'E-mail' && <EmailTab campaigns={campaigns} lists={lists} onMessage={setMessage} />}

      {tab === 'Social' && (
        <SocialTab posts={posts} klienci={klienci} publishWired={publishWired} onMessage={setMessage} />
      )}

      {tab === 'Opinie' && (
        <ReviewsTab reviews={reviews} requests={requests} klienci={klienci} onMessage={setMessage} />
      )}

      {tab === 'Reklamy' && (
        <AdsTab campaigns={adCampaigns} klienci={klienci} onMessage={setMessage} />
      )}
    </div>
  );
}
