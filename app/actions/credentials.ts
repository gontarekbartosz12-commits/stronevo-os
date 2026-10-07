'use server';

import { revalidatePath } from 'next/cache';
import { demoStore } from '@/lib/demo-store';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';
import {
  Automation,
  ClientCredential,
  CredentialStatus,
  PozyskanieMetoda,
} from '@/lib/types';

export async function listClientCredentials(contactId: string): Promise<ClientCredential[]> {
  if (!isSupabaseConfigured()) return demoStore.listClientCredentials(contactId);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('client_credentials')
    .select('*')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Nie udało się pobrać dostępów: ${error.message}`);
  return data as ClientCredential[];
}

// Zasiew wymaganych dostępów przy przypisaniu automatyzacji (z kompendium usługi).
// Wywoływane z assignAutomation. Pomija duplikaty (ta sama pozycja dla kontaktu).
export async function seedCredentialsForAutomation(
  contactId: string,
  automation: Automation
): Promise<void> {
  const wymagania = automation.wymagania_od_klienta ?? [];
  if (wymagania.length === 0) return;

  const existing = await listClientCredentials(contactId);
  const seen = new Set(existing.map((c) => c.pozycja));
  const rows = wymagania
    .filter((w) => !seen.has(w.pozycja))
    .map((w) => ({
      contact_id: contactId,
      automation_id: automation.id,
      pozycja: w.pozycja,
      metoda: w.metoda,
      status: 'oczekuje' as CredentialStatus,
      wartosc: null,
    }));
  if (rows.length === 0) return;

  if (!isSupabaseConfigured()) {
    rows.forEach((r) => demoStore.createClientCredential(r));
  } else {
    const supabase = await createClient();
    await supabase.from('client_credentials').insert(rows);
  }
  revalidatePath('/crm');
}

export async function setCredential(
  id: string,
  patch: { status?: CredentialStatus; wartosc?: string | null }
): Promise<ClientCredential> {
  let updated: ClientCredential | null;
  if (!isSupabaseConfigured()) {
    updated = demoStore.updateClientCredential(id, patch);
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('client_credentials')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`Nie udało się zapisać dostępu: ${error.message}`);
    updated = data as ClientCredential;
  }
  if (!updated) throw new Error('Dostęp nie istnieje.');
  revalidatePath('/crm');
  return updated;
}

export interface CredentialsReadiness {
  ready: boolean;
  brakujace: string[]; // pozycje w statusie 'oczekuje'
}

// Bramka deployu: czy WSZYSTKIE dostępy klienta (opcjonalnie dla konkretnej
// automatyzacji) są 'otrzymano'. Automatyzacji nie da się aktywować bez kompletu.
export async function credentialsReady(
  contactId: string,
  automationId?: string
): Promise<CredentialsReadiness> {
  const all = await listClientCredentials(contactId);
  const scope = automationId
    ? all.filter((c) => c.automation_id === automationId || c.automation_id === null)
    : all;
  const brakujace = scope.filter((c) => c.status !== 'otrzymano').map((c) => c.pozycja);
  return { ready: brakujace.length === 0, brakujace };
}

// ===== PORTAL ZBIERANIA DOSTĘPÓW (Faza 1 zaufania — krokowy intake w /klient) =====
// Sekret klienta NIGDY nie wraca do przeglądarki w całości — maskowanie server-side.

function maskValue(v: string | null): string | null {
  if (!v) return null;
  const trimmed = v.trim();
  if (trimmed.length <= 4) return '••••';
  return `${trimmed.slice(0, 3)}••••••${trimmed.slice(-2)}`;
}

export interface IntakeStep {
  id: string;
  automationNazwa: string;
  pozycja: string;
  metoda: PozyskanieMetoda;
  status: CredentialStatus;
  maskedValue: string | null;
}

export interface CredentialsIntakeData {
  steps: IntakeStep[]; // brakujące najpierw, potem zebrane
  zebrane: number;
  wszystkie: number;
  complete: boolean;
}

// Checklista dostępów klienta do krokowego intake'u (panel /klient).
// Wartości maskowane; klient widzi CO ma dostarczyć i JAK (metoda z kompendium).
export async function getCredentialsIntake(contactId: string): Promise<CredentialsIntakeData> {
  const creds = await listClientCredentials(contactId);

  let automations: Automation[];
  if (!isSupabaseConfigured()) {
    automations = demoStore.listAutomations();
  } else {
    const supabase = await createClient();
    const { data } = await supabase.from('automations_catalog').select('*');
    automations = (data ?? []) as Automation[];
  }
  const nazwaById = new Map(automations.map((a) => [a.id, a.nazwa]));

  const steps: IntakeStep[] = creds
    .map((c) => ({
      id: c.id,
      automationNazwa: c.automation_id
        ? nazwaById.get(c.automation_id) ?? 'Automatyzacja'
        : 'Wdrożenie',
      pozycja: c.pozycja,
      metoda: c.metoda,
      status: c.status,
      maskedValue: maskValue(c.wartosc),
    }))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'oczekuje' ? -1 : 1;
      return a.pozycja.localeCompare(b.pozycja);
    });

  const zebrane = steps.filter((s) => s.status === 'otrzymano').length;
  return {
    steps,
    zebrane,
    wszystkie: steps.length,
    complete: steps.length > 0 && zebrane === steps.length,
  };
}

// Klient uzupełnia JEDEN krok intake'u (wizard, nie mega-formularz).
// Po komplecie: powiadomienie dla CEO + automatyczne odblokowanie provisioningu
// opłaconych wdrożeń (brama dostępów). Zwraca świeżą checklistę (masked).
export async function submitCredential(
  contactId: string,
  credentialId: string,
  wartosc: string
): Promise<{ message: string; intake: CredentialsIntakeData }> {
  const value = wartosc.trim();
  if (!value) throw new Error('Wpisz wartość dostępu (lub potwierdzenie ustaleń).');

  if (!isSupabaseConfigured()) {
    const cred = demoStore
      .listClientCredentials(contactId)
      .find((c) => c.id === credentialId);
    if (!cred) throw new Error('Pozycja dostępu nie istnieje.');
    demoStore.updateClientCredential(credentialId, { status: 'otrzymano', wartosc: value });
  } else {
    // Sesja klienta — RLS "klient update own client_credentials" pilnuje,
    // że można uzupełnić WYŁĄCZNIE własny wiersz (CEO też przejdzie — full access).
    const supabase = await createClient();
    const { error } = await supabase
      .from('client_credentials')
      .update({ status: 'otrzymano', wartosc: value })
      .eq('id', credentialId)
      .eq('contact_id', contactId);
    if (error) throw new Error(`Nie udało się zapisać dostępu: ${error.message}`);
  }

  const intake = await getCredentialsIntake(contactId);
  let message = `Zapisane — dziękujemy. Zebrane ${intake.zebrane}/${intake.wszystkie}.`;

  if (intake.complete) {
    await notifyCredentialsComplete(contactId);
    // Brama dostępów: opłacone wdrożenia czekające na komplet → provisioning
    const { promoteReadyAutomations } = await import('@/app/actions/automations');
    const promoted = await promoteReadyAutomations(contactId);
    message =
      promoted > 0
        ? 'Komplet dostępów! Ruszyła budowa Twojej automatyzacji — damy znać, gdy będzie gotowa.'
        : 'Komplet dostępów! Opiekun STRONEVO rusza z wdrożeniem.';
  }

  revalidatePath('/klient');
  revalidatePath('/crm');
  return { message, intake };
}

async function notifyCredentialsComplete(contactId: string): Promise<void> {
  let firma = 'klient';
  if (!isSupabaseConfigured()) {
    const c = demoStore.getContact(contactId);
    firma = c?.firma ?? c?.imie ?? firma;
    demoStore.createNotification({
      typ: 'biznes',
      severity: 'info',
      tytul: `Komplet dostępów od: ${firma}`,
      opis: 'Klient uzupełnił wszystkie wymagane dostępy w panelu — provisioning odblokowany.',
      related_typ: 'contact',
      related_id: contactId,
      status: 'nowe',
      akcje: [],
    });
    return;
  }
  // Powiadomienie zapisuje service role (klient nie ma insertu do notifications)
  if (!isAdminConfigured()) return;
  const admin = createAdminClient();
  const { data: c } = await admin.from('contacts').select('firma, imie').eq('id', contactId).maybeSingle();
  firma = c?.firma ?? c?.imie ?? firma;
  await admin.from('notifications').insert({
    typ: 'biznes',
    severity: 'info',
    tytul: `Komplet dostępów od: ${firma}`,
    opis: 'Klient uzupełnił wszystkie wymagane dostępy w panelu — provisioning odblokowany.',
    related_typ: 'contact',
    related_id: contactId,
    status: 'nowe',
    akcje: [],
  });
}
