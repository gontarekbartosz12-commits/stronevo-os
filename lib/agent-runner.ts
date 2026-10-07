import { demoStore } from './demo-store';
import { callLLM } from './llm/provider';
import {
  cloneN8nWorkflow,
  createN8nWorkflow,
  getN8nWorkflows,
  resolveGoldenTemplate,
  tagWorkflowForClient,
} from './integrations/n8n';
import { isSupabaseConfigured } from './supabase/config';
import { createClient } from './supabase/server';
import { AgentRun, AppNotification, Automation, ClientAutomation, Task } from './types';

// Runner agentów — CONTROL PLANE (mock). Realne uruchamianie agentów
// (Hermes na VPS) podłącza się przez POST /api/agent/run; ten moduł
// zarządza cyklem życia runa: start → log kroków → output → review.
// Agent NIGDY nie wdraża sam — deploy wymaga zatwierdzenia CEO/Claude.

const MOCK_RUN_DURATION_MS = 45_000; // symulowany czas pracy agenta

// Level 2 — agent-builder: model do customizacji/fallbacku (gdy brak golden-template).
// Claude Sonnet = złoty standard do kodu/JSON 2026 (research last30days + n8n community).
const BUILDER_MODEL = process.env.LLM_BUILDER_MODEL ?? 'anthropic/claude-sonnet-4';

// Wyciąga obiekt JSON z odpowiedzi LLM (zdejmuje ewentualne ```json fences).
function extractJsonObject(
  text: string
): { name?: string; nodes?: unknown[]; connections?: Record<string, unknown> } | null {
  let t = (text || '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

interface BuildResult {
  output: string;
  mode: 'clone' | 'generate' | 'plan';
  detail: string; // do logu (nazwa szablonu lub model)
  workflowId?: string; // ID utworzonego workflowa n8n (do twardego linku)
  clientAutomationId?: string; // która automatyzacja klienta go dostała
}

interface BuildContext {
  caId: string | null; // client_automations.id (do zapisania n8n_workflow_id)
  automation: Automation | null;
  klient: string; // nazwa klienta z bazy (firma ?? imię) — do nazwy + tagu
}

// Kontekst builda z zadania: ostatnia automatyzacja kontaktu w budowie
// (provisioning) + jej id + NAZWA KLIENTA z bazy (nie parsowana z opisu).
async function deriveBuildContext(task: Task): Promise<BuildContext> {
  const empty: BuildContext = { caId: null, automation: null, klient: 'klient' };
  if (!task.contact_id) return empty;

  if (!isSupabaseConfigured()) {
    // Najświeższa automatyzacja kontaktu NIEZALEŻNIE od statusu — build musi się
    // przypisać do klienta nawet jeśli CEO już zdążył ją aktywować przed buildem
    // (inaczej klient/tag/hard-link lecą na fallback „klient").
    const ca = demoStore
      .listClientAutomations(task.contact_id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const contact = demoStore.getContact(task.contact_id);
    return {
      caId: ca?.id ?? null,
      automation: ca ? demoStore.getAutomation(ca.automation_id) : null,
      klient: contact?.firma ?? contact?.imie ?? 'klient',
    };
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from('client_automations')
    .select('id, automation:automations_catalog(*), contact:contacts(firma, imie)')
    .eq('contact_id', task.contact_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as {
    id?: string;
    automation?: Automation;
    contact?: { firma?: string | null; imie?: string };
  } | null;
  return {
    caId: row?.id ?? null,
    automation: (row?.automation as Automation) ?? null,
    klient: row?.contact?.firma ?? row?.contact?.imie ?? 'klient',
  };
}

// Zapis twardego linku: która automatyzacja klienta → który workflow w n8n.
async function linkWorkflowToClientAutomation(caId: string, workflowId: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    demoStore.updateClientAutomation(caId, { n8n_workflow_id: workflowId });
    return;
  }
  const supabase = await createClient();
  await supabase.from('client_automations').update({ n8n_workflow_id: workflowId }).eq('id', caId);
}

// Level 2 — realne budowanie workflow n8n dla klienta, jako NIEAKTYWNY draft.
// STRATEGIA (spec §9): NAJPIERW klon DZIAŁAJĄCEGO golden-template po typie usługi
// (workflow faktycznie działa), a dopiero gdy brak szablonu — fallback generowania
// przez LLM (Claude Sonnet). Agent NIGDY nie aktywuje — bramka review CEO/Claude.
// Przypisanie do klienta: nazwa `[AGENT DRAFT] {usługa} — {klient}` + tag `klient:{klient}`
// w n8n + twardy link `client_automations.n8n_workflow_id` (persist w settleRunningRuns).
async function buildWorkflowDraft(task: Task): Promise<BuildResult> {
  const { caId, automation, klient } = await deriveBuildContext(task);

  // --- ŚCIEŻKA 1: klon golden-template (preferowana) ---
  if (automation) {
    const tpl = await resolveGoldenTemplate(automation.typ);
    if (tpl) {
      const name = `[AGENT DRAFT] ${automation.nazwa} — ${klient}`.slice(0, 120);
      // Idempotencja: jeśli draft o tej nazwie już istnieje (np. settle ruszył 2×),
      // NIE klonuj drugi raz — użyj istniejącego, żeby nie robić duplikatów w n8n.
      const existing = (await getN8nWorkflows()).data.find((w) => w.nazwa === name);
      const cloned = existing
        ? {
            ok: true as const,
            id: existing.id,
            url: `${(process.env.N8N_BASE_URL ?? '').replace(/\/$/, '')}/workflow/${existing.id}`,
            nodeCount: 0,
          }
        : await cloneN8nWorkflow(tpl.id, name);
      if (cloned.ok && cloned.id) {
        const tag = await tagWorkflowForClient(cloned.id, klient);
        return {
          mode: 'clone',
          detail: tpl.name,
          workflowId: cloned.id,
          clientAutomationId: caId ?? undefined,
          output: JSON.stringify(
            {
              typ: 'workflow-n8n-klon',
              status: 'sklonowano_golden_template_do_review',
              workflow_id: cloned.id,
              n8n_url: cloned.url,
              golden_template: tpl.name,
              usluga: automation.nazwa,
              klient,
              tag_klienta: tag.ok ? `klient:${klient}` : `(tag nieustawiony: ${tag.error})`,
              powiazano_w_crm: caId ? 'tak (n8n_workflow_id zapisany)' : 'brak client_automation',
              liczba_wezlow: cloned.nodeCount,
              uwaga:
                'Sklonowano DZIAŁAJĄCY szablon jako nieaktywny draft. Uzupełnij dane klienta ' +
                '(klucze/kalendarz/baza wiedzy) i aktywuj po review — agent nie wdraża sam.',
            },
            null,
            2
          ),
        };
      }
    }
  }

  // --- ŚCIEŻKA 2: fallback — generowanie przez LLM (brak pasującego szablonu) ---
  const sys =
    'Jesteś architektem automatyzacji n8n. Zwróć WYŁĄCZNIE poprawny JSON workflow n8n ' +
    '(bez markdown, bez komentarzy) o kształcie: {"name": string, "nodes": [...], "connections": {...}}. ' +
    'Używaj AKTUALNYCH wersji węzłów (webhook typeVersion 2, set 3.4, httpRequest 4.2, if 2). ' +
    'Zawrzyj węzeł wyzwalacza oraz sensowne węzły akcji. Każdy węzeł MUSI mieć pola: ' +
    'parameters (obiekt), type (string), typeVersion (number), position ([x,y]), name (string).';
  const prompt =
    `Zadanie (STRONEVO, automatyzacja dla klienta): "${task.typ}".\n` +
    `${task.diff ? 'Kontekst: ' + task.diff + '\n' : ''}` +
    'Wygeneruj kompletny workflow n8n gotowy do importu jako czysty JSON.';

  const resp = await callLLM({ system: sys, prompt, maxTokens: 3500, model: BUILDER_MODEL });
  const wf = extractJsonObject(resp.text);

  if (!wf || !Array.isArray(wf.nodes) || wf.nodes.length === 0) {
    return {
      mode: 'plan',
      detail: resp.model,
      output: JSON.stringify(
        {
          typ: 'workflow-draft',
          status: 'plan_tekstowy_do_recznej_budowy',
          model: resp.model,
          uwaga: 'Brak golden-template i model nie zwrócił poprawnego JSON — użyj planu ręcznie.',
          plan: (resp.text || '').slice(0, 1800),
        },
        null,
        2
      ),
    };
  }

  const name = `[AGENT DRAFT] ${automation?.nazwa ?? wf.name ?? task.typ} — ${klient}`.slice(0, 120);
  const created = await createN8nWorkflow(name, wf.nodes, wf.connections ?? {});

  if (created.ok && created.id) {
    const tag = await tagWorkflowForClient(created.id, klient);
    return {
      mode: 'generate',
      detail: resp.model,
      workflowId: created.id,
      clientAutomationId: caId ?? undefined,
      output: JSON.stringify(
        {
          typ: 'workflow-n8n-generowany',
          status: 'utworzono_draft_do_review',
          workflow_id: created.id,
          n8n_url: created.url,
          nazwa: name,
          klient,
          tag_klienta: tag.ok ? `klient:${klient}` : `(tag nieustawiony: ${tag.error})`,
          powiazano_w_crm: caId ? 'tak (n8n_workflow_id zapisany)' : 'brak client_automation',
          liczba_wezlow: wf.nodes.length,
          model: resp.model,
          uwaga:
            'Brak pasującego golden-template — workflow WYGENEROWANY (do dokładnej weryfikacji ' +
            'węzłów/credentiali). Aktywuj dopiero po review — agent nie wdraża sam.',
        },
        null,
        2
      ),
    };
  }

  return {
    mode: 'generate',
    detail: resp.model,
    output: JSON.stringify(
      {
        typ: 'workflow-json',
        status: 'wygenerowano_ale_n8n_odrzucil',
        blad_n8n: created.error,
        nazwa: name,
        liczba_wezlow: wf.nodes.length,
        model: resp.model,
        json_podglad: JSON.stringify(wf).slice(0, 1200),
      },
      null,
      2
    ),
  };
}

// ===== dostęp do danych (demo/supabase) =====

async function dbGetTask(taskId: string): Promise<Task | null> {
  if (!isSupabaseConfigured()) {
    return demoStore.listTasks().find((t) => t.id === taskId) ?? null;
  }
  const supabase = await createClient();
  const { data } = await supabase.from('tasks').select('*').eq('id', taskId).maybeSingle();
  return data as Task | null;
}

async function dbPatchTask(taskId: string, patch: Partial<Task>): Promise<void> {
  if (!isSupabaseConfigured()) {
    demoStore.updateTask(taskId, patch);
    return;
  }
  const supabase = await createClient();
  await supabase.from('tasks').update(patch).eq('id', taskId);
}

async function dbCreateRun(row: Omit<AgentRun, 'id' | 'created_at'>): Promise<AgentRun> {
  if (!isSupabaseConfigured()) return demoStore.createAgentRun(row);
  const supabase = await createClient();
  const { data, error } = await supabase.from('agent_runs').insert(row).select().single();
  if (error) throw new Error(`Nie udało się utworzyć runa: ${error.message}`);
  return data as AgentRun;
}

async function dbPatchRun(id: string, patch: Partial<AgentRun>): Promise<AgentRun | null> {
  if (!isSupabaseConfigured()) return demoStore.updateAgentRun(id, patch);
  const supabase = await createClient();
  const { data } = await supabase.from('agent_runs').update(patch).eq('id', id).select().single();
  return data as AgentRun | null;
}

async function dbListRuns(taskId?: string): Promise<AgentRun[]> {
  if (!isSupabaseConfigured()) return demoStore.listAgentRuns(taskId);
  const supabase = await createClient();
  let q = supabase.from('agent_runs').select('*').order('created_at', { ascending: false });
  if (taskId) q = q.eq('task_id', taskId);
  const { data } = await q;
  return (data ?? []) as AgentRun[];
}

async function dbCreateNotification(
  row: Omit<AppNotification, 'id' | 'created_at'>
): Promise<void> {
  if (!isSupabaseConfigured()) {
    demoStore.createNotification(row);
    return;
  }
  const supabase = await createClient();
  await supabase.from('notifications').insert(row);
}

// ===== API runnera =====

// Uruchomienie agenta dla zadania. Mock: run startuje jako 'running' z logiem
// początkowym; kończy się przy kolejnym odczycie po upływie symulowanego
// czasu (lazy completion — bez cronów, daje realny efekt "agenci pracują").
export async function startAgentRun(taskId: string, agent = 'hermes-builder'): Promise<AgentRun> {
  const task = await dbGetTask(taskId);
  if (!task) throw new Error(`Zadanie ${taskId} nie istnieje.`);

  const run = await dbCreateRun({
    task_id: taskId,
    agent,
    status: 'running',
    log: [
      `${new Date().toLocaleTimeString('pl-PL')} Start: przyjęto zadanie "${task.typ}"`,
      `${new Date().toLocaleTimeString('pl-PL')} Analiza kontekstu + dobór golden-template`,
    ],
    output: null,
    wynik_review: null,
    koszt: 0,
    finished_at: null,
  });

  await dbPatchTask(taskId, { status: 'w_budowie', wykonawca: 'agent' });
  return run;
}

// Lazy completion: dokańcza runy 'running' starsze niż MOCK_RUN_DURATION_MS.
// Wywoływane przy każdym odczycie runów/powiadomień. Zwraca dokończone runy.
export async function settleRunningRuns(): Promise<AgentRun[]> {
  const runs = await dbListRuns();
  const settled: AgentRun[] = [];
  const now = Date.now();

  for (const run of runs) {
    if (run.status !== 'running') continue;
    if (now - new Date(run.created_at).getTime() < MOCK_RUN_DURATION_MS) continue;

    const task = await dbGetTask(run.task_id);
    const isRemediation = task?.kategoria === 'remediation';

    // Remediation → podsumowanie LLM. Build → REALNE Level 2: agent KLONUJE
    // golden-template (albo generuje fallbackiem) i tworzy nieaktywny draft do review.
    let output: string;
    let summaryText = '';
    let execLabel: string;
    if (isRemediation) {
      const summary = await callLLM({
        system: 'Jesteś agentem-technikiem STRONEVO. Streszczasz wykonaną naprawę po polsku, 1-2 zdania.',
        prompt: `Zadanie: ${task?.typ ?? run.task_id}. Napisz krótkie podsumowanie naprawy.`,
        maxTokens: 200,
      });
      summaryText = summary.text;
      output = `{\n  "akcja": "restart + poprawka konfiguracji",\n  "zadanie": "${task?.typ ?? ''}",\n  "testy": "3/3 OK",\n  "podsumowanie": "${summaryText.replaceAll('"', "'").slice(0, 200)}"\n}`;
      execLabel = 'naprawa + testy (3/3)';
    } else if (task) {
      const built = await buildWorkflowDraft(task);
      output = built.output;
      // Twardy link: zapisz który workflow n8n należy do której automatyzacji klienta.
      if (built.workflowId && built.clientAutomationId) {
        await linkWorkflowToClientAutomation(built.clientAutomationId, built.workflowId);
      }
      execLabel =
        built.mode === 'clone'
          ? `klon golden-template „${built.detail}" → nieaktywny draft n8n (klient powiązany)`
          : built.mode === 'generate'
            ? `generowanie workflow n8n (${built.detail}) → draft (klient powiązany)`
            : `plan tekstowy (${built.detail}) — brak pasującego szablonu`;
    } else {
      output = `{ "typ": "workflow-json", "status": "brak_zadania" }`;
      execLabel = 'brak zadania';
    }

    const doneLog = [
      ...run.log,
      `${new Date().toLocaleTimeString('pl-PL')} Wykonanie: ${execLabel}`,
      `${new Date().toLocaleTimeString('pl-PL')} Koniec: output gotowy do review`,
    ];

    const updated = await dbPatchRun(run.id, {
      status: 'done',
      log: doneLog,
      output,
      wynik_review: 'oczekuje',
      koszt: Math.round((2 + (run.id.length % 5)) * 100) / 100,
      finished_at: new Date().toISOString(),
    });
    if (!updated) continue;
    settled.push(updated);

    if (isRemediation) {
      // Self-healing domknięte: task naprawczy gotowy, powiadomienie rozwiązane
      await dbPatchTask(run.task_id, {
        status: 'gotowe',
        review_status: 'zaakceptowane',
        diff: output,
      });
      await resolveRemediationNotification(run.task_id, summaryText);
    } else {
      // Build: do review CEO/Claude + powiadomienie typu agent
      await dbPatchTask(run.task_id, { status: 'do_zatwierdzenia', review_status: 'oczekuje' });
      await dbCreateNotification({
        typ: 'agent',
        severity: 'info',
        tytul: `Agent zbudował: ${task?.typ ?? run.task_id} — do review`,
        opis: `${run.agent} zakończył pracę. Output czeka na weryfikację — agent nie wdraża samodzielnie.`,
        related_typ: 'agent_run',
        related_id: run.id,
        remediation_task_id: null,
        status: 'nowe',
        akcje: [{ action: 'approve_deploy', label: 'Zatwierdź → deploy' }],
      });
    }
  }

  return settled;
}

// Po naprawie: powiadomienie techniczne → rozwiązane + podsumowanie co zrobiono
async function resolveRemediationNotification(taskId: string, summary: string): Promise<void> {
  const suffix = ` ✅ Naprawione przez agenta: ${summary.slice(0, 180)}`;
  if (!isSupabaseConfigured()) {
    const n = demoStore.listNotifications().find((x) => x.remediation_task_id === taskId);
    if (n) {
      demoStore.updateNotification(n.id, {
        status: 'rozwiazane',
        opis: `${n.opis ?? ''}${suffix}`,
      });
    }
    return;
  }
  const supabase = await createClient();
  const { data: n } = await supabase
    .from('notifications')
    .select('*')
    .eq('remediation_task_id', taskId)
    .maybeSingle();
  if (n) {
    await supabase
      .from('notifications')
      .update({ status: 'rozwiazane', opis: `${n.opis ?? ''}${suffix}` })
      .eq('id', n.id);
  }
}

// Liczba pracujących agentów dla powiadomienia (badge "Agenci pracują (N)")
export async function countRunningAgents(taskId: string): Promise<number> {
  const runs = await dbListRuns(taskId);
  return runs.filter((r) => r.status === 'running').length;
}
