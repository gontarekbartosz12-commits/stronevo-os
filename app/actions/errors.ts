'use server';

import { revalidatePath } from 'next/cache';
import { demoStore } from '@/lib/demo-store';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import { WorkflowError, WorkflowErrorStatus } from '@/lib/types';

// Błędy workflowów (Faza 1 zaufania) — odczyt i zarządzanie statusem (CEO).

export async function listWorkflowErrors(): Promise<WorkflowError[]> {
  if (!isSupabaseConfigured()) return demoStore.listWorkflowErrors();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('workflow_errors')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(`Nie udało się pobrać błędów: ${error.message}`);
  return data as WorkflowError[];
}

// Zmiana statusu błędu. Przy 'rozwiazany': zamyka też otwarte powiadomienia
// techniczne tego wdrożenia (o ile nie ma innych otwartych błędów) — zdrowie
// w /wyniki wraca do zielonego przy najbliższym zdarzeniu.
export async function setWorkflowErrorStatus(
  errorId: string,
  status: WorkflowErrorStatus
): Promise<string> {
  const configured = isSupabaseConfigured();

  let err: WorkflowError | null;
  if (!configured) {
    err = demoStore.updateWorkflowError(errorId, { status });
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('workflow_errors')
      .update({ status })
      .eq('id', errorId)
      .select('*')
      .single();
    if (error) throw new Error(`Nie udało się zapisać statusu: ${error.message}`);
    err = data as WorkflowError;
  }
  if (!err) throw new Error('Błąd nie istnieje.');

  if (status === 'rozwiazany' && err.client_automation_id) {
    const caId = err.client_automation_id;

    // Czy zostały inne otwarte błędy tego wdrożenia?
    let otherOpen: number;
    if (!configured) {
      otherOpen = demoStore
        .listWorkflowErrors({ clientAutomationId: caId })
        .filter((e) => e.id !== errorId && e.status !== 'rozwiazany').length;
    } else {
      const supabase = await createClient();
      const { data } = await supabase
        .from('workflow_errors')
        .select('id')
        .eq('client_automation_id', caId)
        .neq('id', errorId)
        .neq('status', 'rozwiazany');
      otherOpen = (data ?? []).length;
    }

    if (otherOpen === 0) {
      if (!configured) {
        demoStore
          .listNotifications()
          .filter(
            (n) =>
              n.related_typ === 'client_automation' &&
              n.related_id === caId &&
              n.status !== 'rozwiazane'
          )
          .forEach((n) => demoStore.updateNotification(n.id, { status: 'rozwiazane' }));
        demoStore.updateClientAutomation(caId, { health: 'ok' });
      } else {
        const supabase = await createClient();
        await supabase
          .from('notifications')
          .update({ status: 'rozwiazane' })
          .eq('related_typ', 'client_automation')
          .eq('related_id', caId)
          .neq('status', 'rozwiazane');
        await supabase.from('client_automations').update({ health: 'ok' }).eq('id', caId);
      }
    }
  }

  revalidatePath('/wyniki');
  revalidatePath('/powiadomienia');
  return status === 'rozwiazany'
    ? 'Błąd oznaczony jako rozwiązany — zdrowie wdrożenia wróci do zielonego.'
    : `Status błędu: ${status}.`;
}
