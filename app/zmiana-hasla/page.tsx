import ChangePasswordForm from '@/components/ui/ChangePasswordForm';

export const metadata = { title: 'Zmiana hasła — STRONEVO OS' };

// Wymuszona zmiana hasła tymczasowego przy pierwszym logowaniu klienta
// (konto powstaje automatem "dostęp po opłacie").
export default function ZmianaHaslaPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-serif text-3xl font-bold tracking-wide text-gold">
            STRONEVO <span className="text-bordo-glow">OS</span>
          </h1>
          <p className="mt-2 text-sm text-stone-500">Ustaw własne hasło do panelu klienta</p>
        </div>
        <div className="card p-8 shadow-2xl shadow-black/50">
          <ChangePasswordForm />
        </div>
      </div>
    </main>
  );
}
