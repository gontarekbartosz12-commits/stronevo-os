import { getClientPortalData } from '@/app/actions/client-portal';
import { listMyLeads } from '@/app/actions/client-crm';
import { listInboxConversations, listTemplates } from '@/app/actions/conversations';
import { getCredentialsIntake } from '@/app/actions/credentials';
import { listPaymentLinksAction, listPaymentsAction } from '@/app/actions/commerce';
import {
  listReviewRequestsAction,
  listReviewsAction,
  listSocialPostsAction,
} from '@/app/actions/marketing';
import { getUptimeStats } from '@/app/actions/uptime';
import { getValuePanel } from '@/app/actions/value';
import { getWynikiClient } from '@/app/actions/wyniki';
import { listCalendarsAction } from '@/app/actions/produktyzacja';
import { socialPublishWired } from '@/lib/social-publish';
import { paymentsWired } from '@/lib/payments';
import ClientBooking from '@/components/klient/ClientBooking';
import ClientPortal from '@/components/klient/ClientPortal';
import ClientStatusBar from '@/components/klient/ClientStatusBar';
import ClientTabs from '@/components/klient/ClientTabs';
import CallsLiveBoard from '@/components/calls/CallsLiveBoard';
import ClientCrm from '@/components/klient/ClientCrm';
import ClientMarketing from '@/components/klient/ClientMarketing';
import ClientPayments from '@/components/klient/ClientPayments';
import CredentialsIntake from '@/components/klient/CredentialsIntake';
import Inbox from '@/components/rozmowy/Inbox';
import ClientResults from '@/components/wyniki/ClientResults';
import UptimeWidget from '@/components/wyniki/UptimeWidget';
import ValuePanel from '@/components/value/ValuePanel';
import { signOut } from '@/app/actions/auth';
import { isSupabaseConfigured } from '@/lib/supabase/config';

export const metadata = { title: 'Panel klienta — STRONEVO' };
export const dynamic = 'force-dynamic';

// Panel klienta (rola klient): widzi WYŁĄCZNIE dane swojego contact_id.
// CEO/demo może podejrzeć panel klienta przez ?contact_id=...
export default async function KlientPage({
  searchParams,
}: {
  searchParams: Promise<{ contact_id?: string }>;
}) {
  const { contact_id } = await searchParams;
  const data = await getClientPortalData(contact_id);
  const valueData = await getValuePanel(data.contact.id);
  const myLeads = await listMyLeads(data.contact.id);
  const wyniki = await getWynikiClient(data.contact.id);
  const intake = await getCredentialsIntake(data.contact.id);
  const uptime = await getUptimeStats(data.contact.id);
  const rozmowy = await listInboxConversations(data.contact.id);
  const szablony = await listTemplates(data.contact.id);
  const posty = await listSocialPostsAction(data.contact.id);
  const opinie = await listReviewsAction(data.contact.id);
  const prosby = await listReviewRequestsAction(data.contact.id);
  const platnosci = await listPaymentsAction(data.contact.id);
  const linkiPlatnosci = await listPaymentLinksAction(data.contact.id);
  // Rezerwacje klienta (RLS scopuje do jego sesji; w podglądzie CEO filtrujemy jawnie)
  const kalendarze = (await listCalendarsAction()).filter(
    (c) => c.owner_contact_id === data.contact.id
  );
  const platnosciWired = paymentsWired();

  // Status uruchomienia (Pulpit) — co już działa vs co kończy opiekun.
  const statusItems = [
    { label: 'Godziny pracy', ready: valueData.hoursDefined },
    { label: 'Rezerwacje', ready: kalendarze.length > 0 },
    { label: 'Kanały rozmów', ready: rozmowy.length > 0 },
    { label: 'Płatności online', ready: platnosciWired },
    { label: 'Automatyzacje', ready: data.automations.length > 0 },
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-ink-border bg-ink-soft/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <div>
            <span className="font-serif text-xl font-bold tracking-wide text-gold">
              STRONEVO <span className="text-bordo-glow">· Panel klienta</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-stone-400">
              {data.contact.firma ?? data.contact.imie}
            </span>
            {!data.previewMode && isSupabaseConfigured() && (
              <>
                <a
                  href="/zmiana-hasla"
                  className="rounded-md border border-ink-border px-3 py-1.5 text-xs text-stone-400 transition hover:border-gold-dim hover:text-gold-light"
                >
                  🔑 Zmień hasło
                </a>
                <form action={signOut}>
                  <button
                    type="submit"
                    className="rounded-md border border-ink-border px-3 py-1.5 text-xs text-stone-400 transition hover:border-bordo hover:text-stone-200"
                  >
                    Wyloguj
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </header>

      {data.previewMode && (
        <div className="border-b border-gold-dim/40 bg-gold/10 px-4 py-2 text-center text-xs text-gold-light">
          Podgląd panelu klienta ({data.contact.firma ?? data.contact.imie}) — widok CEO/demo
        </div>
      )}

      <main className="mx-auto max-w-5xl px-4 py-6">
        <ClientTabs
          pulpit={
            <div className="space-y-8">
              <ClientStatusBar items={statusItems} />
              {/* EKRAN KASY — „powód płacenia" na wejściu */}
              <section>
                <h2 className="mb-4 font-serif text-2xl font-bold text-stone-100">Panel Wartości</h2>
                <ValuePanel contactId={data.contact.id} data={valueData} />
              </section>
              {wyniki && (
                <section>
                  <h2 className="mb-4 font-serif text-2xl font-bold text-stone-100">Twoje wyniki</h2>
                  <ClientResults data={wyniki} />
                  {uptime.length > 0 && (
                    <div className="mt-5">
                      <UptimeWidget stats={uptime} variant="klient" />
                    </div>
                  )}
                </section>
              )}
            </div>
          }
          rozmowy={
            <div className="space-y-8">
              <section>
                <h2 className="mb-1 font-serif text-2xl font-bold text-stone-100">Rozmowy</h2>
                <p className="mb-4 text-sm text-stone-500">
                  Wiadomości od Twoich klientów ze wszystkich kanałów w jednym miejscu. Bot AI
                  odpowiada z Twojej bazy wiedzy — a gdy trzeba, przekazuje rozmowę Tobie.
                </p>
                <Inbox
                  initial={rozmowy}
                  templates={szablony}
                  variant="klient"
                  scopeOwner={data.contact.id}
                  paymentsWired={platnosciWired}
                />
              </section>
              <section>
                <h2 className="mb-4 font-serif text-2xl font-bold text-stone-100">
                  Połączenia na żywo
                </h2>
                <CallsLiveBoard contactId={data.contact.id} maskNumbers={false} />
              </section>
            </div>
          }
          klienci={
            <div className="space-y-8">
              <section>
                <h2 className="mb-1 font-serif text-2xl font-bold text-stone-100">Rezerwacje online</h2>
                <p className="mb-4 text-sm text-stone-500">
                  Twój link „umów wizytę" — wyślij go klientom albo wpnij na stronę; rezerwacje
                  spływają tutaj.
                </p>
                <ClientBooking calendars={kalendarze} />
              </section>
              <section>
                <h2 className="mb-1 font-serif text-2xl font-bold text-stone-100">Mój CRM</h2>
                <p className="mb-4 text-sm text-stone-500">
                  Twoi klienci i leady, kalendarz działań oraz segmenty do remarketingu — w jednym miejscu.
                </p>
                <ClientCrm initialLeads={myLeads} ownerContactId={data.contact.id} />
              </section>
              <section>
                <h2 className="mb-1 font-serif text-2xl font-bold text-stone-100">Płatności</h2>
                <p className="mb-4 text-sm text-stone-500">
                  Wystaw link do płatności i wyślij SMS-em — pieniądze i faktura spinają się same.
                </p>
                <ClientPayments
                  contactId={data.contact.id}
                  payments={platnosci}
                  links={linkiPlatnosci}
                  wired={platnosciWired}
                />
              </section>
            </div>
          }
          marketing={
            <section>
              <h2 className="mb-1 font-serif text-2xl font-bold text-stone-100">Marketing</h2>
              <p className="mb-4 text-sm text-stone-500">
                Zaplanuj posty i odpowiadaj na opinie. Twoją stroną, kampaniami i automatyzacjami
                zajmuje się STRONEVO.
              </p>
              <ClientMarketing
                contactId={data.contact.id}
                posts={posty}
                reviews={opinie}
                requests={prosby}
                publishWired={socialPublishWired()}
              />
            </section>
          }
          konto={
            <div className="space-y-8">
              {intake.wszystkie > 0 && (
                <section>
                  <CredentialsIntake contactId={data.contact.id} initial={intake} />
                </section>
              )}
              <ClientPortal data={data} parts={['automatyzacje', 'faktury', 'sprzedaz']} />
            </div>
          }
        />
      </main>
    </div>
  );
}
