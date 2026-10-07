import { listServers } from '@/app/actions/contacts';
import ServersView from '@/components/servers/ServersView';

export const metadata = { title: 'Serwery — STRONEVO OS' };
export const dynamic = 'force-dynamic';

export default async function SerweryPage() {
  const servers = await listServers();

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-stone-100">Serwery</h1>
        <p className="mt-1 text-sm text-stone-500">
          Multi-VPS — każdy serwer z własną instancją n8n, klientami i kontekstem działania
        </p>
      </header>
      <ServersView servers={servers} />
    </div>
  );
}
