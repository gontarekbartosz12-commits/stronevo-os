'use server';

import { revalidatePath } from 'next/cache';
import { generateContract } from '@/app/actions/contracts';
import { credentialsReady, seedCredentialsForAutomation } from '@/app/actions/credentials';
import { demoStore } from '@/lib/demo-store';
import { createInvoice, createRecurring } from '@/lib/integrations/fakturownia';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';
import {
  Automation,
  ClientAutomation,
  Contact,
  Invoice,
  InvoicePosition,
  Task,
} from '@/lib/types';

export async function listAutomations(): Promise<Automation[]> {
  if (!isSupabaseConfigured()) return demoStore.listAutomations();

  const supabase = await createClient();
  const { data, error } = await supabase.from('automations_catalog').select('*').order('nazwa');
  if (error) throw new Error(`Nie udało się pobrać katalogu: ${error.message}`);
  return data as Automation[];
}

export interface ClientAutomationWithMeta extends ClientAutomation {
  automation: Automation | null;
}

export async function listClientAutomations(
  contactId: string
): Promise<ClientAutomationWithMeta[]> {
  if (!isSupabaseConfigured()) {
    return demoStore.listClientAutomations(contactId).map((ca) => ({
      ...ca,
      automation: demoStore.getAutomation(ca.automation_id),
    }));
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('client_automations')
    .select('*, automation:automations_catalog(*)')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Nie udało się pobrać automatyzacji klienta: ${error.message}`);
  return data as unknown as ClientAutomationWithMeta[];
}

export interface AssignResult {
  clientAutomation: ClientAutomation;
  invoices: Invoice[];
  contractCreated: boolean;
}

// Przypisanie automatyzacji do prospekta/klienta:
// client_automations(oczekuje_oplaty) + faktura wdrożeniowa (płatna od razu)
// + faktura cykliczna od 2. miesiąca (1. mc abonamentu gratis).
// UWAGA: budowa NIE startuje od razu — zadanie build powstaje dopiero po
// opłaceniu faktury wdrożeniowej (activateWaitingAutomations). Dodatkowo, jeśli
// kontakt nie ma jeszcze umowy, automatycznie podstawiamy szkic umowy.
export async function assignAutomation(
  contactId: string,
  automationId: string
): Promise<AssignResult> {
  const configured = isSupabaseConfigured();

  // --- dane wejściowe ---
  let contact: Contact | null;
  let automation: Automation | null;
  if (!configured) {
    contact = demoStore.getContact(contactId);
    automation = demoStore.getAutomation(automationId);
  } else {
    const supabase = await createClient();
    const [{ data: c }, { data: a }] = await Promise.all([
      supabase.from('contacts').select('*').eq('id', contactId).single(),
      supabase.from('automations_catalog').select('*').eq('id', automationId).single(),
    ]);
    contact = c as Contact | null;
    automation = a as Automation | null;
  }
  if (!contact || !automation) throw new Error('Nie znaleziono kontaktu lub automatyzacji.');

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const secondMonth = new Date(today);
  secondMonth.setMonth(secondMonth.getMonth() + 1);
  const secondMonthIso = secondMonth.toISOString().slice(0, 10);

  const pozycje: InvoicePosition[] = [
    { nazwa: `Wdrożenie: ${automation.nazwa}`, kwota: automation.cena_wdrozenie, cykl: 'jednorazowa' },
    { nazwa: `Abonament: ${automation.nazwa}`, kwota: automation.cena_mc, cykl: 'miesieczna' },
  ];

  // --- Fakturownia (stub/live) ---
  const wdrozeniowa = await createInvoice(contact, pozycje, { firstMonthFree: true });
  const recurring = await createRecurring(contact, pozycje, secondMonthIso);

  const invoiceRows: Omit<Invoice, 'id' | 'created_at'>[] = [
    {
      contact_id: contactId,
      fakturownia_id: wdrozeniowa.data.fakturowniaId,
      tytul: `Wdrożenie: ${automation.nazwa}`,
      kwota: automation.cena_wdrozenie,
      cykl: 'jednorazowa',
      status: 'wystawiona',
      data: todayIso,
    },
    {
      contact_id: contactId,
      fakturownia_id: recurring.data.recurringId,
      tytul: `Abonament: ${automation.nazwa} (od 2. mc, 1. mc gratis)`,
      kwota: automation.cena_mc,
      cykl: 'miesieczna',
      status: 'wystawiona',
      data: secondMonthIso,
    },
  ];

  const caRow: Omit<ClientAutomation, 'id' | 'created_at'> = {
    contact_id: contactId,
    automation_id: automationId,
    n8n_workflow_id: null,
    status: 'oczekuje_oplaty',
    data_startu: null,
  };

  let clientAutomation: ClientAutomation;
  let invoices: Invoice[];
  if (!configured) {
    clientAutomation = demoStore.createClientAutomation(caRow);
    invoices = invoiceRows.map((row) => demoStore.createInvoice(row));
  } else {
    const supabase = await createClient();
    const { data: ca, error: caErr } = await supabase
      .from('client_automations')
      .insert(caRow)
      .select()
      .single();
    if (caErr) throw new Error(`Nie udało się przypisać automatyzacji: ${caErr.message}`);

    const { data: invs, error: invErr } = await supabase
      .from('invoices')
      .insert(invoiceRows)
      .select();
    if (invErr) throw new Error(`Nie udało się zapisać faktur: ${invErr.message}`);

    clientAutomation = ca as ClientAutomation;
    invoices = invs as Invoice[];
  }

  // Zasiew wymaganych dostępów od klienta (kompendium usługi) — do zebrania przed deployem.
  await seedCredentialsForAutomation(contactId, automation);

  // Auto-umowa: jeśli kontakt nie ma jeszcze umowy — podstaw szkic z przypisanych usług.
  const contractCreated = await maybeAutoDraftContract(contactId, todayIso);

  revalidatePath('/crm');
  revalidatePath('/dashboard');
  return { clientAutomation, invoices, contractCreated };
}

// Podstaw szkic umowy, jeśli kontakt jeszcze żadnej nie ma. Reużywa
// generateContract (merge danych + wszystkie przypisane automatyzacje).
async function maybeAutoDraftContract(contactId: string, dataStartu: string): Promise<boolean> {
  const existing = !isSupabaseConfigured()
    ? demoStore.listContracts(contactId)
    : await (async () => {
        const supabase = await createClient();
        const { data } = await supabase
          .from('contracts')
          .select('id')
          .eq('contact_id', contactId)
          .limit(1);
        return data ?? [];
      })();
  if (existing.length > 0) return false;

  const assigned = !isSupabaseConfigured()
    ? demoStore.listClientAutomations(contactId)
    : await (async () => {
        const supabase = await createClient();
        const { data } = await supabase
          .from('client_automations')
          .select('automation_id')
          .eq('contact_id', contactId);
        return (data ?? []) as { automation_id: string }[];
      })();
  const automationIds = [...new Set(assigned.map((a) => a.automation_id))];
  if (automationIds.length === 0) return false;

  await generateContract(contactId, automationIds, dataStartu);
  return true;
}

export interface ActivateWaitingResult {
  activated: number;
  tasks: Task[];
}

// Wywoływane po opłaceniu faktury wdrożeniowej (invoices.onInvoicePaid):
// automatyzacje 'oczekuje_oplaty' przechodzą w budowę (provisioning) i dostają
// zadanie build dla agenta (agent NIE wdraża sam — kończy na review dla CEO).
export async function activateWaitingAutomations(
  contactId: string
): Promise<ActivateWaitingResult> {
  const configured = isSupabaseConfigured();

  let waiting: ClientAutomation[];
  let contact: Contact | null;
  if (!configured) {
    waiting = demoStore.listClientAutomations(contactId).filter((ca) => ca.status === 'oczekuje_oplaty');
    contact = demoStore.getContact(contactId);
  } else {
    const supabase = await createClient();
    const [{ data: cas }, { data: c }] = await Promise.all([
      supabase
        .from('client_automations')
        .select('*')
        .eq('contact_id', contactId)
        .eq('status', 'oczekuje_oplaty'),
      supabase.from('contacts').select('*').eq('id', contactId).single(),
    ]);
    waiting = (cas ?? []) as ClientAutomation[];
    contact = c as Contact | null;
  }
  if (waiting.length === 0) return { activated: 0, tasks: [] };

  const nazwaKlienta = contact?.firma ?? contact?.imie ?? 'klient';
  const tasks: Task[] = [];
  let activated = 0;

  for (const ca of waiting) {
    const automation = !configured
      ? demoStore.getAutomation(ca.automation_id)
      : await (async () => {
          const supabase = await createClient();
          const { data } = await supabase
            .from('automations_catalog')
            .select('*')
            .eq('id', ca.automation_id)
            .single();
          return data as Automation | null;
        })();

    // BRAMA DOSTĘPÓW (Faza 1 zaufania): provisioning NIE startuje bez kompletu
    // dostępów od klienta. Opłacone wdrożenie czeka; klient dostaje krokowy
    // intake w /klient — po komplecie promoteReadyAutomations odblokowuje budowę.
    const readiness = await credentialsReady(contactId, ca.automation_id);
    if (!readiness.ready) {
      await notifyWaitingForCredentials(configured, contactId, nazwaKlienta, automation, readiness.brakujace);
      continue;
    }

    const task = await promoteToProvisioning(configured, ca, automation, contactId, nazwaKlienta, false);
    if (task) tasks.push(task);
    activated++;
  }

  revalidatePath('/crm');
  revalidatePath('/zadania');
  revalidatePath('/dashboard');
  return { activated, tasks };
}

// Przejście oczekuje_oplaty → provisioning + zadanie build dla agenta.
// useAdmin=true, gdy wywołanie idzie z sesji KLIENTA (intake dostępów) —
// klient nie ma RLS na update client_automations/insert tasks.
async function promoteToProvisioning(
  configured: boolean,
  ca: ClientAutomation,
  automation: Automation | null,
  contactId: string,
  nazwaKlienta: string,
  useAdmin: boolean
): Promise<Task | null> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const taskRow: Omit<Task, 'id' | 'created_at'> = {
    contact_id: contactId,
    typ: `Zbuduj automatyzację: ${automation?.nazwa ?? 'usługa'} — ${nazwaKlienta}`,
    kategoria: 'build',
    wykonawca: 'agent',
    status: 'do_zrobienia',
    diff: null,
    review_status: null,
  };

  if (!configured) {
    demoStore.updateClientAutomation(ca.id, { status: 'provisioning', data_startu: todayIso });
    return demoStore.createTask(taskRow);
  }

  const supabase = useAdmin && isAdminConfigured() ? createAdminClient() : await createClient();
  await supabase
    .from('client_automations')
    .update({ status: 'provisioning', data_startu: todayIso })
    .eq('id', ca.id);
  const { data: task } = await supabase.from('tasks').insert(taskRow).select().single();
  return (task as Task) ?? null;
}

async function notifyWaitingForCredentials(
  configured: boolean,
  contactId: string,
  nazwaKlienta: string,
  automation: Automation | null,
  brakujace: string[]
): Promise<void> {
  const row = {
    typ: 'biznes' as const,
    severity: 'warn' as const,
    tytul: `Opłacone, ale czekamy na dostępy: ${automation?.nazwa ?? 'usługa'} (${nazwaKlienta})`,
    opis: `Provisioning wstrzymany do kompletu dostępów. Brakuje: ${brakujace.join('; ')}. Klient ma krokowy intake w swoim panelu; follow-up SMS/e-mail przypomina automatycznie.`,
    related_typ: 'contact',
    related_id: contactId,
    status: 'nowe' as const,
    akcje: [],
  };
  if (!configured) {
    demoStore.createNotification(row);
  } else {
    const supabase = await createClient();
    await supabase.from('notifications').insert(row);
  }
}

// Po komplecie dostępów (intake klienta): OPŁACONE wdrożenia czekające
// w 'oczekuje_oplaty' przechodzą do provisioningu. Zwraca liczbę odblokowanych.
// Płatność rozpoznajemy po opłaconej fakturze wdrożeniowej danej usługi.
export async function promoteReadyAutomations(contactId: string): Promise<number> {
  const configured = isSupabaseConfigured();

  let waiting: ClientAutomation[];
  let contact: Contact | null;
  let invoices: Invoice[];
  if (!configured) {
    waiting = demoStore
      .listClientAutomations(contactId)
      .filter((ca) => ca.status === 'oczekuje_oplaty');
    contact = demoStore.getContact(contactId);
    invoices = demoStore.listInvoices(contactId);
  } else {
    const db = isAdminConfigured() ? createAdminClient() : await createClient();
    const [{ data: cas }, { data: c }, { data: inv }] = await Promise.all([
      db
        .from('client_automations')
        .select('*')
        .eq('contact_id', contactId)
        .eq('status', 'oczekuje_oplaty'),
      db.from('contacts').select('*').eq('id', contactId).single(),
      db.from('invoices').select('*').eq('contact_id', contactId),
    ]);
    waiting = (cas ?? []) as ClientAutomation[];
    contact = c as Contact | null;
    invoices = (inv ?? []) as Invoice[];
  }
  if (waiting.length === 0) return 0;

  const nazwaKlienta = contact?.firma ?? contact?.imie ?? 'klient';
  let promoted = 0;

  for (const ca of waiting) {
    const automation = !configured
      ? demoStore.getAutomation(ca.automation_id)
      : await (async () => {
          const db = isAdminConfigured() ? createAdminClient() : await createClient();
          const { data } = await db
            .from('automations_catalog')
            .select('*')
            .eq('id', ca.automation_id)
            .single();
          return data as Automation | null;
        })();
    if (!automation) continue;

    const paid = invoices.some(
      (i) =>
        i.cykl === 'jednorazowa' &&
        i.status === 'oplacona' &&
        i.tytul === `Wdrożenie: ${automation.nazwa}`
    );
    if (!paid) continue;

    const readiness = await credentialsReady(contactId, ca.automation_id);
    if (!readiness.ready) continue;

    await promoteToProvisioning(configured, ca, automation, contactId, nazwaKlienta, true);
    promoted++;
  }

  if (promoted > 0) {
    revalidatePath('/crm');
    revalidatePath('/zadania');
  }
  return promoted;
}

export interface ActivateResult {
  ok: boolean;
  message: string;
  automation: ClientAutomation | null;
}

// CEO ręcznie zatwierdza: automatyzacja zbudowana i wdrożona → aktywna.
// (po akceptacji builda agenta — "ja zatwierdzam, potem kontakt z klientem").
// ZWRACA wynik (nie rzuca) — bo Next.js w produkcji ukrywa treść rzuconych
// błędów; walidacja (blokada deployu) musi dotrzeć do CEO z czytelnym komunikatem.
export async function markClientAutomationActive(caId: string): Promise<ActivateResult> {
  const configured = isSupabaseConfigured();
  const todayIso = new Date().toISOString().slice(0, 10);

  // Pobierz CA (contact + automation) do bramki dostępów.
  let current: ClientAutomation | null;
  if (!configured) {
    current = demoStore.getClientAutomation(caId);
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from('client_automations')
      .select('*')
      .eq('id', caId)
      .single();
    current = data as ClientAutomation | null;
  }
  if (!current) {
    return { ok: false, message: 'Automatyzacja nie istnieje.', automation: null };
  }

  // BRAMKA DEPLOYU: nie aktywuj, dopóki wszystkie dostępy od klienta nie są otrzymane.
  const readiness = await credentialsReady(current.contact_id, current.automation_id);
  if (!readiness.ready) {
    return {
      ok: false,
      automation: null,
      message:
        `Nie można aktywować — brak dostępów od klienta: ${readiness.brakujace.join('; ')}. ` +
        'Uzupełnij w zakładce „Dostępy" i oznacz jako otrzymane.',
    };
  }

  let updated: ClientAutomation | null;
  if (!configured) {
    updated = demoStore.updateClientAutomation(caId, {
      status: 'active',
      data_startu: current.data_startu ?? todayIso,
    });
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('client_automations')
      .update({ status: 'active', data_startu: current.data_startu ?? todayIso })
      .eq('id', caId)
      .select()
      .single();
    if (error) {
      return { ok: false, message: `Nie udało się aktywować: ${error.message}`, automation: null };
    }
    updated = data as ClientAutomation;
  }
  if (!updated) {
    return { ok: false, message: 'Automatyzacja nie istnieje.', automation: null };
  }

  revalidatePath('/crm');
  revalidatePath('/dashboard');
  return {
    ok: true,
    message: 'Automatyzacja oznaczona jako wdrożona (aktywna) — można kontaktować klienta.',
    automation: updated,
  };
}
