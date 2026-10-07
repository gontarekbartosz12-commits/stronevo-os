'use server';

import { revalidatePath } from 'next/cache';
import { demoStore } from '@/lib/demo-store';
import { settleRunningRuns, startAgentRun } from '@/lib/agent-runner';
import { emailFrom, sendEmail } from '@/lib/integrations/email';
import { sendTelegram } from '@/lib/integrations/telegram';
import { deactivateClientAccess } from '@/lib/provisioning';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import {
  AgentRun,
  AppNotification,
  Contact,
  Invoice,
  NotificationStatus,
} from '@/lib/types';

// Powiadomienie wzbogacone o live-status agentów (self-healing, Faza 4)
export interface NotificationView extends AppNotification {
  runningAgents: number;
}

const OVERDUE_ACTIONS = [
  { action: 'disable_access', label: 'Wyłącz dostęp', confirm: true },
  { action: 'send_reminder', label: 'Wyślij przypomnienie' },
  { action: 'extend_7d', label: 'Daj 7 dni' },
];

function overdueDays(): number {
  const n = Number(process.env.INVOICE_OVERDUE_DAYS);
  return Number.isFinite(n) && n > 0 ? n : 7;
}

export async function listNotifications(): Promise<NotificationView[]> {
  // Lazy-completion agentów (self-healing) + detekcja zaległych faktur
  await settleRunningRuns();
  await ensureBusinessNotifications();

  let notifications: AppNotification[];
  let runs: AgentRun[];
  if (!isSupabaseConfigured()) {
    notifications = demoStore.listNotifications();
    runs = demoStore.listAgentRuns();
  } else {
    const supabase = await createClient();
    const [{ data: n, error }, { data: r }] = await Promise.all([
      supabase.from('notifications').select('*').order('created_at', { ascending: false }),
      supabase.from('agent_runs').select('*'),
    ]);
    if (error) throw new Error(`Nie udało się pobrać powiadomień: ${error.message}`);
    notifications = (n ?? []) as AppNotification[];
    runs = (r ?? []) as AgentRun[];
  }

  // Live "Agenci pracują (N)" — po remediation_task_id
  return notifications.map((n) => ({
    ...n,
    runningAgents: n.remediation_task_id
      ? runs.filter((r) => r.task_id === n.remediation_task_id && r.status === 'running').length
      : 0,
  }));
}

// Licznik do dzwonka w topbarze
export async function countNewNotifications(): Promise<number> {
  if (!isSupabaseConfigured()) {
    return demoStore.listNotifications().filter((n) => n.status === 'nowe').length;
  }
  const supabase = await createClient();
  const { count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'nowe');
  return count ?? 0;
}

async function createNotificationRow(
  row: Omit<AppNotification, 'id' | 'created_at'>
): Promise<AppNotification> {
  if (!isSupabaseConfigured()) return demoStore.createNotification(row);

  const supabase = await createClient();
  const { data, error } = await supabase.from('notifications').insert(row).select().single();
  if (error) throw new Error(`Nie udało się utworzyć powiadomienia: ${error.message}`);
  return data as AppNotification;
}

// Powiadomienia BIZNESOWE auto: faktura wystawiona starsza niż X dni → status
// zalegla + powiadomienie z akcjami. Wywoływane lazy przy odczycie powiadomień
// (bez osobnego crona — cron może dodatkowo pingować GET /powiadomienia).
export async function ensureBusinessNotifications(): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - overdueDays());
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  let invoices: Invoice[];
  let contacts: Contact[];
  if (!isSupabaseConfigured()) {
    invoices = demoStore.listInvoices();
    contacts = demoStore.listContacts();
  } else {
    const supabase = await createClient();
    const [{ data: invs }, { data: cons }] = await Promise.all([
      supabase.from('invoices').select('*').in('status', ['wystawiona', 'zalegla']),
      supabase.from('contacts').select('*'),
    ]);
    invoices = (invs ?? []) as Invoice[];
    contacts = (cons ?? []) as Contact[];
  }

  for (const inv of invoices) {
    const isOverdue =
      inv.status === 'zalegla' || (inv.status === 'wystawiona' && inv.data <= cutoffIso);
    if (!isOverdue) continue;

    // auto-przełączenie na zalegla
    if (inv.status !== 'zalegla') {
      if (!isSupabaseConfigured()) {
        demoStore.updateInvoice(inv.id, { status: 'zalegla' });
      } else {
        const supabase = await createClient();
        await supabase.from('invoices').update({ status: 'zalegla' }).eq('id', inv.id);
      }
    }

    // bez duplikatów: jedno otwarte powiadomienie per faktura
    let exists: boolean;
    if (!isSupabaseConfigured()) {
      exists = demoStore.hasOpenNotificationFor('invoice', inv.id);
    } else {
      const supabase = await createClient();
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('related_typ', 'invoice')
        .eq('related_id', inv.id)
        .neq('status', 'rozwiazane');
      exists = (count ?? 0) > 0;
    }
    if (exists) continue;

    const contact = contacts.find((c) => c.id === inv.contact_id);
    const nazwa = contact?.firma ?? contact?.imie ?? 'Nieznany klient';

    const created = await createNotificationRow({
      typ: 'biznes',
      severity: 'krytyczne',
      tytul: `Klient ${nazwa} nie opłacił faktury`,
      opis: `Faktura "${inv.tytul}" (${inv.kwota} zł) z dnia ${inv.data} jest zaległa (>${overdueDays()} dni).`,
      related_typ: 'invoice',
      related_id: inv.id,
      remediation_task_id: null,
      status: 'nowe',
      akcje: OVERDUE_ACTIONS,
    });

    // Opcjonalny push na Telegram (stub bez ENV)
    await sendTelegram(
      `🔴 <b>STRONEVO OS</b>\n${created.tytul}\n${created.opis ?? ''}`
    );
  }
}

export async function setNotificationStatus(
  id: string,
  status: NotificationStatus
): Promise<AppNotification> {
  let updated: AppNotification | null;
  if (!isSupabaseConfigured()) {
    updated = demoStore.updateNotification(id, { status });
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('notifications')
      .update({ status })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`Nie udało się zapisać powiadomienia: ${error.message}`);
    updated = data as AppNotification;
  }
  if (!updated) throw new Error('Powiadomienie nie istnieje');
  revalidatePath('/powiadomienia');
  return updated;
}

async function getNotification(id: string): Promise<AppNotification | null> {
  if (!isSupabaseConfigured()) {
    return demoStore.listNotifications().find((n) => n.id === id) ?? null;
  }
  const supabase = await createClient();
  const { data } = await supabase.from('notifications').select('*').eq('id', id).maybeSingle();
  return data as AppNotification | null;
}

async function getInvoiceWithContact(
  invoiceId: string
): Promise<{ invoice: Invoice; contact: Contact | null } | null> {
  if (!isSupabaseConfigured()) {
    const invoice = demoStore.getInvoice(invoiceId);
    if (!invoice) return null;
    return { invoice, contact: demoStore.getContact(invoice.contact_id) };
  }
  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .maybeSingle();
  if (!invoice) return null;
  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', invoice.contact_id)
    .maybeSingle();
  return { invoice: invoice as Invoice, contact: contact as Contact | null };
}

// Wykonanie akcji z przycisku powiadomienia. "Wyłącz dostęp" wywoływane jest
// z UI dopiero PO potwierdzeniu przez CEO w modalu.
export async function executeNotificationAction(
  notificationId: string,
  action: string
): Promise<string> {
  const notification = await getNotification(notificationId);
  if (!notification) throw new Error('Powiadomienie nie istnieje');

  // ===== akcje Fazy 4: self-healing + review agentów =====
  switch (action) {
    case 'send_more_agents': {
      if (!notification.remediation_task_id) throw new Error('Brak zadania naprawczego.');
      await startAgentRun(notification.remediation_task_id, 'hermes-fixer');
      await setNotificationStatus(notificationId, 'w_toku');
      revalidatePath('/agenci');
      return 'Dodatkowy agent wysłany — pracuje nad naprawą.';
    }
    case 'escalate_claude': {
      const notif = {
        typ: 'agent' as const,
        severity: 'warn' as const,
        tytul: `Eskalacja do Claude: ${notification.tytul}`,
        opis: 'Problem eskalowany do ręcznej weryfikacji przez Claude (code-review / debug na serwerze).',
        related_typ: notification.related_typ,
        related_id: notification.related_id,
        remediation_task_id: notification.remediation_task_id,
        status: 'nowe' as const,
        akcje: [],
      };
      await createNotificationRow(notif);
      await setNotificationStatus(notificationId, 'w_toku');
      return 'Eskalowano do Claude — utworzono zgłoszenie w kolejce agent.';
    }
    case 'resolve_manual': {
      if (notification.remediation_task_id) {
        if (!isSupabaseConfigured()) {
          demoStore.updateTask(notification.remediation_task_id, {
            status: 'gotowe',
            review_status: 'zaakceptowane',
          });
        } else {
          const supabase = await createClient();
          await supabase
            .from('tasks')
            .update({ status: 'gotowe', review_status: 'zaakceptowane' })
            .eq('id', notification.remediation_task_id);
        }
      }
      await setNotificationStatus(notificationId, 'rozwiazane');
      return 'Oznaczono jako rozwiązane ręcznie.';
    }
    case 'ignore': {
      await setNotificationStatus(notificationId, 'rozwiazane');
      return 'Powiadomienie zignorowane.';
    }
    case 'approve_deploy': {
      if (notification.related_typ !== 'agent_run' || !notification.related_id) {
        throw new Error('Brak powiązanego runa agenta.');
      }
      // import cykliczny nie występuje — akcja zaszyta lokalnie
      const { approveRunAndDeploy } = await import('./agents');
      const msg = await approveRunAndDeploy(notification.related_id);
      await setNotificationStatus(notificationId, 'rozwiazane');
      return msg;
    }
  }

  // ===== akcje faktury zaległej (Faza 2) =====
  if (notification.related_typ !== 'invoice' || !notification.related_id) {
    throw new Error('Akcja nieobsługiwana dla tego powiadomienia.');
  }

  const found = await getInvoiceWithContact(notification.related_id);
  if (!found) throw new Error('Powiązana faktura nie istnieje.');
  const { invoice, contact } = found;
  const nazwa = contact?.firma ?? contact?.imie ?? 'klient';

  let message: string;

  switch (action) {
    case 'disable_access': {
      const done = await deactivateClientAccess(invoice.contact_id);
      await setNotificationStatus(notificationId, 'rozwiazane');
      message = done
        ? `Dostęp klienta ${nazwa} został wyłączony.`
        : `Klient ${nazwa} nie ma jeszcze konta — nic do wyłączenia (powiadomienie zamknięte).`;
      break;
    }
    case 'send_reminder': {
      if (contact?.email) {
        await sendEmail({
          to: contact.email,
          subject: `Przypomnienie o płatności — ${invoice.tytul}`,
          html: `
            <p>Dzień dobry,</p>
            <p>Przypominamy o zaległej płatności za fakturę <strong>${invoice.tytul}</strong>
            na kwotę <strong>${invoice.kwota} zł</strong> (data wystawienia: ${invoice.data}).</p>
            <p>Prosimy o uregulowanie należności. W razie pytań — odpisz na tego maila.</p>
            <p>Pozdrawiamy,<br/>STRONEVO — ${emailFrom()}</p>
          `,
        });
      }
      await setNotificationStatus(notificationId, 'w_toku');
      message = contact?.email
        ? `Przypomnienie wysłane do ${nazwa} (${contact.email}).`
        : `Kontakt ${nazwa} nie ma e-maila — przypomnienie nie wyszło (powiadomienie w toku).`;
      break;
    }
    case 'extend_7d': {
      const newDate = new Date(invoice.data);
      newDate.setDate(newDate.getDate() + 7);
      const newIso = newDate.toISOString().slice(0, 10);
      if (!isSupabaseConfigured()) {
        demoStore.updateInvoice(invoice.id, { status: 'wystawiona', data: newIso });
      } else {
        const supabase = await createClient();
        await supabase
          .from('invoices')
          .update({ status: 'wystawiona', data: newIso })
          .eq('id', invoice.id);
      }
      await setNotificationStatus(notificationId, 'rozwiazane');
      message = `Termin przesunięty o 7 dni (do ponownej weryfikacji ${newIso}).`;
      break;
    }
    default:
      throw new Error(`Nieznana akcja: ${action}`);
  }

  revalidatePath('/powiadomienia');
  revalidatePath('/crm');
  return message;
}
