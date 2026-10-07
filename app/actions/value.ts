'use server';

import { revalidatePath } from 'next/cache';
import { demoStore } from '@/lib/demo-store';
import { normalizeBusinessHours, isAfterHours } from '@/lib/business-hours';
import { getCalls } from '@/lib/integrations/calls';
import { sendSms } from '@/lib/integrations/sms';
import { getVocInsights } from '@/lib/integrations/voc';
import { computeValueStats, ValueStats } from '@/lib/value';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import { CallWithMeta, Contact, DataSource, VocInsight } from '@/lib/types';

export interface ValuePanelData {
  stats: ValueStats;
  hoursDefined: boolean;
  autoFollowupSms: boolean;
  voc: VocInsight[];
  vocSource: DataSource;
  callsSource: DataSource;
}

async function getContact(id: string): Promise<Contact | null> {
  if (!isSupabaseConfigured()) return demoStore.getContact(id);
  const supabase = await createClient();
  const { data } = await supabase.from('contacts').select('*').eq('id', id).maybeSingle();
  return data as Contact | null;
}

// PANEL WARTOŚCI (panel klienta): Ekran Kasy + stracone leady + Kalendarz
// Kasy + VoC — wszystko liczone z połączeń i godzin pracy (fundament F3).
export async function getValuePanel(contactId: string): Promise<ValuePanelData> {
  const contact = await getContact(contactId);
  if (!contact) throw new Error('Kontakt nie istnieje.');

  const hours = normalizeBusinessHours(contact.business_hours);
  const [callsResult, vocResult] = await Promise.all([
    getCalls(contactId),
    getVocInsights(contactId),
  ]);

  const calls: CallWithMeta[] = callsResult.data.map((c) => ({
    ...c,
    poGodzinach: isAfterHours(hours, new Date(c.czas)),
  }));

  return {
    stats: computeValueStats(calls, contact.srednia_wartosc_wizyty),
    hoursDefined: hours !== null,
    autoFollowupSms: contact.auto_followup_sms,
    voc: vocResult.data,
    vocSource: vocResult.source,
    callsSource: callsResult.source,
  };
}

// Ręczny follow-up SMS do straconego leada (przycisk przy połączeniu)
export async function sendFollowupSms(contactId: string, numer: string): Promise<string> {
  const contact = await getContact(contactId);
  if (!contact) throw new Error('Kontakt nie istnieje.');

  const firma = contact.firma ?? contact.imie;
  const result = await sendSms(
    numer,
    `Dzień dobry, tu ${firma}. Widzieliśmy Państwa telefon — oddzwonimy najszybciej jak się da. Można też odpisać na tego SMS-a.`
  );

  return result.source === 'live' && result.data.sent
    ? `SMS follow-up wysłany na ${numer}.`
    : `SMS w trybie mock — po wpięciu kluczy Zadarma (ZADARMA_KEY/SECRET) ten przycisk wyśle realny SMS na ${numer}.`;
}

// Auto-follow-up: nowe stracone leady po godzinach dostają SMS automatycznie.
// Flagę realnie czyta cron /api/followup/run (lib/followup-run.ts) — wysyła SMS
// do świeżych, nieodebranych leadów (dedup w followup_log). To NIE martwa flaga.
export async function setAutoFollowup(contactId: string, enabled: boolean): Promise<string> {
  if (!isSupabaseConfigured()) {
    demoStore.updateContact(contactId, { auto_followup_sms: enabled });
  } else {
    const supabase = await createClient();
    const { error } = await supabase
      .from('contacts')
      .update({ auto_followup_sms: enabled })
      .eq('id', contactId);
    if (error) throw new Error(`Nie udało się zapisać: ${error.message}`);
  }
  revalidatePath('/klient');
  return enabled
    ? 'Auto-follow-up SMS włączony — nowe nieodebrane telefony po godzinach dostaną SMS automatycznie (co godzinę, każdy lead raz).'
    : 'Auto-follow-up SMS wyłączony — nowe stracone leady nie dostaną już automatycznego SMS-a.';
}
