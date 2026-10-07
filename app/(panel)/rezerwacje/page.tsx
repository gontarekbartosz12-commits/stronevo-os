import { listContacts } from '@/app/actions/contacts';
import { listCalendarsAction } from '@/app/actions/produktyzacja';
import CalendarsPanel from '@/components/rezerwacje/CalendarsPanel';

export const metadata = { title: 'Rezerwacje — STRONEVO OS' };
export const dynamic = 'force-dynamic';

// REZERWACJE (operator): kalendarze bookingu (round-robin / zespołowy / grupowy)
// + publiczne widgety /rezerwacja/[slug]. Rezerwacja tworzy lead w CRM
// właściciela; sync z Google Calendar/Cal.com spina operator (BOOKING_WEBHOOK_URL).
export default async function RezerwacjePage() {
  const [calendars, contacts] = await Promise.all([listCalendarsAction(), listContacts()]);
  const klienci = contacts.filter((c) => c.typ === 'klient' && !c.owner_contact_id);
  const wszystkie = calendars.reduce((s, c) => s + c.rezerwacje.length, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-3xl font-bold text-stone-100">Rezerwacje</h1>
        <p className="mt-1 text-sm text-stone-500">
          {calendars.length} kalendarzy · {wszystkie} rezerwacji · widgety publiczne pod
          /rezerwacja/[slug]
        </p>
      </div>
      <CalendarsPanel calendars={calendars} klienci={klienci} />
    </div>
  );
}
