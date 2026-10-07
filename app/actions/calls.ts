'use server';

import { demoStore } from '@/lib/demo-store';
import { closingTimeToday, isAfterHours, normalizeBusinessHours } from '@/lib/business-hours';
import { getCalls } from '@/lib/integrations/calls';
import { getGoogleHours } from '@/lib/integrations/google-hours';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import { BusinessHours, CallWithMeta, Contact, DataSource } from '@/lib/types';

export interface CallsBoardData {
  calls: CallWithMeta[];
  source: DataSource;
  hoursDefined: boolean;
  // Nagłówek kontekstowy: "Salon zamyka dziś o 18:00 — dziś po godzinach: ..."
  zamkniecieDzis: string | null; // null = dziś zamknięte / brak godzin
  dzisPoGodzinach: CallWithMeta[];
  odswiezono: string; // ISO — znacznik ostatniego odświeżenia (polling)
}

async function getContact(id: string): Promise<Contact | null> {
  if (!isSupabaseConfigured()) return demoStore.getContact(id);
  const supabase = await createClient();
  const { data } = await supabase.from('contacts').select('*').eq('id', id).maybeSingle();
  return data as Contact | null;
}

// Live dashboard połączeń: rekordy z Vapi/n8n (stub) + flaga "po godzinach"
// liczona z business_hours klienta. Wołane pollingiem z UI.
export async function getCallsBoard(contactId: string): Promise<CallsBoardData> {
  const contact = await getContact(contactId);
  if (!contact) throw new Error('Kontakt nie istnieje.');

  const hours: BusinessHours | null = normalizeBusinessHours(contact.business_hours);
  const result = await getCalls(contactId);

  const calls: CallWithMeta[] = result.data.map((c) => ({
    ...c,
    poGodzinach: isAfterHours(hours, new Date(c.czas)),
  }));

  const todayIso = new Date().toISOString().slice(0, 10);
  const dzisPoGodzinach = calls.filter(
    (c) => c.poGodzinach && c.czas.slice(0, 10) === todayIso
  );

  return {
    calls,
    source: result.source,
    hoursDefined: hours !== null,
    zamkniecieDzis: hours ? closingTimeToday(hours) : null,
    dzisPoGodzinach,
    odswiezono: new Date().toISOString(),
  };
}

// "Pobierz z Google" w formularzu godzin — stub-mock do ręcznej korekty
export async function fetchGoogleHours(placeId: string): Promise<{
  hours: BusinessHours;
  source: DataSource;
}> {
  const result = await getGoogleHours(placeId);
  return { hours: result.data, source: result.source };
}
