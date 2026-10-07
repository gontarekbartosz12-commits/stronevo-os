import { listNotifications } from '@/app/actions/notifications';
import NotificationList from '@/components/notifications/NotificationList';

export const metadata = { title: 'Powiadomienia — STRONEVO OS' };
export const dynamic = 'force-dynamic';

export default async function PowiadomieniaPage() {
  // listNotifications() po drodze uruchamia detekcję zaległych faktur
  // (ensureBusinessNotifications) — lazy zamiast osobnego crona.
  const notifications = await listNotifications();

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-stone-100">Centrum powiadomień</h1>
        <p className="mt-1 text-sm text-stone-500">
          Techniczne, biznesowe i agentowe — z akcjami do natychmiastowego wykonania
        </p>
      </header>
      <NotificationList initialNotifications={notifications} />
    </div>
  );
}
