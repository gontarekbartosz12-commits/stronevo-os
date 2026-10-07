import { sendOpsAlert } from './alerts';
import { normalizeBusinessHours, isAfterHours } from './business-hours';
import { demoStore } from './demo-store';
import { getCalls } from './integrations/calls';
import { sendSms } from './integrations/sms';
import { isSupabaseConfigured } from './supabase/config';
import { createAdminClient, isAdminConfigured } from './supabase/admin';
import { Contact } from './types';

// AUTO-FOLLOW-UP SMS (TOR 1) — realna pętla, którą woła cron /api/followup/run.
// Zasada: dla kontaktów z auto_followup_sms=true bierzemy STRACONE leady po
// godzinach (nieumówione, w oknie czasowym) i wysyłamy im JEDEN SMS z prośbą
// o kontakt. Dedup przez followup_log (contact_id+call_id) — nikt nie dostaje
// dwóch. SMS realnie żyje (Zadarma). Bezpieczniki:
//  - FOLLOWUP_WINDOW_HOURS (dom. 24) — tylko świeże połączenia (brak blastu historii),
//  - FOLLOWUP_MAX_PER_RUN (dom. 50) — twardy limit na przebieg (log, gdy przycięto),
//  - wpis do dedupu TYLKO po realnej wysyłce (mock nie „zużywa" leada).

export interface FollowupContactResult {
  contact_id: string;
  firma: string;
  wyslane: number;
  pominiete: number; // już follow-upowane wcześniej
  bledy: number; // próba wysyłki bez skutku (np. mock/brak kluczy) — do retry
  powod?: string; // gdy kontakt pominięty w całości (np. dane połączeń nie są live)
}

export interface FollowupRunResult {
  results: FollowupContactResult[];
  wyslaneRazem: number;
  przyciete: boolean;
}

// Dedup w trybie demo (bez bazy) — pamięć procesu, wystarcza do testów.
const demoFollowups = new Set<string>();

function windowHours(): number {
  const raw = Number(process.env.FOLLOWUP_WINDOW_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : 24;
}

function maxPerRun(): number {
  const raw = Number(process.env.FOLLOWUP_MAX_PER_RUN);
  return Number.isFinite(raw) && raw > 0 ? raw : 50;
}

export async function runAutoFollowups(now = new Date()): Promise<FollowupRunResult> {
  const demo = !isSupabaseConfigured();
  if (!demo && !isAdminConfigured()) {
    throw new Error('Brak SUPABASE_SERVICE_ROLE_KEY — cron follow-upów wymaga service role.');
  }
  const cutoff = new Date(now.getTime() - windowHours() * 3600_000);
  const cap = maxPerRun();

  // 1) Kontakty z włączonym auto-follow-upem
  let contacts: Contact[];
  if (demo) {
    contacts = demoStore.listContacts().filter((c) => c.auto_followup_sms);
  } else {
    const { data } = await createAdminClient()
      .from('contacts')
      .select('*')
      .eq('auto_followup_sms', true);
    contacts = (data ?? []) as Contact[];
  }

  const results: FollowupContactResult[] = [];
  let wyslaneRazem = 0;
  let przyciete = false;

  for (const contact of contacts) {
    if (wyslaneRazem >= cap) {
      przyciete = true;
      break;
    }
    const firma = contact.firma ?? contact.imie;
    const hours = normalizeBusinessHours(contact.business_hours);
    const callsRes = await getCalls(contact.id);

    // BEZPIECZNIK: mockowe połączenia mają ZMYŚLONE numery. Nigdy nie wysyłamy
    // realnego SMS-a na dane, które nie są live (np. gdy Vapi chwilowo padło i
    // getCalls spadło na mock) — inaczej blastujemy losowe numery.
    if (callsRes.source !== 'live') {
      results.push({
        contact_id: contact.id,
        firma,
        wyslane: 0,
        pominiete: 0,
        bledy: 0,
        powod: 'dane połączeń nie są live (mock/fallback) — pominięto dla bezpieczeństwa',
      });
      continue;
    }

    // Stracone leady = nieumówione, PO GODZINACH, w oknie czasowym.
    const lost = callsRes.data.filter(
      (c) =>
        c.wynik === 'nieumowiono' &&
        new Date(c.czas) >= cutoff &&
        isAfterHours(hours, new Date(c.czas))
    );

    let wyslane = 0;
    let pominiete = 0;
    let bledy = 0;

    for (const call of lost) {
      if (wyslaneRazem >= cap) {
        przyciete = true;
        break;
      }
      if (await alreadyFollowedUp(demo, contact.id, call.id)) {
        pominiete++;
        continue;
      }
      const r = await sendSms(
        call.numer,
        `Dzień dobry, tu ${firma}. Widzieliśmy Państwa telefon poza godzinami pracy — oddzwonimy najszybciej jak się da. Można też odpisać na tego SMS-a.`
      );
      const ok = r.source === 'live' && r.data.sent;
      if (ok) {
        await logFollowup(demo, contact.id, call.id, call.numer);
        wyslane++;
        wyslaneRazem++;
      } else {
        // brak realnej wysyłki (mock/brak kluczy) → NIE logujemy, retry następnym razem
        bledy++;
      }
    }

    results.push({ contact_id: contact.id, firma, wyslane, pominiete, bledy });
  }

  if (przyciete) {
    await sendOpsAlert(
      `⚠️ Auto-follow-up: osiągnięto limit ${cap} SMS/przebieg — reszta leadów pójdzie w kolejnym uruchomieniu.`
    );
  }
  if (wyslaneRazem > 0) {
    await sendOpsAlert(`📨 Auto-follow-up: wysłano ${wyslaneRazem} SMS do straconych leadów.`);
  }

  return { results, wyslaneRazem, przyciete };
}

async function alreadyFollowedUp(demo: boolean, contactId: string, callId: string): Promise<boolean> {
  if (demo) return demoFollowups.has(`${contactId}:${callId}`);
  const { data } = await createAdminClient()
    .from('followup_log')
    .select('id')
    .eq('contact_id', contactId)
    .eq('call_id', callId)
    .maybeSingle();
  return Boolean(data);
}

async function logFollowup(
  demo: boolean,
  contactId: string,
  callId: string,
  numer: string
): Promise<void> {
  if (demo) {
    demoFollowups.add(`${contactId}:${callId}`);
    return;
  }
  // upsert-safe: unikalny (contact_id, call_id) chroni przed dublem przy wyścigu
  await createAdminClient()
    .from('followup_log')
    .upsert(
      { contact_id: contactId, call_id: callId, numer, sent: true },
      { onConflict: 'contact_id,call_id' }
    );
}
