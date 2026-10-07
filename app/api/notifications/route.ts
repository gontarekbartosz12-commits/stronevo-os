import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/demo-store';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';
import {
  NOTIFICATION_SEVERITIES,
  NOTIFICATION_TYPES,
  NotificationAction,
  NotificationSeverity,
  NotificationType,
} from '@/lib/types';

// POST /api/notifications — zewnętrzne źródła (monitor VPS, n8n, healthchecks)
// dorzucają powiadomienia. Autoryzacja: Authorization: Bearer <NOTIFY_API_TOKEN>
// (jeśli token ustawiony w ENV; bez ENV endpoint otwarty — tryb dev/demo).
//
// KONTRAKT I/O:
//   Request:  { typ, severity?, tytul, opis?, related_typ?, related_id?, akcje? }
//   Response: 201 { id, source, remediation_task_id?, agent_run_id? }
//
// SELF-HEALING (Faza 4): powiadomienie typ=techniczne automatycznie
// tworzy task kategoria=remediation i uruchamia agenta (jak POST /api/agent/run).
// Powiadomienie dostaje akcje [Wyślij dodatkowych agentów][Eskaluj do Claude]
// [Rozwiąż ręcznie][Zignoruj] i pokazuje live "Agenci pracują (N)".
const SELF_HEALING_ACTIONS: NotificationAction[] = [
  { action: 'send_more_agents', label: 'Wyślij dodatkowych agentów' },
  { action: 'escalate_claude', label: 'Eskaluj do Claude' },
  { action: 'resolve_manual', label: 'Rozwiąż ręcznie' },
  { action: 'ignore', label: 'Zignoruj' },
];

export async function POST(request: NextRequest) {
  const token = process.env.NOTIFY_API_TOKEN;
  if (token) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${token}`) {
      return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 });
    }
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 });
  }

  const typ = body.typ as NotificationType;
  const severity = (body.severity as NotificationSeverity) ?? 'info';
  const tytul = body.tytul as string;

  if (!NOTIFICATION_TYPES.includes(typ)) {
    return NextResponse.json(
      { error: `Pole "typ" musi być jednym z: ${NOTIFICATION_TYPES.join(', ')}` },
      { status: 400 }
    );
  }
  if (!NOTIFICATION_SEVERITIES.includes(severity)) {
    return NextResponse.json(
      { error: `Pole "severity" musi być jednym z: ${NOTIFICATION_SEVERITIES.join(', ')}` },
      { status: 400 }
    );
  }
  if (typeof tytul !== 'string' || tytul.trim() === '') {
    return NextResponse.json({ error: 'Pole "tytul" jest wymagane' }, { status: 400 });
  }

  const selfHealing = typ === 'techniczne';

  const row = {
    typ,
    severity,
    tytul: tytul.trim(),
    opis: typeof body.opis === 'string' ? body.opis : null,
    related_typ: typeof body.related_typ === 'string' ? body.related_typ : null,
    related_id: typeof body.related_id === 'string' ? body.related_id : null,
    remediation_task_id: null as string | null,
    status: 'nowe' as const,
    akcje: selfHealing
      ? SELF_HEALING_ACTIONS
      : Array.isArray(body.akcje)
        ? (body.akcje as NotificationAction[])
        : [],
  };

  const remediationTaskRow = {
    contact_id: null,
    typ: `Naprawa: ${tytul.trim()}`,
    kategoria: 'remediation' as const,
    wykonawca: 'agent' as const,
    status: 'w_budowie' as const,
    diff: null,
    review_status: null,
  };

  // ===== tryb demo =====
  if (!isSupabaseConfigured()) {
    let remediationTaskId: string | null = null;
    let agentRunId: string | null = null;

    if (selfHealing) {
      const task = demoStore.createTask(remediationTaskRow);
      remediationTaskId = task.id;
      const run = demoStore.createAgentRun({
        task_id: task.id,
        agent: 'hermes-fixer',
        status: 'running',
        log: [
          `${new Date().toLocaleTimeString('pl-PL')} Start (self-healing): "${tytul.trim()}"`,
          `${new Date().toLocaleTimeString('pl-PL')} Diagnoza: pobieranie logów i statusu workflow`,
        ],
        output: null,
        wynik_review: null,
        koszt: 0,
        finished_at: null,
      });
      agentRunId = run.id;
      row.remediation_task_id = remediationTaskId;
    }

    const created = demoStore.createNotification(row);
    return NextResponse.json(
      {
        id: created.id,
        source: 'demo',
        ...(remediationTaskId && { remediation_task_id: remediationTaskId }),
        ...(agentRunId && { agent_run_id: agentRunId }),
      },
      { status: 201 }
    );
  }

  // ===== tryb Supabase (service role — endpoint wołany bez sesji) =====
  if (!isAdminConfigured()) {
    return NextResponse.json(
      { error: 'Brak SUPABASE_SERVICE_ROLE_KEY — endpoint nieaktywny' },
      { status: 503 }
    );
  }
  const admin = createAdminClient();

  let remediationTaskId: string | null = null;
  let agentRunId: string | null = null;

  if (selfHealing) {
    const { data: task, error: taskErr } = await admin
      .from('tasks')
      .insert(remediationTaskRow)
      .select('id')
      .single();
    if (taskErr) return NextResponse.json({ error: taskErr.message }, { status: 500 });
    remediationTaskId = task.id;
    row.remediation_task_id = remediationTaskId;

    const { data: run } = await admin
      .from('agent_runs')
      .insert({
        task_id: task.id,
        agent: 'hermes-fixer',
        status: 'running',
        log: [`Start (self-healing): "${tytul.trim()}"`, 'Diagnoza: pobieranie logów'],
        output: null,
        wynik_review: null,
        koszt: 0,
        finished_at: null,
      })
      .select('id')
      .single();
    agentRunId = run?.id ?? null;
  }

  const { data, error } = await admin.from('notifications').insert(row).select('id').single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(
    {
      id: data.id,
      source: 'live',
      ...(remediationTaskId && { remediation_task_id: remediationTaskId }),
      ...(agentRunId && { agent_run_id: agentRunId }),
    },
    { status: 201 }
  );
}
