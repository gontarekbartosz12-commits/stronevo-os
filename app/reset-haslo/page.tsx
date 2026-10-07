import ResetPasswordForm from '@/components/ui/ResetPasswordForm';

export const metadata = { title: 'Ustaw nowe hasło — STRONEVO OS' };
export const dynamic = 'force-dynamic';

// PUBLICZNA strona ustawienia nowego hasła (z linku „reset" w mailu).
// Sesja recovery przychodzi w URL — middleware musi puścić /reset-haslo bez cookie.
export default function ResetHasloPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-serif text-4xl font-bold tracking-wide text-gold">
            STRONEVO <span className="text-bordo-glow">OS</span>
          </h1>
          <p className="mt-2 text-sm text-stone-500">Ustaw nowe hasło do panelu</p>
        </div>
        <div className="card p-8 shadow-2xl shadow-black/50">
          <ResetPasswordForm />
        </div>
      </div>
    </main>
  );
}
