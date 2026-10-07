'use server';

import { revalidatePath } from 'next/cache';
import { demoStore } from '@/lib/demo-store';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import { ActivityType, Contact, ContactInput, LeadActivity, PipelineStatus } from '@/lib/types';

// ============================================================================
// CRM KLIENTA (multi-tenant) — klient dostaje własny podstawowy CRM w /klient:
// swoje leady (dodawanie/edycja), kalendarz i remarketing. Zakres danych pilnuje
// RLS (owner_contact_id = jwt_contact_id()); param `override` służy tylko do
// podglądu CEO/demo. Klient NIGDY nie widzi cudzych leadów ani panelu technicznego.
// ============================================================================

// Ustala właściciela leadów. Produkcja+klient → contact_id z sesji (RLS i tak
// wymusza zgodność). CEO → może podejrzeć konkretnego klienta (override). Demo →
// pierwszy kontakt typu klient albo override.
async function resolveOwner(override?: string): Promise<string> {
  if (!isSupabaseConfigured()) {
    if (override) return override;
    const firstClient = demoStore.listContacts().find((c) => c.typ === 'klient');
    if (!firstClient) throw new Error('Brak kontaktu typu klient w danych demo.');
    return firstClient.id;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Brak sesji.');

  const role = user.user_metadata?.role as string | undefined;
  if (role === 'ceo' && override) return override; // podgląd CEO
  const contactId = user.user_metadata?.contact_id as string | undefined;
  if (role !== 'klient' || !contactId) throw new Error('Konto nie jest powiązane z klientem.');
  return contactId;
}

export interface MyLeadInput {
  imie: string;
  firma?: string | null;
  telefon?: string | null;
  email?: string | null;
  branza?: string | null;
  miasto?: string | null;
  status_pipeline?: PipelineStatus;
  nastepna_akcja?: string | null;
  nastepna_akcja_data?: string | null; // ISO yyyy-mm-dd
  notatki?: string | null;
  srednia_wartosc_wizyty?: number | null;
}

// Lista leadów klienta (owner_contact_id = jego contact_id), najnowsze pierwsze.
export async function listMyLeads(override?: string): Promise<Contact[]> {
  const ownerId = await resolveOwner(override);
  if (!isSupabaseConfigured()) {
    return demoStore
      .listContacts()
      .filter((c) => c.owner_contact_id === ownerId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('owner_contact_id', ownerId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Nie udało się pobrać leadów: ${error.message}`);
  return data as Contact[];
}

export async function createMyLead(input: MyLeadInput, override?: string): Promise<Contact> {
  const ownerId = await resolveOwner(override);
  if (!input.imie?.trim()) throw new Error('Podaj imię/nazwę leada.');

  const row: ContactInput = {
    server_id: null,
    typ: 'lead',
    imie: input.imie.trim(),
    firma: input.firma?.trim() || null,
    nip: null,
    adres: null,
    branza: input.branza?.trim() || null,
    miasto: input.miasto?.trim() || null,
    telefon: input.telefon?.trim() || null,
    email: input.email?.trim() || null,
    zrodlo: 'panel-klienta',
    status_pipeline: input.status_pipeline ?? 'NOWY',
    nastepna_akcja: input.nastepna_akcja?.trim() || null,
    nastepna_akcja_data: input.nastepna_akcja_data || null,
    data_ostatniego_kontaktu: null,
    notatki: input.notatki?.trim() || null,
    business_hours: null,
    srednia_wartosc_wizyty: input.srednia_wartosc_wizyty ?? null,
    auto_followup_sms: false,
    przypisany_do: null,
    owner_contact_id: ownerId,
  };

  let created: Contact;
  if (!isSupabaseConfigured()) {
    created = demoStore.createContact(row);
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase.from('contacts').insert(row).select().single();
    if (error) throw new Error(`Nie udało się dodać leada: ${error.message}`);
    created = data as Contact;
  }
  revalidatePath('/klient');
  return created;
}

// Pola, które klient może edytować w swoim leadzie (bez owner/typ — bezpieczeństwo).
type MyLeadPatch = Partial<
  Pick<
    Contact,
    | 'imie'
    | 'firma'
    | 'telefon'
    | 'email'
    | 'branza'
    | 'miasto'
    | 'status_pipeline'
    | 'nastepna_akcja'
    | 'nastepna_akcja_data'
    | 'notatki'
    | 'srednia_wartosc_wizyty'
  >
>;

export async function updateMyLead(
  id: string,
  patch: MyLeadPatch,
  override?: string
): Promise<Contact> {
  const ownerId = await resolveOwner(override);
  let updated: Contact | null;
  if (!isSupabaseConfigured()) {
    const target = demoStore.getContact(id);
    if (!target || target.owner_contact_id !== ownerId)
      throw new Error('Lead nie należy do Ciebie.');
    updated = demoStore.updateContact(id, patch);
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('contacts')
      .update(patch)
      .eq('id', id)
      .eq('owner_contact_id', ownerId) // podwójna bramka obok RLS
      .select()
      .single();
    if (error) throw new Error(`Nie udało się zapisać leada: ${error.message}`);
    updated = data as Contact;
  }
  if (!updated) throw new Error('Lead nie istnieje.');
  revalidatePath('/klient');
  return updated;
}

// Zmiana etapu (kanban) w CRM klienta.
export async function moveMyLead(
  id: string,
  status: PipelineStatus,
  override?: string
): Promise<Contact> {
  return updateMyLead(id, { status_pipeline: status }, override);
}

export async function deleteMyLead(id: string, override?: string): Promise<void> {
  const ownerId = await resolveOwner(override);
  if (!isSupabaseConfigured()) {
    const target = demoStore.getContact(id);
    if (!target || target.owner_contact_id !== ownerId)
      throw new Error('Lead nie należy do Ciebie.');
    demoStore.deleteContact(id);
  } else {
    const supabase = await createClient();
    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', id)
      .eq('owner_contact_id', ownerId);
    if (error) throw new Error(`Nie udało się usunąć leada: ${error.message}`);
  }
  revalidatePath('/klient');
}

// ============================================================================
// HISTORIA / AKTYWNOŚCI leada — timeline notatek/telefonów/spotkań (pełny CRM)
// ============================================================================

export async function listActivities(contactId: string, override?: string): Promise<LeadActivity[]> {
  const ownerId = await resolveOwner(override);
  if (!isSupabaseConfigured()) {
    const target = demoStore.getContact(contactId);
    if (!target || target.owner_contact_id !== ownerId) return [];
    return demoStore.listLeadActivities(contactId);
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('lead_activities')
    .select('*')
    .eq('contact_id', contactId)
    .eq('owner_contact_id', ownerId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Nie udało się pobrać historii: ${error.message}`);
  return data as LeadActivity[];
}

export async function addActivity(
  contactId: string,
  typ: ActivityType,
  tresc: string,
  override?: string
): Promise<LeadActivity> {
  const ownerId = await resolveOwner(override);
  if (!tresc?.trim()) throw new Error('Wpisz treść notatki.');

  // Lead musi należeć do klienta
  if (!isSupabaseConfigured()) {
    const target = demoStore.getContact(contactId);
    if (!target || target.owner_contact_id !== ownerId)
      throw new Error('Lead nie należy do Ciebie.');
    const a = demoStore.createLeadActivity({
      contact_id: contactId,
      owner_contact_id: ownerId,
      typ,
      tresc: tresc.trim(),
    });
    revalidatePath('/klient');
    return a;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('lead_activities')
    .insert({ contact_id: contactId, owner_contact_id: ownerId, typ, tresc: tresc.trim() })
    .select()
    .single();
  if (error) throw new Error(`Nie udało się zapisać wpisu: ${error.message}`);
  revalidatePath('/klient');
  return data as LeadActivity;
}

export async function deleteActivity(id: string, override?: string): Promise<void> {
  const ownerId = await resolveOwner(override);
  if (!isSupabaseConfigured()) {
    demoStore.deleteLeadActivity(id);
  } else {
    const supabase = await createClient();
    const { error } = await supabase
      .from('lead_activities')
      .delete()
      .eq('id', id)
      .eq('owner_contact_id', ownerId);
    if (error) throw new Error(`Nie udało się usunąć wpisu: ${error.message}`);
  }
  revalidatePath('/klient');
}

// ============================================================================
// REMARKETING z AKCJĄ — klient zleca STRONEVO kampanię dla segmentu.
// Tworzy powiadomienie dla CEO (STRONEVO obsługuje wysyłkę Meta/SMS wg RODO).
// ============================================================================

export async function requestRemarketing(
  segmentLabel: string,
  liczba: number,
  kanal: 'meta' | 'sms' | 'email',
  override?: string
): Promise<string> {
  const ownerId = await resolveOwner(override);

  let source: Contact | null;
  if (!isSupabaseConfigured()) {
    source = demoStore.getContact(ownerId);
  } else {
    const supabase = await createClient();
    const { data } = await supabase.from('contacts').select('*').eq('id', ownerId).maybeSingle();
    source = data as Contact | null;
  }
  const klient = source?.firma ?? source?.imie ?? 'Klient';
  const kanalLabel = kanal === 'meta' ? 'Meta Ads' : kanal === 'sms' ? 'SMS' : 'E-mail';
  const tytul = `Zlecenie kampanii: ${klient} — segment „${segmentLabel}"`;
  const opis = `Klient ${klient} zlecił kampanię ${kanalLabel} do segmentu „${segmentLabel}" (${liczba} kontaktów). Skontaktuj się i uruchom wysyłkę zgodnie z RODO.`;

  if (!isSupabaseConfigured()) {
    demoStore.createNotification({
      typ: 'biznes',
      severity: 'info',
      tytul,
      opis,
      related_typ: 'contact',
      related_id: ownerId,
      status: 'nowe',
      akcje: [],
    });
  } else {
    const supabase = await createClient();
    const { error } = await supabase.from('notifications').insert({
      typ: 'biznes',
      severity: 'info',
      tytul,
      opis,
      related_typ: 'contact',
      related_id: ownerId,
      status: 'nowe',
      akcje: [],
    });
    if (error) throw new Error(`Nie udało się wysłać zlecenia: ${error.message}`);
  }
  revalidatePath('/powiadomienia');
  return `Zlecenie wysłane do STRONEVO — uruchomimy kampanię ${kanalLabel} dla „${segmentLabel}" i odezwiemy się z potwierdzeniem.`;
}
