import { listContacts } from '@/app/actions/contacts';
import {
  listCustomObjectsAction,
  listSmartListsAction,
} from '@/app/actions/produktyzacja';
import BazaHub from '@/components/baza/BazaHub';

export const metadata = { title: 'Baza (CRM+) — STRONEVO OS' };
export const dynamic = 'force-dynamic';

// BAZA (CRM+): smart listy (zapisane filtry kontaktów, liczone na żywo)
// + custom objects (schematy = operator, rekordy = dane robocze).
export default async function BazaPage() {
  const [smartLists, objects, contacts] = await Promise.all([
    listSmartListsAction(),
    listCustomObjectsAction(),
    listContacts(),
  ]);
  const klienci = contacts.filter((c) => c.typ === 'klient' && !c.owner_contact_id);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-3xl font-bold text-stone-100">Baza (CRM+)</h1>
        <p className="mt-1 text-sm text-stone-500">
          Smart listy i własne typy rekordów — głębia CRM ponad standardowy pipeline.
        </p>
      </div>
      <BazaHub smartLists={smartLists} objects={objects} klienci={klienci} />
    </div>
  );
}
