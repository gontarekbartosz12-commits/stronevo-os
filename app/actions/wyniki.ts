'use server';

import { revalidatePath } from 'next/cache';
import { demoStore } from '@/lib/demo-store';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import {
  AppNotification,
  Automation,
  AutomationEvent,
  ClientAutomation,
  Contact,
  MonthlyReport,
  WorkflowError,
} from '@/lib/types';
import {
  AutomationRollup,
  ClientRollup,
  TrendPoint,
  WynikiKpi,
  computeKpi,
  computeTrend,
  inRange,
  lastDaysRange,
  metodaOpis,
  miesiacDopelniacz,
  monthRange,
  roiSentence,
  rollupAutomation,
  stawkaPlnH,
  worstHealth,
} from '@/lib/wyniki';

// PANEL WYNIKÓW — warstwa danych.
// CEO widzi wyniki WSZYSTKICH wdrożeń; klient — wyłącznie swoje (w trybie live
// pilnuje tego RLS: automation_events "klient read own", monthly_reports j.w.).
// Wszystkie kwoty = JAWNY SZACUNEK („~”) — metoda opisana w każdym widoku.

export interface WynikiOverview {
  kpiMiesiac: WynikiKpi;
  miesiacLabel: string;
  clients: ClientRollup[];
  automationHealth: AutomationRollup[];
  // Faza 1 zaufania: realne błędy z workflow_errors (otwarte najpierw)
  errors: WorkflowError[];
  trend90: TrendPoint[];
  stawkaGlobal: number;
  metoda: string;
}

export interface WynikiClientData {
  contact: Contact;
  kpiMiesiac: WynikiKpi;
  miesiacLabel: string;
  roiZdanie: string;
  automatyzacje: AutomationRollup[];
  trend30: TrendPoint[];
  raporty: MonthlyReport[];
  stawka: number;
  metoda: string;
}

interface RawData {
  contacts: Contact[];
  clientAutomations: ClientAutomation[];
  automations: Automation[];
  events: AutomationEvent[]; // ostatnie 90 dni
  notifications: AppNotification[]; // techniczne, powiązane z wdrożeniami
  workflowErrors: WorkflowError[]; // Faza 1 zaufania — realne błędy floty
}

async function fetchRaw(contactId?: string): Promise<RawData> {
  const from = lastDaysRange(90).from.toISOString();

  if (!isSupabaseConfigured()) {
    return {
      contacts: demoStore.listContacts(),
      clientAutomations: demoStore.listClientAutomations(contactId),
      automations: demoStore.listAutomations(),
      events: demoStore.listAutomationEvents({ contactId, from: new Date(from) }),
      notifications: demoStore
        .listNotifications()
        .filter((n) => n.related_typ === 'client_automation'),
      workflowErrors: demoStore.listWorkflowErrors(),
    };
  }

  const supabase = await createClient();
  let eventsQuery = supabase.from('automation_events').select('*').gte('created_at', from);
  let caQuery = supabase.from('client_automations').select('*');
  if (contactId) {
    eventsQuery = eventsQuery.eq('contact_id', contactId);
    caQuery = caQuery.eq('contact_id', contactId);
  }
  const [contacts, cas, automations, events, notifications, errors] = await Promise.all([
    supabase.from('contacts').select('*').is('owner_contact_id', null),
    caQuery,
    supabase.from('automations_catalog').select('*'),
    eventsQuery,
    supabase
      .from('notifications')
      .select('*')
      .eq('related_typ', 'client_automation')
      .neq('status', 'rozwiazane'),
    supabase
      .from('workflow_errors')
      .select('*')
      .gte('created_at', from)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  return {
    contacts: (contacts.data ?? []) as Contact[],
    clientAutomations: (cas.data ?? []) as ClientAutomation[],
    automations: (automations.data ?? []) as Automation[],
    events: (events.data ?? []) as AutomationEvent[],
    // Klient nie ma dostępu do notifications/workflow_errors (RLS) — wtedy puste
    // listy; zdrowie i surowe błędy pokazujemy wyłącznie na ekranach CEO.
    notifications: (notifications.data ?? []) as AppNotification[],
    workflowErrors: (errors.data ?? []) as WorkflowError[],
  };
}

function buildRollups(raw: RawData, now = new Date()): AutomationRollup[] {
  const openErrorCa = new Set([
    ...raw.notifications
      .filter((n) => n.status !== 'rozwiazane' && n.related_id)
      .map((n) => n.related_id as string),
    // Faza 1 zaufania: otwarty wpis w workflow_errors też trzyma zdrowie na czerwono
    ...raw.workflowErrors
      .filter((e) => e.status !== 'rozwiazany' && e.client_automation_id)
      .map((e) => e.client_automation_id as string),
  ]);

  return raw.clientAutomations.map((ca) => {
    const automation = raw.automations.find((a) => a.id === ca.automation_id);
    const klient = raw.contacts.find((c) => c.id === ca.contact_id) ?? null;
    const events = raw.events.filter((e) => e.client_automation_id === ca.id);
    return rollupAutomation(
      ca,
      automation?.nazwa ?? 'Automatyzacja',
      klient,
      events,
      openErrorCa.has(ca.id),
      now
    );
  });
}

// ===== Ekran CEO: /wyniki =====

export async function getWynikiOverview(): Promise<WynikiOverview> {
  const raw = await fetchRaw();
  const now = new Date();
  const { from: mFrom, to: mTo } = monthRange(now);

  const rollups = buildRollups(raw, now);
  const kpiMiesiac = computeKpi(raw.events.filter((e) => inRange(e.created_at, mFrom, mTo)));

  const range30 = lastDaysRange(30, now);
  const clients: ClientRollup[] = raw.contacts
    .filter((c) => c.typ === 'klient' && !c.owner_contact_id)
    .map((contact) => {
      const own = rollups.filter((r) => r.ca.contact_id === contact.id);
      const events30 = raw.events.filter(
        (e) => e.contact_id === contact.id && inRange(e.created_at, range30.from, range30.to)
      );
      const kpi30 = computeKpi(events30);
      const last = events30.reduce<string | null>(
        (acc, e) => (!acc || e.created_at > acc ? e.created_at : acc),
        own.reduce<string | null>((a, r) => (!a || (r.lastEventAt ?? '') > a ? r.lastEventAt : a), null)
      );
      return {
        contact,
        aktywneAutomatyzacje: own.filter((r) => r.ca.status === 'active').length,
        zdarzenia30d: events30.filter((e) => e.typ !== 'blad').length,
        ostatniaAktywnosc: last,
        health: worstHealth(own.map((r) => r.health)),
        roi30dPln: kpi30.wartoscPln,
      };
    })
    .sort((a, b) => b.roi30dPln - a.roi30dPln);

  // Zdrowie wdrożeń: czerwone na górze
  const rank = { blad: 0, uwaga: 1, nowa: 2, ok: 3 } as const;
  const automationHealth = [...rollups].sort((a, b) => rank[a.health] - rank[b.health]);

  // Błędy: otwarte najpierw, potem świeżość
  const errRank = { nowy: 0, w_toku: 1, rozwiazany: 2 } as const;
  const errors = [...raw.workflowErrors].sort(
    (a, b) => errRank[a.status] - errRank[b.status] || b.created_at.localeCompare(a.created_at)
  );

  return {
    kpiMiesiac,
    miesiacLabel: miesiacDopelniacz(now),
    clients,
    automationHealth,
    errors,
    trend90: computeTrend(raw.events, 90, now),
    stawkaGlobal: stawkaPlnH(null),
    metoda: metodaOpis(stawkaPlnH(null)),
  };
}

// ===== Szczegół klienta (CEO /wyniki/[id]) + sekcja „Twoje wyniki" (/klient) =====

export async function getWynikiClient(contactId: string): Promise<WynikiClientData | null> {
  const raw = await fetchRaw(contactId);
  const contact = raw.contacts.find((c) => c.id === contactId) ?? null;
  if (!contact) return null;

  const now = new Date();
  const { from: mFrom, to: mTo } = monthRange(now);
  const events = raw.events.filter((e) => e.contact_id === contactId);
  const kpiMiesiac = computeKpi(events.filter((e) => inRange(e.created_at, mFrom, mTo)));
  const stawka = stawkaPlnH(contact);

  let raporty: MonthlyReport[];
  if (!isSupabaseConfigured()) {
    raporty = demoStore.listMonthlyReports(contactId);
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from('monthly_reports')
      .select('*')
      .eq('contact_id', contactId)
      .order('okres', { ascending: false });
    raporty = (data ?? []) as MonthlyReport[];
  }

  return {
    contact,
    kpiMiesiac,
    miesiacLabel: miesiacDopelniacz(now),
    roiZdanie: roiSentence(kpiMiesiac, `W ${miesiacDopelniacz(now)}`),
    automatyzacje: buildRollups(raw, now).filter((r) => r.ca.contact_id === contactId),
    trend30: computeTrend(events, 30, now),
    raporty,
    stawka,
    metoda: metodaOpis(stawka),
  };
}

// ===== „Utwórz zadanie remediacji" (sekcja Zdrowie wdrożeń) =====

export async function createRemediationTask(
  clientAutomationId: string,
  nazwa: string,
  klientNazwa: string | null,
  contactId: string | null
): Promise<string> {
  const typ = `Naprawić wdrożenie: ${nazwa}${klientNazwa ? ` (${klientNazwa})` : ''} — brak zdarzeń / błąd`;

  if (!isSupabaseConfigured()) {
    demoStore.createTask({
      contact_id: contactId,
      typ,
      kategoria: 'remediation',
      wykonawca: 'human',
      status: 'do_zrobienia',
      diff: null,
      review_status: null,
    });
  } else {
    const supabase = await createClient();
    const { error } = await supabase.from('tasks').insert({
      contact_id: contactId,
      typ,
      kategoria: 'remediation',
      wykonawca: 'human',
      status: 'do_zrobienia',
    });
    if (error) throw new Error(`Nie udało się utworzyć zadania: ${error.message}`);
  }

  revalidatePath('/wyniki');
  revalidatePath('/zadania');
  return `Zadanie remediacji utworzone: „${typ}". Znajdziesz je w Zadaniach.`;
}
