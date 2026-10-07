import Link from 'next/link';
import { countNewNotifications } from '@/app/actions/notifications';

// Topbar z dzwonkiem powiadomień (badge = liczba nowych)
export default async function Topbar() {
  let newCount = 0;
  try {
    newCount = await countNewNotifications();
  } catch {
    // brak dostępu do bazy nie powinien wywracać layoutu
  }

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-end border-b border-ink-border bg-ink-soft/80 px-6 backdrop-blur">
      <Link
        href="/powiadomienia"
        className="relative rounded-md p-2 text-stone-400 transition hover:bg-ink-hover hover:text-gold-light"
        title="Powiadomienia"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="h-5 w-5"
        >
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {newCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-bordo px-1 text-[10px] font-bold text-stone-100">
            {newCount > 99 ? '99+' : newCount}
          </span>
        )}
      </Link>
    </header>
  );
}
