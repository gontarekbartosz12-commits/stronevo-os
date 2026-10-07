import { NextRequest, NextResponse } from 'next/server';
import { sendOpsAlert } from '@/lib/alerts';
import { demoStore } from '@/lib/demo-store';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';
import {
  ClientAutomation,
  Contact,
  NotificationSeverity,
  WorkflowError,
} from '@/lib/types';

// POST /api/errors/ingest — zdrowie floty (Faza 1 zaufania).
// Woła to GLOBALNY Error-Workflow n8n przy KAŻDYM błędzie dowolnego workflowa:
// zapis do workflow_errors + powiadomienie (warn, spina self-healing)
// + alert Telegram/SMS do operatora. Błąd widoczny w /wyniki przy następnym
// odświeżeniu (<60 s — strona force-dynamic, czyta prosto z tabeli).
//
// Autoryzacja: x-ingest-key = ENV ERRORS_INGEST_KEY (fallback EVENTS_INGEST_KEY —
// jeden sekret dla obu ingestów, jeśli tak wygodniej). Bez ENV — otwarte (dev/demo).
// Zapis w trybie live: WYŁĄCZNIE service role (RLS bez insertu dla authenticated).
//
// Body: { client_automation_id? | contact_id?, workflow_id?, node?, message,
//         severity? (info|warn|krytyczne, default warn), meta? }

interface ErrorIngestBody {
  client_automation_id?: string;
  contact_id?: string;
  workflow_id?: string;
  node?: string;
  message?: string;
  severity?: string;
  meta?: Record<string, unknown>;
}

const SEVERITIES: NotificationSeverity[] = ['info', 'warn', 'krytyczne'];

export async function POST(request: NextRequest) {
  const key = process.env.ERRORS_INGEST_KEY || process.env.EVENTS_INGEST_KEY;
  if (key && request.headers.get('x-ingest-key') !== key) {
    return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 });
  }

  let body: ErrorIngestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body musi być JSON-em' }, { status: 400 });
  }

  const message = (body.message ?? '').trim();
  if (!message) {
    return NextResponse.json({ error: 'Podaj message (treść błędu)' }, { status: 400 });
  }
  const severity: NotificationSeverity = SEVERITIES.includes(
    body.severity as NotificationSeverity
  )
    ? (body.severity as NotificationSeverity)
    : 'warn';

  try {
    const result = isSupabaseConfigured()
      ? await ingestLive(body, message, severity)
      : await ingestDemo(body, message, severity);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    // Alert operacyjny — fire-and-forget, mock bez kluczy (nie blokuje odpowiedzi)
    const alert = await sendOpsAlert(
      `Błąd workflowa${result.nazwa ? ` [${result.nazwa}]` : ''}${body.workflow_id ? ` (wf: ${body.workflow_id})` : ''}: ${message.slice(0, 200)}`
    );

    return NextResponse.json({ ok: true, ...result, alert });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Błąd zapisu' },
      { status: 500 }
    );
  }
}

interface ErrorIngestOk {
  error_id: string;
  client_automation_id: string | null;
  contact_id: string | null;
  nazwa: string | null; // "automatyzacja (firma)" do alertu
  notification_created: boolean;
}

type ErrorIngestResult = ErrorIngestOk | { error: string; status: number };

function errorNotification(
  nazwa: string,
  message: string,
  severity: NotificationSeverity,
  caId: string | null
) {
  return {
    typ: 'techniczne' as const,
    severity: severity === 'info' ? ('warn' as const) : severity,
    tytul: `Błąd workflowa: ${nazwa}`,
    opis: `${message.slice(0, 300)} — szczegóły w /wyniki (Zdrowie wdrożeń). Utwórz zadanie remediacji lub oznacz błąd jako rozwiązany.`,
    related_typ: 'client_automation',
    related_id: caId,
    status: 'nowe' as const,
    akcje: [],
  };
}

async function ingestDemo(
  body: ErrorIngestBody,
  message: string,
  severity: NotificationSeverity
): Promise<ErrorIngestResult> {
  let ca: ClientAutomation | null = null;
  if (body.client_automation_id) {
    ca = demoStore.getClientAutomation(body.client_automation_id);
    if (!ca) return { error: 'Nie znaleziono wdrożenia (client_automation_id)', status: 404 };
  }
  const contactId = body.contact_id ?? ca?.contact_id ?? null;
  const contact = contactId ? demoStore.getContact(contactId) : null;

  const err = demoStore.createWorkflowError({
    client_automation_id: ca?.id ?? null,
    contact_id: contact?.id ?? null,
    workflow_id: body.workflow_id ?? null,
    node: body.node ?? null,
    message,
    severity,
    status: 'nowy',
    meta: body.meta ?? {},
  });

  const nazwa = ca
    ? `${demoStore.getAutomation(ca.automation_id)?.nazwa ?? 'automatyzacja'}${contact ? ` (${contact.firma ?? contact.imie})` : ''}`
    : contact?.firma ?? contact?.imie ?? null;

  if (ca) demoStore.updateClientAutomation(ca.id, { health: 'blad' });

  let notificationCreated = false;
  if (!ca || !demoStore.hasOpenNotificationFor('client_automation', ca.id)) {
    demoStore.createNotification(
      errorNotification(nazwa ?? 'workflow', message, severity, ca?.id ?? null)
    );
    notificationCreated = true;
  }

  return {
    error_id: err.id,
    client_automation_id: ca?.id ?? null,
    contact_id: contact?.id ?? null,
    nazwa,
    notification_created: notificationCreated,
  };
}

async function ingestLive(
  body: ErrorIngestBody,
  message: string,
  severity: NotificationSeverity
): Promise<ErrorIngestResult> {
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
  const contactId = body.contact_id ?? ca?.contact_id ?? null;
  let contact: Contact | null = null;
  if (contactId) {
    const { data } = await supabase.from('contacts').select('*').eq('id', contactId).maybeSingle();
    contact = data as Contact | null;
  }

  const { data: err, error } = await supabase
    .from('workflow_errors')
    .insert({
      client_automation_id: ca?.id ?? null,
      contact_id: contact?.id ?? null,
      workflow_id: body.workflow_id ?? null,
      node: body.node ?? null,
      message,
      severity,
      status: 'nowy',
      meta: body.meta ?? {},
    })
    .select('*')
    .single();
  if (error) return { error: `Zapis błędu nie powiódł się: ${error.message}`, status: 500 };

  let nazwa: string | null = contact?.firma ?? contact?.imie ?? null;
  if (ca) {
    const { data: automation } = await supabase
      .from('automations_catalog')
      .select('nazwa')
      .eq('id', ca.automation_id)
      .maybeSingle();
    nazwa = `${automation?.nazwa ?? 'automatyzacja'}${nazwa ? ` (${nazwa})` : ''}`;
    await supabase.from('client_automations').update({ health: 'blad' }).eq('id', ca.id);
  }

  // Powiadomienie (self-healing) — dedupe: nie dubluj przy otwartym alercie tego wdrożenia
  let notificationCreated = false;
  let hasOpen = false;
  if (ca) {
    const { data: open } = await supabase
      .from('notifications')
      .select('id')
      .eq('related_typ', 'client_automation')
      .eq('related_id', ca.id)
      .neq('status', 'rozwiazane')
      .limit(1);
    hasOpen = (open ?? []).length > 0;
  }
  if (!hasOpen) {
    await supabase
      .from('notifications')
      .insert(errorNotification(nazwa ?? 'workflow', message, severity, ca?.id ?? null));
    notificationCreated = true;
  }

  return {
    error_id: (err as WorkflowError).id,
    client_automation_id: ca?.id ?? null,
    contact_id: contact?.id ?? null,
    nazwa,
    notification_created: notificationCreated,
  };
}
