import { getAgentStats, listAgentRuns } from '@/app/actions/agents';
import { listContacts } from '@/app/actions/contacts';
import { listSnapshotsAction } from '@/app/actions/produktyzacja';
import { getTemplateRegistry } from '@/app/actions/templates';
import AgentsView from '@/components/agents/AgentsView';
import SnapshotsPanel from '@/components/agents/SnapshotsPanel';
import TemplateRegistry from '@/components/agents/TemplateRegistry';
import StatTile from '@/components/dashboard/StatTile';

export const metadata = { title: 'Agenci — STRONEVO OS' };
export const dynamic = 'force-dynamic';

// CRM TECHNICZNY (rola ceo): oś czasu działań agentów — co zbudowali,
// status, koszt. Review outputów + zatwierdzanie deployów (human-in-the-loop).
export default async function AgenciPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const { run } = await searchParams;
  const [runs, stats, templates, snapshots, contacts] = await Promise.all([
    listAgentRuns(),
    getAgentStats(),
    getTemplateRegistry(),
    listSnapshotsAction(),
    listContacts(),
  ]);
  const klienci = contacts.filter((c) => c.typ === 'klient' && !c.owner_contact_id);

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-stone-100">Agenci — CRM techniczny</h1>
        <p className="mt-1 text-sm text-stone-500">
          Control plane: agenci budują i naprawiają, deploy zawsze za zatwierdzeniem
        </p>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatTile label="Agenci pracują" value={stats.pracujace} hint="runy w toku" alert={stats.pracujace > 0} />
        <StatTile label="Do review" value={stats.doReview} hint="outputy czekają na weryfikację" />
        <StatTile label="Wdrożone" value={stats.wdrozone} hint="zadania po pełnym cyklu" />
        <StatTile label="Koszt agentów" value={`${stats.kosztRazem} zł`} hint="suma kosztów runów" />
      </div>

      <AgentsView initialRuns={runs} openRunId={run ?? null} />

      {/* Snapshoty — produktyzacja setupów (Faza 5) */}
      <SnapshotsPanel snapshots={snapshots} klienci={klienci} />

      {/* Rejestr wersji szablonów (Faza 1 zaufania) */}
      <TemplateRegistry data={templates} />
    </div>
  );
}
