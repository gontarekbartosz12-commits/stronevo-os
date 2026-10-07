import { listContacts } from '@/app/actions/contacts';
import { getRevenueStats } from '@/app/actions/revenue';
import { getHealthchecks, getN8nWorkflows, getVpsStatus } from '@/lib/integrations';
import StatTile from '@/components/dashboard/StatTile';
import RevenuePanel from '@/components/dashboard/RevenuePanel';
import VpsTile from '@/components/dashboard/VpsTile';
import HealthchecksTile from '@/components/dashboard/HealthchecksTile';
import WorkflowTable from '@/components/dashboard/WorkflowTable';
import SourceBadge from '@/components/dashboard/SourceBadge';

export const metadata = { title: 'Dashboard CEO — STRONEVO OS' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [workflows, vps, healthchecks, contacts, revenue] = await Promise.all([
    getN8nWorkflows(),
    getVpsStatus(),
    getHealthchecks(),
    listContacts(),
    getRevenueStats(),
  ]);

  const aktywne = workflows.data.filter((w) => w.aktywny);
  const martwe = workflows.data.filter((w) => !w.aktywny || w.ostatniStatus === 'error');
  const klienci = contacts.filter((c) => c.typ === 'klient').length;
  const hcUp = healthchecks.data.filter((h) => h.status === 'up').length;

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold text-stone-100">Dashboard CEO</h1>
          <p className="mt-1 text-sm text-stone-500">
            Techniczny stan firmy — podgląd read-only
          </p>
        </div>
        <div className="flex gap-2">
          <SourceBadge label="n8n" source={workflows.source} />
          <SourceBadge label="VPS" source={vps.source} />
          <SourceBadge label="healthchecks" source={healthchecks.source} />
        </div>
      </header>

      <RevenuePanel stats={revenue} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Workflowy n8n"
          value={workflows.data.length}
          hint={`${aktywne.length} aktywnych`}
        />
        <StatTile
          label="Workflowy martwe / z błędem"
          value={martwe.length}
          hint={martwe.length > 0 ? martwe.map((w) => w.nazwa).slice(0, 2).join(', ') : 'wszystko działa'}
          alert={martwe.length > 0}
        />
        <StatTile label="Klienci (CRM)" value={klienci} hint="kontakty typu klient" />
        <StatTile
          label="Healthchecks"
          value={`${hcUp}/${healthchecks.data.length}`}
          hint="pingi w normie"
          alert={hcUp < healthchecks.data.length}
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <VpsTile vps={vps.data} />
        <HealthchecksTile checks={healthchecks.data} />
      </div>

      <WorkflowTable workflows={workflows.data} />
    </div>
  );
}
