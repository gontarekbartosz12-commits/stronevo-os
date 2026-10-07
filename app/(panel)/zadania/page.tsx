import { listContacts } from '@/app/actions/contacts';
import { listTasks } from '@/app/actions/tasks';
import TaskBoard from '@/components/tasks/TaskBoard';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import { Role } from '@/lib/types';

export const metadata = { title: 'Zadania — STRONEVO OS' };
export const dynamic = 'force-dynamic';

export default async function ZadaniaPage() {
  const [tasks, contacts] = await Promise.all([listTasks(), listContacts()]);

  // Rola steruje dostępnymi akcjami (pracownik: postęp + wyślij do review;
  // CEO: dodatkowo akceptuj/odrzuć). W trybie demo — widok CEO.
  let role: Role = 'ceo';
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    role = (user?.user_metadata?.role as Role) ?? 'pracownik';
  }

  const contactNames = Object.fromEntries(
    contacts.map((c) => [c.id, c.firma ?? c.imie])
  );

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-stone-100">Zadania</h1>
        <p className="mt-1 text-sm text-stone-500">
          Kolejka pracy — pracownik oznacza postęp, CEO zatwierdza efekty
        </p>
      </header>
      <TaskBoard initialTasks={tasks} contactNames={contactNames} role={role} />
    </div>
  );
}
