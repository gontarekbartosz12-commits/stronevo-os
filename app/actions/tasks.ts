'use server';

import { revalidatePath } from 'next/cache';
import { demoStore } from '@/lib/demo-store';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import { Task, TaskStatus } from '@/lib/types';

export async function listTasks(): Promise<Task[]> {
  if (!isSupabaseConfigured()) return demoStore.listTasks();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Nie udało się pobrać zadań: ${error.message}`);
  return data as Task[];
}

async function patchTask(id: string, patch: Partial<Task>): Promise<Task> {
  let updated: Task | null;
  if (!isSupabaseConfigured()) {
    updated = demoStore.updateTask(id, patch);
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('tasks')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`Nie udało się zapisać zadania: ${error.message}`);
    updated = data as Task;
  }
  if (!updated) throw new Error('Zadanie nie istnieje');
  revalidatePath('/zadania');
  return updated;
}

// Pracownik: przesuwanie zadania po kanbanie (do_zrobienia ↔ w_budowie)
export async function moveTask(id: string, status: TaskStatus): Promise<Task> {
  return patchTask(id, { status });
}

// Pracownik: aktualizacja opisu wykonanej pracy (diff do review)
export async function updateTaskDiff(id: string, diff: string): Promise<Task> {
  return patchTask(id, { diff: diff.trim() === '' ? null : diff });
}

// Pracownik: "Wyślij do zatwierdzenia CEO"
export async function submitTaskForReview(id: string): Promise<Task> {
  return patchTask(id, { status: 'do_zatwierdzenia', review_status: 'oczekuje' });
}

// CEO: akceptacja → gotowe; odrzucenie → wraca do budowy
export async function reviewTask(id: string, accepted: boolean): Promise<Task> {
  return patchTask(
    id,
    accepted
      ? { status: 'gotowe', review_status: 'zaakceptowane' }
      : { status: 'w_budowie', review_status: 'odrzucone' }
  );
}

export async function createTask(input: {
  contact_id: string | null;
  typ: string;
  wykonawca: 'agent' | 'human';
  kategoria?: 'standard' | 'build' | 'remediation';
}): Promise<Task> {
  const row: Omit<Task, 'id' | 'created_at'> = {
    contact_id: input.contact_id,
    typ: input.typ,
    wykonawca: input.wykonawca,
    kategoria: input.kategoria ?? 'standard',
    status: 'do_zrobienia',
    diff: null,
    review_status: null,
  };

  let created: Task;
  if (!isSupabaseConfigured()) {
    created = demoStore.createTask(row);
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase.from('tasks').insert(row).select().single();
    if (error) throw new Error(`Nie udało się utworzyć zadania: ${error.message}`);
    created = data as Task;
  }
  revalidatePath('/zadania');
  return created;
}
