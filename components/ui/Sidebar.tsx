'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from '@/app/actions/auth';

const NAV = [
  {
    href: '/crm',
    label: 'Pipeline (CRM)',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <rect x="3" y="4" width="5" height="16" rx="1" />
        <rect x="10" y="4" width="5" height="10" rx="1" />
        <rect x="17" y="4" width="4" height="13" rx="1" />
      </svg>
    ),
  },
  {
    href: '/baza',
    label: 'Baza (CRM+)',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <ellipse cx="12" cy="6" rx="8" ry="3" />
        <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
        <path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
      </svg>
    ),
  },
  {
    href: '/rezerwacje',
    label: 'Rezerwacje',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 9h18M8 3v4M16 3v4" />
        <path d="M9 14l2 2 4-4" />
      </svg>
    ),
  },
  {
    href: '/kalendarz',
    label: 'Kalendarz spotkań',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 9h18M8 3v4M16 3v4" />
      </svg>
    ),
  },
  {
    href: '/rozmowy',
    label: 'Rozmowy',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M21 12a8 8 0 0 1-8 8H4l2.5-2.5A8 8 0 1 1 21 12z" />
        <path d="M8.5 11h.01M12 11h.01M15.5 11h.01" />
      </svg>
    ),
  },
  {
    href: '/marketing',
    label: 'Marketing',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M3 11l14-6v14L3 13v-2z" />
        <path d="M11 13.5V17a2 2 0 0 0 4 0" />
        <path d="M21 9v4" />
      </svg>
    ),
  },
  {
    href: '/commerce',
    label: 'Commerce',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18" />
        <path d="M7 15h4" />
      </svg>
    ),
  },
  {
    href: '/wyniki',
    label: 'Panel Wyników',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M3 20h18" />
        <path d="M6 20v-6M11 20V9M16 20v-4M21 20V5" />
        <path d="M4 10l5-4 4 3 6-6" />
      </svg>
    ),
  },
  {
    href: '/kalkulator-strat',
    label: 'Kalkulator strat',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M8 7h8M8 11h2M12 11h2M16 11h.01M8 15h2M12 15h2M16 15h.01M8 19h6" />
      </svg>
    ),
  },
  {
    href: '/katalog',
    label: 'Katalog automatyzacji',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <rect x="3" y="3" width="8" height="8" rx="1.5" />
        <rect x="13" y="3" width="8" height="8" rx="1.5" />
        <rect x="3" y="13" width="8" height="8" rx="1.5" />
        <rect x="13" y="13" width="8" height="8" rx="1.5" />
      </svg>
    ),
  },
  {
    href: '/zadania',
    label: 'Zadania',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M9 6h11M9 12h11M9 18h11" />
        <path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />
      </svg>
    ),
  },
  {
    href: '/agenci',
    label: 'Agenci',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <rect x="5" y="7" width="14" height="11" rx="2" />
        <path d="M12 7V4M8 4h8" />
        <circle cx="9.5" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="14.5" cy="12" r="1" fill="currentColor" stroke="none" />
        <path d="M9.5 15.5h5" />
      </svg>
    ),
  },
  {
    href: '/serwery',
    label: 'Serwery',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <rect x="3" y="4" width="18" height="7" rx="1.5" />
        <rect x="3" y="13" width="18" height="7" rx="1.5" />
        <path d="M7 7.5h.01M7 16.5h.01" />
      </svg>
    ),
  },
  {
    href: '/audiencje',
    label: 'Audiencje',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <circle cx="9" cy="8" r="3.5" />
        <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
        <circle cx="17.5" cy="9" r="2.5" />
        <path d="M16 14.5c2.8 0 5 2 5 5.5" />
      </svg>
    ),
  },
  {
    href: '/powiadomienia',
    label: 'Powiadomienia',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </svg>
    ),
  },
  {
    href: '/dashboard',
    label: 'Dashboard CEO',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M3 12a9 9 0 1 1 18 0" />
        <path d="M12 12l4-4" />
        <path d="M3 20h18" />
      </svg>
    ),
  },
];

export default function Sidebar({
  userEmail,
  demoMode,
}: {
  userEmail: string | null;
  demoMode: boolean;
}) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-ink-border bg-ink-soft/80 backdrop-blur">
      <div className="border-b border-ink-border px-5 py-6">
        <Link href="/" className="block">
          <span className="font-serif text-2xl font-bold tracking-wide text-gold">
            STRONEVO <span className="text-bordo-glow">OS</span>
          </span>
        </Link>
        <p className="mt-1 text-[11px] uppercase tracking-widest text-stone-600">
          Panel operacyjny
        </p>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition ${
                active
                  ? 'bg-bordo/25 font-semibold text-gold-light'
                  : 'text-stone-400 hover:bg-ink-hover hover:text-stone-200'
              }`}
            >
              <span className={active ? 'text-gold' : 'text-stone-500'}>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-ink-border px-5 py-4">
        {demoMode ? (
          <div className="rounded-md border border-gold-dim/40 bg-gold/5 px-3 py-2 text-xs text-gold-light">
            Tryb demo — brak konfiguracji Supabase
          </div>
        ) : (
          <div className="space-y-2">
            <Link
              href="/zmiana-hasla"
              className="block text-[11px] text-stone-500 transition hover:text-gold-light"
            >
              🔑 Zmień hasło
            </Link>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs text-stone-400">{userEmail}</p>
                <p className="text-[11px] uppercase tracking-wider text-gold-dim">CEO</p>
              </div>
              <form action={signOut}>
                <button
                  type="submit"
                  className="rounded-md border border-ink-border px-2.5 py-1.5 text-xs text-stone-400 transition hover:border-bordo hover:text-stone-200"
                >
                  Wyloguj
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
