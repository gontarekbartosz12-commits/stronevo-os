'use server';

import { revalidatePath } from 'next/cache';
import { getGoogleHoursByQuery, GoogleHoursLookup } from '@/lib/integrations/google-hours';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import { demoStore } from '@/lib/demo-store';
import { Contact, ContactInput, PipelineStatus, Server } from '@/lib/types';

// Zaczyt godzin otwarcia z Google Maps po nazwie firmy + adresie.
// Klucz Places zostaje po stronie serwera; UI pokazuje wynik do korekty.
export async function fetchHoursFromGoogle(query: string): Promise<GoogleHoursLookup> {
  return getGoogleHoursByQuery(query);
}

export async function listServers(): Promise<Server[]> {
  if (!isSupabaseConfigured()) return demoStore.listServers();

  const supabase = await createClient();
  const { data, error } = await supabase.from('servers').select('*').order('nazwa');
  if (error) throw new Error(`Nie udało się pobrać serwerów: ${error.message}`);
  return data as Server[];
}

export async function listContacts(): Promise<Contact[]> {
  // Tylko kontakty STRONEVO (owner_contact_id IS NULL). Leady należące do
  // klientów (ich własny CRM w panelu) NIE pojawiają się w CRM CEO.
  if (!isSupabaseConfigured())
    return demoStore.listContacts().filter((c) => !c.owner_contact_id);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .is('owner_contact_id', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Nie udało się pobrać kontaktów: ${error.message}`);
  return data as Contact[];
}

export async function createContact(input: ContactInput): Promise<Contact> {
  let created: Contact;
  if (!isSupabaseConfigured()) {
    created = demoStore.createContact(input);
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase.from('contacts').insert(input).select().single();
    if (error) throw new Error(`Nie udało się dodać kontaktu: ${error.message}`);
    created = data as Contact;
  }
  revalidatePath('/crm');
  revalidatePath('/dashboard');
  return created;
}

export async function updateContact(
  id: string,
  patch: Partial<ContactInput>
): Promise<Contact> {
  let updated: Contact | null;
  if (!isSupabaseConfigured()) {
    updated = demoStore.updateContact(id, patch);
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('contacts')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`Nie udało się zapisać kontaktu: ${error.message}`);
    updated = data as Contact;
  }
  if (!updated) throw new Error('Kontakt nie istnieje');
  revalidatePath('/crm');
  revalidatePath('/dashboard');
  return updated;
}

// Przeciągnięcie karty na kanbanie / zmiana statusu na liście
export async function moveContact(id: string, status: PipelineStatus): Promise<Contact> {
  return updateContact(id, { status_pipeline: status });
}

export async function deleteContact(id: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    demoStore.deleteContact(id);
  } else {
    const supabase = await createClient();
    const { error } = await supabase.from('contacts').delete().eq('id', id);
    if (error) throw new Error(`Nie udało się usunąć kontaktu: ${error.message}`);
  }
  revalidatePath('/crm');
  revalidatePath('/dashboard');
}
