'use server';

import { revalidatePath } from 'next/cache';
import { demoStore } from '@/lib/demo-store';
import { newCalendarSlug } from '@/lib/booking';
import { evaluateSmartList } from '@/lib/smart-lists';
import { SnapshotDeployResult, buildSnapshotPayload, deploySnapshot } from '@/lib/snapshots';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import {
  AdCampaign,
  AdChannel,
  Booking,
  BookingCalendar,
  CalendarType,
  Contact,
  CustomObject,
  CustomObjectField,
  CustomObjectRecord,
  SmartList,
  SmartListFilter,
  Snapshot,
  AudienceSegment,
} from '@/lib/types';

// PRODUKTYZACJA + GŁĘBIA CRM (Faza 5) — akcje panelu.
// OPERATOR-FIRST: snapshoty, schematy obiektów, kalendarze i kampanie =
// operator; rekordy obiektów i smart listy = funkcje użytkowe (RLS own).

async function sessionRole(): Promise<'ceo' | 'pracownik' | 'klient'> {
  if (!isSupabaseConfigured()) return 'ceo';
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const role = user?.user_metadata?.role;
  return role === 'klient' ? 'klient' : role === 'pracownik' ? 'pracownik' : 'ceo';
}

async function requireOperator(co: string): Promise<void> {
  if ((await sessionRole()) === 'klient') {
    throw new Error(`${co} konfiguruje opiekun STRONEVO.`);
  }
}

// ===== A. Snapshots =====

export async function listSnapshotsAction(): Promise<Snapshot[]> {
  if (!isSupabaseConfigured()) return demoStore.listSnapshots();
  const supabase = await createClient();
  const { data } = await supabase.from('snapshots').select('*').order('created_at', { ascending: false });
  return (data ?? []) as Snapshot[];
}

export async function createSnapshotAction(input: {
  contactId: string;
  nazwa: string;
  opis?: string;
}): Promise<Snapshot> {
  await requireOperator('Snapshoty');
  if (!input.nazwa.trim()) throw new Error('Podaj nazwę snapshotu.');
  const payload = await buildSnapshotPayload(input.contactId);
  if (payload.automatyzacje.length === 0 && payload.wiedza.length === 0) {
    throw new Error('Klient nie ma nic do zesnapshotowania (brak automatyzacji/wiedzy).');
  }

  const row = { nazwa: input.nazwa.trim(), opis: input.opis?.trim() || null, payload };
  let snapshot: Snapshot;
  if (!isSupabaseConfigured()) {
    snapshot = demoStore.createSnapshot(row);
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase.from('snapshots').insert(row).select('*').single();
    if (error) throw new Error(error.message);
    snapshot = data as Snapshot;
  }
  revalidatePath('/agenci');
  return snapshot;
}

export async function deploySnapshotAction(
  snapshotId: string,
  targetContactId: string
): Promise<SnapshotDeployResult> {
  await requireOperator('Wdrożenia snapshotów');

  let snapshot: Snapshot | null;
  if (!isSupabaseConfigured()) {
    snapshot = demoStore.getSnapshot(snapshotId);
  } else {
    const supabase = await createClient();
    const { data } = await supabase.from('snapshots').select('*').eq('id', snapshotId).maybeSingle();
    snapshot = data as Snapshot | null;
  }
  if (!snapshot) throw new Error('Snapshot nie istnieje.');

  const result = await deploySnapshot(snapshot, targetContactId);
  revalidatePath('/agenci');
  revalidatePath('/zadania');
  revalidatePath('/crm');
  return result;
}

// ===== B. Custom objects + smart lists =====

export interface CustomObjectWithRecords extends CustomObject {
  ownerName: string;
  records: CustomObjectRecord[];
}

export async function listCustomObjectsAction(
  ownerContactId?: string
): Promise<CustomObjectWithRecords[]> {
  if (!isSupabaseConfigured()) {
    const contacts = demoStore.listContacts();
    return demoStore
      .listCustomObjects(ownerContactId === undefined ? undefined : ownerContactId)
      .map((o) => ({
        ...o,
        ownerName: o.owner_contact_id
          ? contacts.find((c) => c.id === o.owner_contact_id)?.firma ?? 'klient'
          : 'STRONEVO',
        records: demoStore.listCustomObjectRecords(o.id),
      }));
  }
  const supabase = await createClient();
  let q = supabase.from('custom_objects').select('*');
  if (ownerContactId !== undefined) q = q.eq('owner_contact_id', ownerContactId);
  const [{ data: objects }, { data: records }, { data: contacts }] = await Promise.all([
    q,
    supabase.from('custom_object_records').select('*').order('created_at', { ascending: false }),
    supabase.from('contacts').select('id, firma, imie'),
  ]);
  return ((objects ?? []) as CustomObject[]).map((o) => ({
    ...o,
    ownerName: o.owner_contact_id
      ? (contacts ?? []).find((c) => c.id === o.owner_contact_id)?.firma ?? 'klient'
      : 'STRONEVO',
    records: ((records ?? []) as CustomObjectRecord[]).filter((r) => r.object_id === o.id),
  }));
}

export async function createCustomObjectAction(input: {
  owner_contact_id: string | null;
  nazwa: string;
  ikona: string;
  schema: CustomObjectField[];
}): Promise<CustomObject> {
  await requireOperator('Schematy obiektów'); // struktura = operator
  if (!input.nazwa.trim() || input.schema.length === 0) {
    throw new Error('Podaj nazwę i co najmniej jedno pole.');
  }
  const row = {
    owner_contact_id: input.owner_contact_id,
    nazwa: input.nazwa.trim(),
    ikona: input.ikona || null,
    schema: input.schema,
  };
  if (!isSupabaseConfigured()) {
    revalidatePath('/baza');
    return demoStore.createCustomObject(row);
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from('custom_objects').insert(row).select('*').single();
  if (error) throw new Error(error.message);
  revalidatePath('/baza');
  return data as CustomObject;
}

// Rekord obiektu = funkcja UŻYTKOWA (klient na własnych danych; RLS own)
export async function createCustomObjectRecordAction(input: {
  object_id: string;
  dane: Record<string, unknown>;
  contact_id?: string | null;
}): Promise<CustomObjectRecord> {
  let owner: string | null = null;
  if (!isSupabaseConfigured()) {
    owner = demoStore.getCustomObject(input.object_id)?.owner_contact_id ?? null;
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from('custom_objects')
      .select('owner_contact_id')
      .eq('id', input.object_id)
      .maybeSingle();
    owner = data?.owner_contact_id ?? null;
  }
  const row = {
    object_id: input.object_id,
    owner_contact_id: owner,
    contact_id: input.contact_id ?? null,
    dane: input.dane,
  };
  if (!isSupabaseConfigured()) {
    revalidatePath('/baza');
    return demoStore.createCustomObjectRecord(row);
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('custom_object_records')
    .insert(row)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  revalidatePath('/baza');
  return data as CustomObjectRecord;
}

export interface SmartListWithResults extends SmartList {
  wyniki: Contact[];
}

export async function listSmartListsAction(ownerContactId?: string): Promise<SmartListWithResults[]> {
  let lists: SmartList[];
  let contacts: Contact[];
  if (!isSupabaseConfigured()) {
    lists = demoStore.listSmartLists(ownerContactId === undefined ? undefined : ownerContactId);
    contacts = demoStore
      .listContacts()
      .filter((c) =>
        ownerContactId === undefined ? !c.owner_contact_id : c.owner_contact_id === ownerContactId
      );
  } else {
    const supabase = await createClient(); // RLS scoping
    let lq = supabase.from('smart_lists').select('*');
    let cq = supabase.from('contacts').select('*');
    if (ownerContactId !== undefined) {
      lq = lq.eq('owner_contact_id', ownerContactId);
      cq = cq.eq('owner_contact_id', ownerContactId);
    } else {
      cq = cq.is('owner_contact_id', null);
    }
    const [{ data: ls }, { data: cs }] = await Promise.all([lq, cq]);
    lists = (ls ?? []) as SmartList[];
    contacts = (cs ?? []) as Contact[];
  }
  return lists.map((l) => ({ ...l, wyniki: evaluateSmartList(contacts, l.filtr) }));
}

export async function createSmartListAction(input: {
  owner_contact_id: string | null;
  nazwa: string;
  filtr: SmartListFilter;
}): Promise<SmartList> {
  if (!input.nazwa.trim()) throw new Error('Podaj nazwę listy.');
  const row = { owner_contact_id: input.owner_contact_id, nazwa: input.nazwa.trim(), filtr: input.filtr };
  if (!isSupabaseConfigured()) {
    revalidatePath('/baza');
    return demoStore.createSmartList(row);
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from('smart_lists').insert(row).select('*').single();
  if (error) throw new Error(error.message);
  revalidatePath('/baza');
  return data as SmartList;
}

// ===== C. Kalendarze =====

export interface CalendarWithMeta extends BookingCalendar {
  ownerName: string;
  members: string[];
  rezerwacje: Booking[];
}

export async function listCalendarsAction(): Promise<CalendarWithMeta[]> {
  if (!isSupabaseConfigured()) {
    const contacts = demoStore.listContacts();
    return demoStore.listBookingCalendars().map((c) => ({
      ...c,
      ownerName: c.owner_contact_id
        ? contacts.find((x) => x.id === c.owner_contact_id)?.firma ?? 'klient'
        : 'STRONEVO',
      members: demoStore.listCalendarMembers(c.id).map((m) => m.nazwa),
      rezerwacje: demoStore.listBookings(c.id),
    }));
  }
  const supabase = await createClient();
  const [{ data: cals }, { data: members }, { data: bookings }, { data: contacts }] =
    await Promise.all([
      supabase.from('booking_calendars').select('*'),
      supabase.from('calendar_members').select('*').order('kolejnosc'),
      supabase.from('bookings').select('*').order('start'),
      supabase.from('contacts').select('id, firma, imie'),
    ]);
  return ((cals ?? []) as BookingCalendar[]).map((c) => ({
    ...c,
    ownerName: c.owner_contact_id
      ? (contacts ?? []).find((x) => x.id === c.owner_contact_id)?.firma ?? 'klient'
      : 'STRONEVO',
    members: (members ?? []).filter((m) => m.calendar_id === c.id).map((m) => m.nazwa),
    rezerwacje: ((bookings ?? []) as Booking[]).filter((b) => b.calendar_id === c.id),
  }));
}

export async function createCalendarAction(input: {
  owner_contact_id: string | null;
  nazwa: string;
  typ: CalendarType;
  slot_min: number;
  capacity: number;
  members: string[]; // nazwy członków
  dni: { dzien: number; od: string; do: string }[];
}): Promise<BookingCalendar> {
  await requireOperator('Kalendarze bookingu');
  if (!input.nazwa.trim()) throw new Error('Podaj nazwę kalendarza.');
  if (input.dni.length === 0) throw new Error('Ustaw dostępność (min. 1 dzień).');

  const slug = newCalendarSlug(input.nazwa);
  const calRow = {
    owner_contact_id: input.owner_contact_id,
    nazwa: input.nazwa.trim(),
    slug,
    typ: input.typ,
    slot_min: Math.max(10, input.slot_min),
    capacity: input.typ === 'class' ? Math.max(1, input.capacity) : 1,
    aktywny: true,
  };

  let calendar: BookingCalendar;
  if (!isSupabaseConfigured()) {
    calendar = demoStore.createBookingCalendar(calRow);
    input.members.forEach((nazwa, i) =>
      demoStore.createCalendarMember({
        calendar_id: calendar.id,
        owner_contact_id: input.owner_contact_id,
        nazwa,
        kolejnosc: i,
      })
    );
    input.dni.forEach((d) =>
      demoStore.createCalendarAvailability({
        calendar_id: calendar.id,
        owner_contact_id: input.owner_contact_id,
        dzien: d.dzien,
        od: d.od,
        do: d.do,
      })
    );
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase.from('booking_calendars').insert(calRow).select('*').single();
    if (error) throw new Error(error.message);
    calendar = data as BookingCalendar;
    if (input.members.length > 0) {
      await supabase.from('calendar_members').insert(
        input.members.map((nazwa, i) => ({
          calendar_id: calendar.id,
          owner_contact_id: input.owner_contact_id,
          nazwa,
          kolejnosc: i,
        }))
      );
    }
    await supabase.from('calendar_availability').insert(
      input.dni.map((d) => ({
        calendar_id: calendar.id,
        owner_contact_id: input.owner_contact_id,
        dzien: d.dzien,
        od: d.od,
        do: d.do,
      }))
    );
  }
  revalidatePath('/rezerwacje');
  return calendar;
}

// ===== D. Ad Manager =====

export async function listAdCampaignsAction(ownerContactId?: string): Promise<AdCampaign[]> {
  if (!isSupabaseConfigured()) {
    return demoStore.listAdCampaigns(ownerContactId === undefined ? undefined : ownerContactId);
  }
  const supabase = await createClient();
  let q = supabase.from('ad_campaigns').select('*').order('created_at', { ascending: false });
  if (ownerContactId !== undefined) q = q.eq('owner_contact_id', ownerContactId);
  const { data } = await q;
  return (data ?? []) as AdCampaign[];
}

export async function createAdCampaignAction(input: {
  owner_contact_id: string | null;
  kanal: AdChannel;
  nazwa: string;
  budzet_dzienny: number;
  segment: AudienceSegment | null;
}): Promise<AdCampaign> {
  await requireOperator('Kampanie reklamowe');
  if (!input.nazwa.trim()) throw new Error('Podaj nazwę kampanii.');
  const row = {
    owner_contact_id: input.owner_contact_id,
    kanal: input.kanal,
    nazwa: input.nazwa.trim(),
    budzet_dzienny: Math.max(0, input.budzet_dzienny),
    status: 'szkic' as const,
    segment: input.segment,
    external_id: null,
    metryki: {},
  };
  if (!isSupabaseConfigured()) {
    revalidatePath('/marketing');
    return demoStore.createAdCampaign(row);
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from('ad_campaigns').insert(row).select('*').single();
  if (error) throw new Error(error.message);
  revalidatePath('/marketing');
  return data as AdCampaign;
}

// Uruchomienie/wstrzymanie: przez router n8n (ADS_LAUNCH_WEBHOOK_URL → Meta/Google);
// bez ENV = zmiana statusu + honest info (metryki dosypie cron /api/ads/sync).
export async function setAdCampaignStatus(
  id: string,
  status: AdCampaign['status']
): Promise<string> {
  await requireOperator('Kampanie reklamowe');
  const webhook = process.env.ADS_LAUNCH_WEBHOOK_URL;
  let externalId: string | null = null;
  if (webhook && status === 'aktywna') {
    try {
      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: id, akcja: 'launch' }),
      });
      const json = await res.json().catch(() => ({}));
      externalId = json.external_id ?? null;
    } catch {
      // launch przez n8n best-effort
    }
  }
  if (!isSupabaseConfigured()) {
    demoStore.updateAdCampaign(id, { status, ...(externalId ? { external_id: externalId } : {}) });
  } else {
    const supabase = await createClient();
    const { error } = await supabase
      .from('ad_campaigns')
      .update({ status, ...(externalId ? { external_id: externalId } : {}) })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }
  revalidatePath('/marketing');
  return status === 'aktywna'
    ? webhook
      ? 'Kampania uruchomiona przez router n8n — metryki zsynchronizuje cron.'
      : 'Kampania aktywna (metryki: symulacja demo do czasu wpięcia ADS_LAUNCH/SYNC_WEBHOOK_URL).'
    : `Status kampanii: ${status}.`;
}
