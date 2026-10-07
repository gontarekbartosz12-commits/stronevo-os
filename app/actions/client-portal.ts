'use server';

import { revalidatePath } from 'next/cache';
import { sendOpsAlert } from '@/lib/alerts';
import { demoStore } from '@/lib/demo-store';
import { PROMOTIONS, upsellDiscount } from '@/lib/promotions';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import {
  Automation,
  ClientAutomation,
  Contact,
  Contract,
  Invoice,
  Promotion,
  UpsellItem,
} from '@/lib/types';

export interface ClientPortalData {
  contact: Contact;
  automations: (ClientAutomation & { automation: Automation | null })[];
  invoices: Invoice[];
  contracts: Contract[];
  upsell: UpsellItem[];
  rabatProcent: number;
  promotions: Promotion[];
  previewMode: boolean; // CEO/demo ogląda panel w imieniu klienta
}

// Ustala contact_id zalogowanego klienta. CEO (i tryb demo) może podejrzeć
// panel dowolnego klienta przez ?contact_id= — previewMode w wyniku.
async function resolveContactId(
  overrideContactId?: string
): Promise<{ contactId: string; previewMode: boolean }> {
  if (!isSupabaseConfigured()) {
    if (overrideContactId) return { contactId: overrideContactId, previewMode: true };
    const firstClient = demoStore.listContacts().find((c) => c.typ === 'klient');
    if (!firstClient) throw new Error('Brak kontaktu typu klient w danych demo.');
    return { contactId: firstClient.id, previewMode: true };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Brak sesji.');

  const role = user.user_metadata?.role as string | undefined;
  if (role === 'ceo' && overrideContactId) {
    return { contactId: overrideContactId, previewMode: true };
  }
  const contactId = user.user_metadata?.contact_id as string | undefined;
  if (role !== 'klient' || !contactId) {
    throw new Error('Konto nie jest powiązane z klientem.');
  }
  return { contactId, previewMode: false };
}

export async function getClientPortalData(
  overrideContactId?: string
): Promise<ClientPortalData> {
  const { contactId, previewMode } = await resolveContactId(overrideContactId);

  let contact: Contact | null;
  let automations: (ClientAutomation & { automation: Automation | null })[];
  let invoices: Invoice[];
  let contracts: Contract[];
  let catalog: Automation[];

  if (!isSupabaseConfigured()) {
    contact = demoStore.getContact(contactId);
    automations = demoStore
      .listClientAutomations(contactId)
      .map((ca) => ({ ...ca, automation: demoStore.getAutomation(ca.automation_id) }));
    invoices = demoStore.listInvoices(contactId);
    contracts = demoStore.listContracts(contactId);
    catalog = demoStore.listAutomations();
  } else {
    const supabase = await createClient();
    const [c, ca, inv, ctr, cat] = await Promise.all([
      supabase.from('contacts').select('*').eq('id', contactId).maybeSingle(),
      supabase
        .from('client_automations')
        .select('*, automation:automations_catalog(*)')
        .eq('contact_id', contactId),
      supabase.from('invoices').select('*').eq('contact_id', contactId).order('data'),
      supabase.from('contracts').select('*').eq('contact_id', contactId),
      supabase.from('automations_catalog').select('*').order('nazwa'),
    ]);
    contact = c.data as Contact | null;
    automations = (ca.data ?? []) as (ClientAutomation & { automation: Automation | null })[];
    invoices = (inv.data ?? []) as Invoice[];
    contracts = (ctr.data ?? []) as Contract[];
    catalog = (cat.data ?? []) as Automation[];
  }

  if (!contact) throw new Error('Nie znaleziono danych klienta.');

  // Upsell: pozycje katalogu, których klient nie ma, z rabatem wg pakietu
  const ownedIds = new Set(automations.map((a) => a.automation_id));
  const rabatProcent = upsellDiscount(ownedIds.size);
  const upsell: UpsellItem[] = catalog
    .filter((a) => !ownedIds.has(a.id))
    .map((automation) => ({
      automation,
      rabatProcent,
      cenaWdrozeniePoRabacie: Math.round(automation.cena_wdrozenie * (1 - rabatProcent / 100)),
    }));

  return {
    contact,
    automations,
    invoices,
    contracts,
    upsell,
    rabatProcent,
    promotions: PROMOTIONS,
    previewMode,
  };
}

// "Skontaktuj się z działem sprzedaży" / "Dodaj do pakietu" — tworzy NOWY
// lead upsellowy w CRM CEO (typ=lead, zrodlo=upsell) z danymi klienta.
export async function createUpsellLead(
  contactId: string,
  interesuje: string | null
): Promise<string> {
  let source: Contact | null;
  if (!isSupabaseConfigured()) {
    source = demoStore.getContact(contactId);
  } else {
    const supabase = await createClient();
    const { data } = await supabase.from('contacts').select('*').eq('id', contactId).maybeSingle();
    source = data as Contact | null;
  }
  if (!source) throw new Error('Nie znaleziono klienta.');

  const notatki = interesuje
    ? `Upsell z panelu klienta — zainteresowanie: ${interesuje}. Kontakt źródłowy: ${source.id}.`
    : `Prośba o kontakt z działem sprzedaży (panel klienta). Kontakt źródłowy: ${source.id}.`;

  const row = {
    server_id: source.server_id,
    typ: 'lead' as const,
    imie: source.imie,
    firma: source.firma,
    nip: source.nip,
    adres: source.adres,
    branza: source.branza,
    miasto: source.miasto,
    telefon: source.telefon,
    email: source.email,
    zrodlo: 'upsell',
    status_pipeline: 'NOWY' as const,
    nastepna_akcja: interesuje
      ? `Oddzwonić ws. dodania: ${interesuje}`
      : 'Oddzwonić — prośba z panelu klienta',
    nastepna_akcja_data: new Date().toISOString().slice(0, 10),
    data_ostatniego_kontaktu: null,
    notatki,
    business_hours: null,
    srednia_wartosc_wizyty: null,
    auto_followup_sms: false,
    przypisany_do: null,
  };

  if (!isSupabaseConfigured()) {
    demoStore.createContact(row);
    demoStore.createNotification({
      typ: 'biznes',
      severity: 'info',
      tytul: `Upsell: ${source.firma ?? source.imie} prosi o kontakt`,
      opis: notatki,
      related_typ: 'contact',
      related_id: source.id,
      status: 'nowe',
      akcje: [],
    });
  } else {
    const supabase = await createClient();
    const { error } = await supabase.from('contacts').insert(row);
    if (error) throw new Error(`Nie udało się utworzyć leada: ${error.message}`);
    await supabase.from('notifications').insert({
      typ: 'biznes',
      severity: 'info',
      tytul: `Upsell: ${source.firma ?? source.imie} prosi o kontakt`,
      opis: notatki,
      related_typ: 'contact',
      related_id: source.id,
      status: 'nowe',
      akcje: [],
    });
  }

  // OPERATOR-FIRST: klient klika „chcę to" → operator dostaje alert od razu
  // (Telegram/SMS) i ODDZWANIA — automatyzację buduje STRONEVO, nie klient.
  await sendOpsAlert(
    `Upsell: ${source.firma ?? source.imie} prosi o kontakt${interesuje ? ` ws. "${interesuje}"` : ''} (tel: ${source.telefon ?? 'brak'})`
  );

  revalidatePath('/crm');
  revalidatePath('/powiadomienia');
  return interesuje
    ? `Zgłoszenie wysłane — dział sprzedaży odezwie się w sprawie "${interesuje}".`
    : 'Zgłoszenie wysłane — dział sprzedaży skontaktuje się wkrótce.';
}
