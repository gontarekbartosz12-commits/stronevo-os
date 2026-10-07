'use client';

import { useState } from 'react';
import { requestMarketingHelp } from '@/app/actions/marketing';
import SocialTab from '@/components/marketing/SocialTab';
import ReviewsTab from '@/components/marketing/ReviewsTab';
import { Review, ReviewRequest, SocialPost } from '@/lib/types';

// Marketing w panelu KLIENTA (hybryda, operator-first): funkcje UŻYTKOWE —
// planowanie postów i obsługa opinii. Strony/kampanie/AI/integracje = STRONEVO;
// przycisk „Chcę więcej" wysyła alert do operatora (done-for-you).

export default function ClientMarketing({
  contactId,
  posts,
  reviews,
  requests,
  publishWired = false,
}: {
  contactId: string;
  posts: SocialPost[];
  reviews: Review[];
  requests: ReviewRequest[];
  publishWired?: boolean;
}) {
  const [tab, setTab] = useState<'Social' | 'Opinie'>('Social');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleWiecej() {
    setBusy(true);
    try {
      setMessage(
        await requestMarketingHelp(
          contactId,
          'Klient prosi o rozbudowę marketingu (strona/kampania/automatyzacja) — z panelu klienta.'
        )
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Błąd');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg border border-ink-border p-1">
          {(['Social', 'Opinie'] as const).map((t) => (
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
        <button
          onClick={handleWiecej}
          disabled={busy}
          className="btn-ghost !py-1.5 text-xs"
          title="Strony, kampanie i automatyzacje buduje dla Ciebie STRONEVO — kliknij, a opiekun się odezwie."
        >
          {busy ? 'Wysyłanie...' : '✨ Chcę więcej (strona / kampania) — poproś STRONEVO'}
        </button>
      </div>

      {message && (
        <div className="rounded-md border border-gold-dim/40 bg-gold/5 px-4 py-2 text-sm text-gold-light">
          {message}
          <button className="ml-3 underline" onClick={() => setMessage(null)}>
            zamknij
          </button>
        </div>
      )}

      {tab === 'Social' && (
        <SocialTab
          posts={posts}
          klienci={[]}
          scopeContactId={contactId}
          publishWired={publishWired}
          onMessage={setMessage}
        />
      )}
      {tab === 'Opinie' && (
        <ReviewsTab
          reviews={reviews}
          requests={requests}
          klienci={[]}
          scopeContactId={contactId}
          onMessage={setMessage}
        />
      )}
    </div>
  );
}
