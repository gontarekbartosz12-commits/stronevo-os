'use server';

import { revalidatePath } from 'next/cache';
import { demoStore } from '@/lib/demo-store';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import { Contact } from '@/lib/types';

// Wpis kalendarza = kontakt z zaplanowaną następną akcją (data).
export interface CalendarEntry {
  contact_id: string;
  data: string; // ISO yyyy-mm-dd
  imie: string;
  firma: string | null;
  telefon: string | null;
  akcja: string | null;
  typ: Contact['typ'];
  status_pipeline: Contact['status_pipeline'];
  przypisany_do: string | null; // null = „Ty (CEO)"
}

function toEntry(c: Contact): CalendarEntry {
  return {
    contact_id: c.id,
    data: c.nastepna_akcja_data as string,
    imie: c.imie,
    firma: c.firma,
    telefon: c.telefon,
    akcja: c.nastepna_akcja,
    typ: c.typ,
    status_pipeline: c.status_pipeline,
    przypisany_do: c.przypisany_do,
  };
}

// Nadchodzące spotkania/akcje (kontakty z nastepna_akcja_data), rosnąco po dacie.
export async function listUpcoming(): Promise<CalendarEntry[]> {
  let contacts: Contact[];
  if (!isSupabaseConfigured()) {
    contacts = demoStore.listContacts().filter((c) => !c.owner_contact_id);
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .is('owner_contact_id', null)
      .not('nastepna_akcja_data', 'is', null)
      .order('nastepna_akcja_data', { ascending: true });
    if (error) throw new Error(`Nie udało się pobrać kalendarza: ${error.message}`);
    contacts = data as Contact[];
  }
  return contacts
    .filter((c) => c.nastepna_akcja_data)
    .map(toEntry)
    .sort((a, b) => a.data.localeCompare(b.data));
}

// Handlowcy = wyróżnione wartości przypisany_do już użyte w kontaktach.
export async function listReps(): Promise<string[]> {
  let contacts: Contact[];
  if (!isSupabaseConfigured()) {
    contacts = demoStore.listContacts();
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from('contacts')
      .select('przypisany_do')
      .not('przypisany_do', 'is', null);
    contacts = (data ?? []) as Contact[];
  }
  const reps = new Set<string>();
  for (const c of contacts) {
    const r = c.przypisany_do?.trim();
    if (r && r !== 'Ty (CEO)') reps.add(r);
  }
  return [...reps].sort();
}

// Przydział leada handlowcowi (pusty/„Ty (CEO)" = przypisane do Ciebie = null).
export async function assignOwner(contactId: string, owner: string | null): Promise<void> {
  const value = owner && owner.trim() && owner.trim() !== 'Ty (CEO)' ? owner.trim() : null;
  if (!isSupabaseConfigured()) {
    demoStore.updateContact(contactId, { przypisany_do: value });
  } else {
    const supabase = await createClient();
    const { error } = await supabase
      .from('contacts')
      .update({ przypisany_do: value })
      .eq('id', contactId);
    if (error) throw new Error(`Nie udało się przypisać: ${error.message}`);
  }
  revalidatePath('/kalendarz');
  revalidatePath('/crm');
}
