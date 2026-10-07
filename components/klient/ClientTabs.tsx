'use client';

import { useState, type ReactNode } from 'react';

// Nawigacja modułowa panelu klienta (5 kategorii zamiast jednego scrolla przez
// 14 sekcji). Sloty buduje serwer (page.tsx) i podaje jako ReactNode — tu tylko
// stan aktywnej zakładki + render aktywnego modułu. Nieaktywne moduły się
// ODMONTOWUJĄ, więc polling (Inbox/Połączenia) pauzuje, gdy nie patrzysz.

const TABS = [
  { key: 'pulpit', label: '🏠 Pulpit' },
  { key: 'rozmowy', label: '💬 Rozmowy' },
  { key: 'klienci', label: '📅 Klienci i kalendarz' },
  { key: 'marketing', label: '📣 Marketing' },
  { key: 'konto', label: '⚙️ Moje konto' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function ClientTabs(slots: Record<TabKey, ReactNode>) {
  const [tab, setTab] = useState<TabKey>('pulpit');

  return (
    <div>
      <nav className="sticky top-16 z-30 -mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-ink-border bg-ink/90 px-4 py-2 backdrop-blur">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
              tab === t.key
                ? 'bg-bordo text-stone-100'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div>{slots[tab]}</div>
    </div>
  );
}
