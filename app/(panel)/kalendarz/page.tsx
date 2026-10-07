import { listReps, listUpcoming } from '@/app/actions/calendar';
import CalendarAgenda from '@/components/calendar/CalendarAgenda';

export const metadata = { title: 'Kalendarz spotkań — STRONEVO OS' };
export const dynamic = 'force-dynamic';

export default async function KalendarzPage() {
  const [entries, reps] = await Promise.all([listUpcoming(), listReps()]);

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-stone-100">Kalendarz spotkań</h1>
        <p className="mt-1 text-sm text-stone-500">
          Zaplanowane akcje i spotkania z leadami — przydzielaj handlowcom (bez przydziału = Ty).
        </p>
      </header>

      <CalendarAgenda entries={entries} reps={reps} />
    </div>
  );
}
