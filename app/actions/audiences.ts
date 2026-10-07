'use server';

import { demoStore } from '@/lib/demo-store';
import { AudiencePushResult, sendCustomAudience } from '@/lib/integrations/meta';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import {
  AUDIENCE_SEGMENT_META,
  AudienceSegment,
  Contact,
  DataSource,
} from '@/lib/types';

async function allContacts(): Promise<Contact[]> {
  // Remarketing CEO działa tylko na kontaktach STRONEVO — leady klientów wykluczone.
  if (!isSupabaseConfigured())
    return demoStore.listContacts().filter((c) => !c.owner_contact_id);
  const supabase = await createClient();
  const { data } = await supabase.from('contacts').select('*').is('owner_contact_id', null);
  return (data ?? []) as Contact[];
}

function filterSegment(contacts: Contact[], segment: AudienceSegment): Contact[] {
  switch (segment) {
    case 'nie_odebral':
      return contacts.filter((c) => c.status_pipeline === 'PROBA_KONTAKTU');
    case 'piec':
      return contacts.filter((c) => c.status_pipeline === 'PIEC');
    case 'klienci_upsell':
      return contacts.filter((c) => c.typ === 'klient');
  }
}

export interface SegmentInfo {
  segment: AudienceSegment;
  label: string;
  opis: string;
  liczba: number;
  zDanymi: number; // kontakty z e-mailem lub telefonem (wysyłalne do Meta)
}

export async function getSegments(): Promise<SegmentInfo[]> {
  const contacts = await allContacts();
  return (Object.keys(AUDIENCE_SEGMENT_META) as AudienceSegment[]).map((segment) => {
    const inSegment = filterSegment(contacts, segment);
    return {
      segment,
      label: AUDIENCE_SEGMENT_META[segment].label,
      opis: AUDIENCE_SEGMENT_META[segment].opis,
      liczba: inSegment.length,
      zDanymi: inSegment.filter((c) => c.email || c.telefon).length,
    };
  });
}

export interface PushSegmentResult extends AudiencePushResult {
  source: DataSource;
}

// "Wyślij segment do Meta Custom Audiences" — stub bez META_TOKEN,
// live przez Graph API (rekordy hashowane SHA-256 w lib/integrations/meta.ts).
export async function pushSegmentToMeta(segment: AudienceSegment): Promise<PushSegmentResult> {
  const contacts = filterSegment(await allContacts(), segment);
  if (contacts.length === 0) throw new Error('Segment jest pusty — nic do wysłania.');

  const audienceName = `STRONEVO — ${AUDIENCE_SEGMENT_META[segment].label}`;
  const result = await sendCustomAudience(audienceName, contacts);
  return { ...result.data, source: result.source };
}
