'use server';

import { revalidatePath } from 'next/cache';
import { demoStore } from '@/lib/demo-store';
import { settleRunningRuns, startAgentRun } from '@/lib/agent-runner';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import { AgentRun, RunReview, Task } from '@/lib/types';

export interface AgentRunWithTask extends AgentRun {
  task: Task | null;
}

async function listRunsRaw(): Promise<AgentRun[]> {
  if (!isSupabaseConfigured()) return demoStore.listAgentRuns();
  const supabase = await createClient();
  const { data } = await supabase
    .from('agent_runs')
    .select('*')
    .order('created_at', { ascending: false });
  return (data ?? []) as AgentRun[];
}

async function listTasksRaw(): Promise<Task[]> {
  if (!isSupabaseConfigured()) return demoStore.listTasks();
  const supabase = await createClient();
  const { data } = await supabase.from('tasks').select('*');
  return (data ?? []) as Task[];
}

// Oś czasu CRM technicznego: runy agentów + powiązane zadania.
// Po drodze lazy-completion (settleRunningRuns) — "pracujące" runy się kończą.
export async function listAgentRuns(): Promise<AgentRunWithTask[]> {
  await settleRunningRuns();
  const [runs, tasks] = await Promise.all([listRunsRaw(), listTasksRaw()]);
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  return runs.map((r) => ({ ...r, task: taskMap.get(r.task_id) ?? null }));
}

export interface AgentStats {
  pracujace: number;
  doReview: number;
  wdrozone: number;
  kosztRazem: number; // zł
}

export async function getAgentStats(): Promise<AgentStats> {
  const runs = await listAgentRuns();
  return {
    pracujace: runs.filter((r) => r.status === 'running').length,
    doReview: runs.filter((r) => r.status === 'done' && r.wynik_review === 'oczekuje').length,
    wdrozone: runs.filter((r) => r.task?.status === 'wdrozone').length,
    kosztRazem: Math.round(runs.reduce((s, r) => s + (r.koszt ?? 0), 0) * 100) / 100,
  };
}

async function patchRun(id: string, patch: Partial<AgentRun>): Promise<AgentRun> {
  let updated: AgentRun | null;
  if (!isSupabaseConfigured()) {
    updated = demoStore.updateAgentRun(id, patch);
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('agent_runs')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`Nie udało się zapisać runa: ${error.message}`);
    updated = data as AgentRun;
  }
  if (!updated) throw new Error('Run nie istnieje');
  revalidatePath('/agenci');
  return updated;
}

async function patchTask(id: string, patch: Partial<Task>): Promise<void> {
  if (!isSupabaseConfigured()) {
    demoStore.updateTask(id, patch);
  } else {
    const supabase = await createClient();
    await supabase.from('tasks').update(patch).eq('id', id);
  }
  revalidatePath('/zadania');
}

// "Zatwierdź → deploy": review OK, task → zatwierdzone. Faktyczny deploy
// wykonuje Claude/playbook na serwerze; w panelu domyka się przyciskiem
// markTaskDeployed (agent nie wdraża sam — human-in-the-loop).
export async function approveRunAndDeploy(runId: string): Promise<string> {
  const run = await patchRun(runId, { wynik_review: 'zaakceptowane' as RunReview });
  await patchTask(run.task_id, { status: 'zatwierdzone', review_status: 'zaakceptowane' });
  revalidatePath('/powiadomienia');
  return 'Run zatwierdzony — zadanie w statusie Zatwierdzone, gotowe do deployu.';
}

export async function rejectRun(runId: string): Promise<string> {
  const run = await patchRun(runId, { wynik_review: 'odrzucone' as RunReview });
  await patchTask(run.task_id, { status: 'w_budowie', review_status: 'odrzucone' });
  return 'Run odrzucony — zadanie wróciło do budowy.';
}

// "Wyślij do Claude do weryfikacji" — eskalacja: run oznaczony, powiadomienie
// dla kolejki Claude (review kodu przed deployem robi Claude przy serwerze).
export async function escalateRunToClaude(runId: string): Promise<string> {
  const run = await patchRun(runId, { wynik_review: 'eskalowane_claude' as RunReview });

  const notif = {
    typ: 'agent' as const,
    severity: 'warn' as const,
    tytul: `Do weryfikacji przez Claude: run ${run.id} (${run.agent})`,
    opis: 'Output agenta eskalowany do code-review przez Claude przed deployem.',
    related_typ: 'agent_run',
    related_id: run.id,
    remediation_task_id: null,
    status: 'nowe' as const,
    akcje: [{ action: 'approve_deploy', label: 'Zatwierdź → deploy' }],
  };
  if (!isSupabaseConfigured()) {
    demoStore.createNotification(notif);
  } else {
    const supabase = await createClient();
    await supabase.from('notifications').insert(notif);
  }
  revalidatePath('/powiadomienia');
  return 'Run eskalowany do weryfikacji przez Claude.';
}

// Domknięcie cyklu po faktycznym deployu na serwerze
export async function markTaskDeployed(taskId: string): Promise<string> {
  await patchTask(taskId, { status: 'wdrozone' });
  revalidatePath('/agenci');
  return 'Zadanie oznaczone jako wdrożone.';
}

// Ręczne dorzucenie agenta do zadania (także akcja "Wyślij dodatkowych agentów")
export async function dispatchAgent(taskId: string, agent = 'hermes-builder'): Promise<string> {
  await startAgentRun(taskId, agent);
  revalidatePath('/agenci');
  revalidatePath('/zadania');
  revalidatePath('/powiadomienia');
  return `Agent ${agent} uruchomiony dla zadania.`;
}
