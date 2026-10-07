'use server';

import { demoStore } from '@/lib/demo-store';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import { Contact, UptimeCheck, UptimePing } from '@/lib/types';
import { UptimeStat, computeUptimeStat } from '@/lib/uptime';

// Uptime (Faza 1 zaufania) — statystyki dostępności do widżetów.
// CEO (/wyniki): wszystkie checki; klient (/klient): RLS ogranicza do własnych.

export interface UptimeStatWithClient extends UptimeStat {
  klient: string | null;
}

export async function getUptimeStats(contactId?: string): Promise<UptimeStatWithClient[]> {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  let checks: UptimeCheck[];
  let pings: UptimePing[];
  let contacts: Pick<Contact, 'id' | 'firma' | 'imie'>[];

  if (!isSupabaseConfigured()) {
    checks = demoStore.listUptimeChecks(contactId);
    pings = demoStore.listUptimePings(undefined, contactId);
    contacts = demoStore.listContacts();
  } else {
    const supabase = await createClient();
    let checksQ = supabase.from('uptime_checks').select('*');
    // % dostępności liczymy z bieżącego miesiąca — nie ładujemy całej historii
    let pingsQ = supabase
      .from('uptime_pings')
      .select('*')
      .gte('checked_at', monthStart.toISOString());
    if (contactId) {
      checksQ = checksQ.eq('contact_id', contactId);
      pingsQ = pingsQ.eq('contact_id', contactId);
    }
    const [c, p, ct] = await Promise.all([
      checksQ,
      pingsQ,
      supabase.from('contacts').select('id, firma, imie'),
    ]);
    checks = (c.data ?? []) as UptimeCheck[];
    pings = (p.data ?? []) as UptimePing[];
    contacts = (ct.data ?? []) as Pick<Contact, 'id' | 'firma' | 'imie'>[];
  }

  return checks
    .map((check) => {
      const stat = computeUptimeStat(
        check,
        pings.filter((p) => p.check_id === check.id)
      );
      const kontakt = contacts.find((c) => c.id === check.contact_id);
      return { ...stat, klient: kontakt ? kontakt.firma ?? kontakt.imie : null };
    })
    .sort((a, b) => Number(a.check.ok ?? true) - Number(b.check.ok ?? true)); // padnięte na górze
}
