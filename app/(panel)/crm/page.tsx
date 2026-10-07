import { listContacts, listServers } from '@/app/actions/contacts';
import CrmView from '@/components/crm/CrmView';

export const metadata = { title: 'Pipeline — STRONEVO OS' };
export const dynamic = 'force-dynamic';

export default async function CrmPage() {
  const [contacts, servers] = await Promise.all([listContacts(), listServers()]);

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-stone-100">Pipeline sprzedaży</h1>
        <p className="mt-1 text-sm text-stone-500">
          {contacts.length} kontaktów w lejku — przeciągaj karty między etapami
        </p>
      </header>
      <CrmView initialContacts={contacts} servers={servers} />
    </div>
  );
}
