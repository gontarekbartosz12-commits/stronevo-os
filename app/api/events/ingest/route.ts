import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/demo-store';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';
import {
  AutomationEvent,
  ClientAutomation,
  Contact,
  EVENT_SOURCES,
  EVENT_TYPES,
  EventSource,
  EventType,
  EventValueConfig,
} from '@/lib/types';
import {
  DEFAULT_EVENT_VALUES,
  minutyForTyp,
  stawkaPlnH,
  wycenaZdarzenia,
} from '@/lib/wyniki';

// POST /api/events/ingest — JEDYNA droga zapisu zdarzeń wyników (Panel Wyników).
// Wołane z n8n/Vapi/bramy SMS po każdym zdarzeniu runtime (rozmowa, lead,
// rezerwacja, SMS, opinia, workflow, błąd).
//
// Autoryzacja: nagłówek x-ingest-key = ENV EVENTS_INGEST_KEY.
// Bez klucza w ENV — endpoint otwarty (dev/demo), jak pozostałe automaty.
// Zapis w trybie live: WYŁĄCZNIE service role (RLS nie daje insertu nikomu innemu).
//
// Body: { contact_id? | client_automation_id?, typ, zrodlo, meta? }
// Dolicza minuty+wartość z event_values × stawka (contacts.stawka_pln_h lub ENV),
// aktualizuje client_automations.last_event_at/health; typ='blad' → notification
// (severity warn) — spięcie z istniejącym self-healingiem.

interface IngestBody {
  contact_id?: string;
  client_automation_id?: string;
  typ?: string;
  zrodlo?: string;
  meta?: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  const key = process.env.EVENTS_INGEST_KEY;
  if (key && request.headers.get('x-ingest-key') !== key) {
    return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 });
  }

  let body: IngestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body musi być JSON-em' }, { status: 400 });
  }

  const typ = body.typ as EventType;
  const zrodlo = body.zrodlo as EventSource;
  if (!EVENT_TYPES.includes(typ)) {
    return NextResponse.json(
      { error: `Nieznany typ zdarzenia. Dozwolone: ${EVENT_TYPES.join(', ')}` },
      { status: 400 }
    );
  }
  if (!EVENT_SOURCES.includes(zrodlo)) {
    return NextResponse.json(
      { error: `Nieznane źródło. Dozwolone: ${EVENT_SOURCES.join(', ')}` },
      { status: 400 }
    );
  }
  if (!body.contact_id && !body.client_automation_id) {
    return NextResponse.json(
      { error: 'Podaj contact_id lub client_automation_id' },
      { status: 400 }
    );
  }

  try {
    const result = isSupabaseConfigured()
      ? await ingestLive(body, typ, zrodlo)
      : await ingestDemo(body, typ, zrodlo);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Błąd zapisu zdarzenia' },
      { status: 500 }
    );
  }
}

interface IngestOk {
  event_id: string;
  contact_id: string;
  client_automation_id: string | null;
  minuty_oszczedzone: number;
  wartosc_pln: number;
}

type IngestResult = IngestOk | { error: string; status: number };

function bladNotification(nazwa: string, caId: string | null, meta?: Record<string, unknown>) {
  return {
    typ: 'techniczne' as const,
    severity: 'warn' as const,
    tytul: `Wdrożenie zgłosiło błąd: ${nazwa}`,
    opis: `Zdarzenie typu "blad" z Panelu Wyników.${meta?.blad ? ` Szczegóły: ${String(meta.blad)}.` : ''} Utwórz zadanie remediacji w /wyniki lub sprawdź workflow w n8n.`,
    related_typ: 'client_automation',
    related_id: caId,
    status: 'nowe' as const,
    akcje: [],
  };
}

async function ingestDemo(
  body: IngestBody,
  typ: EventType,
  zrodlo: EventSource
): Promise<IngestResult> {
  let ca: ClientAutomation | null = null;
  if (body.client_automation_id) {
    ca = demoStore.getClientAutomation(body.client_automation_id);
    if (!ca) return { error: 'Nie znaleziono wdrożenia (client_automation_id)', status: 404 };
  }
  const contactId = body.contact_id ?? ca?.contact_id;
  const contact = contactId ? demoStore.getContact(contactId) : null;
  if (!contact) return { error: 'Nie znaleziono klienta (contact_id)', status: 404 };

  const minuty = minutyForTyp(typ, DEFAULT_EVENT_VALUES);
  const wartosc = wycenaZdarzenia(minuty, stawkaPlnH(contact));

  const event = demoStore.createAutomationEvent({
    contact_id: contact.id,
    client_automation_id: ca?.id ?? null,
    typ,
    zrodlo,
    minuty_oszczedzone: minuty,
    wartosc_pln: wartosc,
    meta: body.meta ?? {},
  });

  if (ca) {
    const openError =
      typ === 'blad' || demoStore.hasOpenNotificationFor('client_automation', ca.id);
    demoStore.updateClientAutomation(ca.id, {
      last_event_at: event.created_at,
      health: openError ? 'blad' : 'ok',
    });
  }
  if (typ === 'blad') {
    const nazwa = ca ? demoStore.getAutomation(ca.automation_id)?.nazwa ?? 'automatyzacja' : 'automatyzacja';
    if (!ca || !demoStore.hasOpenNotificationFor('client_automation', ca.id)) {
      demoStore.createNotification(
        bladNotification(`${nazwa} (${contact.firma ?? contact.imie})`, ca?.id ?? null, body.meta)
      );
    }
  }

  return {
    event_id: event.id,
    contact_id: contact.id,
    client_automation_id: ca?.id ?? null,
    minuty_oszczedzone: minuty,
    wartosc_pln: wartosc,
  };
}

async function ingestLive(
  body: IngestBody,
  typ: EventType,
  zrodlo: EventSource
): Promise<IngestResult> {
  if (!isAdminConfigured()) {
    return { error: 'Brak SUPABASE_SERVICE_ROLE_KEY — ingest wymaga service role', status: 503 };
  }
  const supabase = createAdminClient();

  let ca: ClientAutomation | null = null;
  if (body.client_automation_id) {
    const { data } = await supabase
      .from('client_automations')
      .select('*')
      .eq('id', body.client_automation_id)
      .maybeSingle();
    ca = data as ClientAutomation | null;
    if (!ca) return { error: 'Nie znaleziono wdrożenia (client_automation_id)', status: 404 };
  }
  const contactId = body.contact_id ?? ca?.contact_id;
  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', contactId!)
    .maybeSingle();
  if (!contact) return { error: 'Nie znaleziono klienta (contact_id)', status: 404 };

  // Wartościowanie z tabeli event_values (konfigurowalne), fallback = domyślne
  const { data: values } = await supabase.from('event_values').select('*');
  const config = (values && values.length > 0 ? values : DEFAULT_EVENT_VALUES) as EventValueConfig[];
  const minuty = minutyForTyp(typ, config);
  const wartosc = wycenaZdarzenia(minuty, stawkaPlnH(contact as Contact));

  const { data: event, error } = await supabase
    .from('automation_events')
    .insert({
      contact_id: (contact as Contact).id,
      client_automation_id: ca?.id ?? null,
      typ,
      zrodlo,
      minuty_oszczedzone: minuty,
      wartosc_pln: wartosc,
      meta: body.meta ?? {},
    })
    .select('*')
    .single();
  if (error) return { error: `Zapis zdarzenia nie powiódł się: ${error.message}`, status: 500 };

  if (ca) {
    const { data: openNotif } = await supabase
      .from('notifications')
      .select('id')
      .eq('related_typ', 'client_automation')
      .eq('related_id', ca.id)
      .neq('status', 'rozwiazane')
      .limit(1);
    const openError = typ === 'blad' || (openNotif ?? []).length > 0;
    await supabase
      .from('client_automations')
      .update({
        last_event_at: (event as AutomationEvent).created_at,
        health: openError ? 'blad' : 'ok',
      })
      .eq('id', ca.id);

    if (typ === 'blad' && (openNotif ?? []).length === 0) {
      const { data: automation } = await supabase
        .from('automations_catalog')
        .select('nazwa')
        .eq('id', ca.automation_id)
        .maybeSingle();
      await supabase.from('notifications').insert(
        bladNotification(
          `${automation?.nazwa ?? 'automatyzacja'} (${(contact as Contact).firma ?? (contact as Contact).imie})`,
          ca.id,
          body.meta
        )
      );
    }
  } else if (typ === 'blad') {
    await supabase
      .from('notifications')
      .insert(bladNotification((contact as Contact).firma ?? (contact as Contact).imie, null, body.meta));
  }

  return {
    event_id: (event as AutomationEvent).id,
    contact_id: (contact as Contact).id,
    client_automation_id: ca?.id ?? null,
    minuty_oszczedzone: minuty,
    wartosc_pln: wartosc,
  };
}
