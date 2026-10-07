import LoginForm from '@/components/ui/LoginForm';

export const metadata = { title: 'Logowanie — STRONEVO OS' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ blocked?: string }>;
}) {
  const { blocked } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-serif text-4xl font-bold tracking-wide text-gold">
            STRONEVO <span className="text-bordo-glow">OS</span>
          </h1>
          <p className="mt-2 text-sm text-stone-500">
            Panel operacyjny STRONEVO.AI
          </p>
        </div>

        {blocked && (
          <div className="mb-4 rounded-md border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            Dostęp do konta został zawieszony — najczęściej z powodu nieopłaconej
            faktury. Skontaktuj się: kontakt@stronevo.pl.
          </div>
        )}

        <div className="card p-8 shadow-2xl shadow-black/50">
          <LoginForm />
        </div>

        {/* Wersja desktop (Tauri) — ten sam panel, natywne okno + auto-update */}
        <div className="mt-6 text-center">
          <a
            href="/api/desktop/download"
            className="inline-flex items-center gap-2 rounded-md border border-ink-border px-4 py-2 text-sm text-stone-400 transition hover:border-gold-dim hover:text-gold-light"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
              <path d="M12 3v11" />
              <path d="M8 10l4 4 4-4" />
              <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
            Pobierz aplikację na Windows (.exe)
          </a>
          <p className="mt-2 text-xs text-stone-600">
            Wersja przeglądarkowa działa równolegle — to ten sam panel.
          </p>
        </div>
      </div>
    </main>
  );
}
