import { demoStore } from './demo-store';
import { cloneN8nWorkflow, resolveGoldenTemplate, tagWorkflowForClient } from './integrations/n8n';
import { isSupabaseConfigured } from './supabase/config';
import { createAdminClient, isAdminConfigured } from './supabase/admin';
import {
  Automation,
  ClientAutomation,
  Contact,
  KnowledgeDoc,
  MessageTemplate,
  PIPELINE_STATUSES,
  Snapshot,
  SnapshotPayload,
  Task,
  UptimeCheck,
} from './types';

// SNAPSHOTS (Faza 5) — produktyzacja: zrzut DZIAŁAJĄCEGO setupu klienta X
// → wdrożenie 1-klik u klienta Y. Server-only (live = service role).
// Wpięcie w control-plane: każda automatyzacja ze snapshotu dostaje zadanie
// build (wykonawca: agent) — pojawia się w /zadania i /agenci jak zwykłe
// wdrożenie; klon golden-template n8n robiony best-effort od razu.

export async function buildSnapshotPayload(contactId: string): Promise<SnapshotPayload> {
  const demo = !isSupabaseConfigured();

  let contact: Contact | null;
  let cas: ClientAutomation[];
  let automations: Automation[];
  let szablony: MessageTemplate[];
  let wiedza: KnowledgeDoc[];
  let uptime: UptimeCheck[];

  if (demo) {
    contact = demoStore.getContact(contactId);
    cas = demoStore.listClientAutomations(contactId);
    automations = demoStore.listAutomations();
    szablony = demoStore.listMessageTemplates(contactId).filter((t) => t.owner_contact_id === contactId);
    wiedza = demoStore.listKnowledgeDocs(contactId);
    uptime = demoStore.listUptimeChecks(contactId);
  } else {
    const db = createAdminClient();
    const [c, ca, a, t, k, u] = await Promise.all([
      db.from('contacts').select('*').eq('id', contactId).maybeSingle(),
      db.from('client_automations').select('*').eq('contact_id', contactId),
      db.from('automations_catalog').select('*'),
      db.from('message_templates').select('*').eq('owner_contact_id', contactId),
      db.from('knowledge_docs').select('*').eq('contact_id', contactId),
      db.from('uptime_checks').select('*').eq('contact_id', contactId),
    ]);
    contact = c.data as Contact | null;
    cas = (ca.data ?? []) as ClientAutomation[];
    automations = (a.data ?? []) as Automation[];
    szablony = (t.data ?? []) as MessageTemplate[];
    wiedza = (k.data ?? []) as KnowledgeDoc[];
    uptime = (u.data ?? []) as UptimeCheck[];
  }
  if (!contact) throw new Error('Klient źródłowy nie istnieje.');

  return {
    zrodlo_contact_id: contact.id,
    zrodlo_nazwa: contact.firma ?? contact.imie,
    automatyzacje: cas.map((ca) => {
      const auto = automations.find((x) => x.id === ca.automation_id);
      return {
        automation_id: ca.automation_id,
        nazwa: auto?.nazwa ?? 'Automatyzacja',
        template_version: ca.template_version ?? null,
        typ: auto?.typ ?? 'n8n',
      };
    }),
    szablony: szablony.map((s) => ({ nazwa: s.nazwa, tresc: s.tresc })),
    wiedza: wiedza.map((w) => ({ tytul: w.tytul, tresc: w.tresc })),
    uptime: uptime.map((u) => ({ nazwa: u.nazwa, url: u.url, interval_min: u.interval_min })),
    pipeline: { statusy: PIPELINE_STATUSES },
  };
}

export interface SnapshotDeployResult {
  automatyzacje: number;
  szablony: number;
  wiedza: number;
  uptime: number;
  taski: number;
  n8n_klony: { nazwa: string; ok: boolean; szczegoly: string }[];
}

// Wdrożenie snapshotu u klienta Y: client_automations (provisioning) + taski
// build (control-plane agentów) + klon golden-template n8n (best-effort) +
// szablony + wiedza bota + monitoring. Kwoty/faktury NIE są ruszane —
// rozliczenie spina operator (przypisanie w CRM / subskrypcja).
export async function deploySnapshot(
  snapshot: Snapshot,
  targetContactId: string
): Promise<SnapshotDeployResult> {
  const demo = !isSupabaseConfigured();
  if (!demo && !isAdminConfigured()) {
    throw new Error('Brak SUPABASE_SERVICE_ROLE_KEY — deploy snapshotu wymaga service role.');
  }

  let target: Contact | null;
  if (demo) {
    target = demoStore.getContact(targetContactId);
  } else {
    const { data } = await createAdminClient()
      .from('contacts')
      .select('*')
      .eq('id', targetContactId)
      .maybeSingle();
    target = data as Contact | null;
  }
  if (!target) throw new Error('Klient docelowy nie istnieje.');
  const nazwaKlienta = target.firma ?? target.imie;
  const p = snapshot.payload;

  const result: SnapshotDeployResult = {
    automatyzacje: 0,
    szablony: 0,
    wiedza: 0,
    uptime: 0,
    taski: 0,
    n8n_klony: [],
  };

  // 1) automatyzacje: client_automations (provisioning) + klon n8n + task build
  for (const auto of p.automatyzacje) {
    // klon golden-template w n8n (best-effort; bez N8N_* = honest info)
    let workflowId: string | null = null;
    const golden = await resolveGoldenTemplate(auto.typ);
    if (golden) {
      const klon = await cloneN8nWorkflow(golden.id, `${auto.nazwa} — ${nazwaKlienta} [snapshot]`);
      if (klon.ok && klon.id) {
        workflowId = klon.id;
        await tagWorkflowForClient(klon.id, nazwaKlienta);
        result.n8n_klony.push({ nazwa: auto.nazwa, ok: true, szczegoly: `sklonowano wf ${klon.id} (${klon.nodeCount} nodes)` });
      } else {
        result.n8n_klony.push({ nazwa: auto.nazwa, ok: false, szczegoly: klon.error ?? 'błąd klonu' });
      }
    } else {
      result.n8n_klony.push({ nazwa: auto.nazwa, ok: false, szczegoly: 'brak N8N_BASE_URL/API_KEY lub golden-template — agent sklonuje przy buildzie' });
    }

    const caRow = {
      contact_id: targetContactId,
      automation_id: auto.automation_id,
      n8n_workflow_id: workflowId,
      status: 'provisioning' as const,
      data_startu: new Date().toISOString().slice(0, 10),
      template_version: auto.template_version,
    };
    const taskRow: Omit<Task, 'id' | 'created_at'> = {
      contact_id: targetContactId,
      typ: `Zbuduj automatyzację: ${auto.nazwa} — ${nazwaKlienta} (ze snapshotu „${snapshot.nazwa}")`,
      kategoria: 'build',
      wykonawca: 'agent',
      status: 'do_zrobienia',
      diff: null,
      review_status: null,
    };
    if (demo) {
      demoStore.createClientAutomation(caRow);
      demoStore.createTask(taskRow);
    } else {
      const db = createAdminClient();
      await db.from('client_automations').insert(caRow);
      await db.from('tasks').insert(taskRow);
    }
    result.automatyzacje++;
    result.taski++;
  }

  // 2) szablony wiadomości
  for (const s of p.szablony) {
    const row = { owner_contact_id: targetContactId, nazwa: s.nazwa, tresc: s.tresc };
    if (demo) {
      const db = demoStore;
      if (!db.listMessageTemplates(targetContactId).some((t) => t.nazwa === s.nazwa && t.owner_contact_id === targetContactId)) {
        // demo-store nie ma createMessageTemplate — dodajemy przez knowledge? Nie:
        // dodajemy metodą createMessageTemplate (dodana w Fazie 5).
        demoStore.createMessageTemplate(row);
        result.szablony++;
      }
    } else {
      await createAdminClient().from('message_templates').insert(row);
      result.szablony++;
    }
  }

  // 3) wiedza bota (Conversation AI działa u Y od pierwszej wiadomości)
  for (const w of p.wiedza) {
    const row = { contact_id: targetContactId, tytul: w.tytul, tresc: w.tresc, embedding: null };
    if (demo) {
      demoStore.createKnowledgeDoc(row);
    } else {
      await createAdminClient().from('knowledge_docs').insert(row);
    }
    result.wiedza++;
  }

  // 4) monitoring uptime (URL-e do podmiany przy wpięciu workflowów)
  for (const u of p.uptime) {
    const row = {
      client_automation_id: null,
      contact_id: targetContactId,
      nazwa: `${u.nazwa.split('—')[0].trim()} — ${nazwaKlienta}`,
      url: u.url, // operator podmienia na webhook nowego klienta przy deployu wf
      method: 'GET' as const,
      expected_status: 200,
      interval_min: u.interval_min,
      aktywny: false, // włącza operator po podmianie URL
      last_check_at: null,
      last_status: null,
      ok: null,
    };
    if (demo) {
      demoStore.createUptimeCheck(row);
    } else {
      await createAdminClient().from('uptime_checks').insert(row);
    }
    result.uptime++;
  }

  // 5) notyfikacja
  const notif = {
    typ: 'biznes' as const,
    severity: 'info' as const,
    tytul: `📦 Snapshot wdrożony: „${snapshot.nazwa}" → ${nazwaKlienta}`,
    opis: `${result.automatyzacje} automatyzacji (taski build w /zadania), ${result.szablony} szablonów, ${result.wiedza} dok. wiedzy, ${result.uptime} monitorów (do aktywacji po podmianie URL).`,
    related_typ: 'contact',
    related_id: targetContactId,
    status: 'nowe' as const,
    akcje: [],
  };
  if (demo) {
    demoStore.createNotification(notif);
  } else {
    await createAdminClient().from('notifications').insert(notif);
  }

  return result;
}
