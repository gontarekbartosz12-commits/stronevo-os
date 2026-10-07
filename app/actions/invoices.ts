'use server';

import { revalidatePath } from 'next/cache';
import { activateWaitingAutomations } from '@/app/actions/automations';
import { demoStore } from '@/lib/demo-store';
import { getInvoiceStatus } from '@/lib/integrations/fakturownia';
import { provisionClientAccess } from '@/lib/provisioning';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import { Contact, Invoice, InvoiceStatus } from '@/lib/types';

export async function listInvoices(contactId?: string): Promise<Invoice[]> {
  if (!isSupabaseConfigured()) return demoStore.listInvoices(contactId);

  const supabase = await createClient();
  let query = supabase.from('invoices').select('*').order('created_at', { ascending: false });
  if (contactId) query = query.eq('contact_id', contactId);
  const { data, error } = await query;
  if (error) throw new Error(`Nie udało się pobrać faktur: ${error.message}`);
  return data as Invoice[];
}

async function getInvoice(id: string): Promise<Invoice | null> {
  if (!isSupabaseConfigured()) return demoStore.getInvoice(id);
  const supabase = await createClient();
  const { data } = await supabase.from('invoices').select('*').eq('id', id).maybeSingle();
  return data as Invoice | null;
}

async function getContact(id: string): Promise<Contact | null> {
  if (!isSupabaseConfigured()) return demoStore.getContact(id);
  const supabase = await createClient();
  const { data } = await supabase.from('contacts').select('*').eq('id', id).maybeSingle();
  return data as Contact | null;
}

async function setInvoiceStatus(id: string, status: InvoiceStatus): Promise<Invoice> {
  let updated: Invoice | null;
  if (!isSupabaseConfigured()) {
    updated = demoStore.updateInvoice(id, { status });
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('invoices')
      .update({ status })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`Nie udało się zapisać faktury: ${error.message}`);
    updated = data as Invoice;
  }
  if (!updated) throw new Error('Faktura nie istnieje');
  return updated;
}

// Reguła "dostęp po opłacie": opłacona faktura → automatyczne konto klienta
// (rola klient + hasło tymczasowe + mail + wymuszona zmiana hasła).
// Dodatkowo opłata faktury WDROŻENIOWEJ (jednorazowa) odblokowuje budowę
// automatyzacji czekających na płatność (oczekuje_oplaty → provisioning + zadanie build).
async function onInvoicePaid(invoice: Invoice): Promise<string> {
  const contact = await getContact(invoice.contact_id);
  if (!contact) return 'Faktura opłacona (brak kontaktu — konto nie utworzone).';

  // Odblokuj budowę automatyzacji (tylko opłata wdrożeniowa uruchamia budowę).
  let buildInfo = '';
  if (invoice.cykl === 'jednorazowa') {
    try {
      const { activated } = await activateWaitingAutomations(invoice.contact_id);
      if (activated > 0) {
        buildInfo = ` Ruszyła budowa ${activated} ${
          activated === 1 ? 'automatyzacji' : 'automatyzacji'
        } (utworzono zadania dla agenta).`;
      }
    } catch {
      buildInfo = ' (uwaga: nie udało się automatycznie uruchomić budowy — sprawdź Zadania).';
    }
  }

  if (!contact.email) {
    return `Faktura opłacona. Uzupełnij e-mail kontaktu, aby założyć konto klienta.${buildInfo}`;
  }

  const { created, password } = await provisionClientAccess(contact);
  const accountInfo = created
    ? `Utworzono konto klienta. LOGIN: ${contact.email} · HASŁO TYMCZASOWE: ${password} ` +
      `(zapisz i przekaż klientowi — wymusi zmianę przy 1. logowaniu; mail z loginem też poszedł).`
    : 'Konto klienta już istnieje (dostęp aktywny).';
  return `Faktura opłacona. ${accountInfo}${buildInfo}`;
}

export interface PaymentCheckResult {
  invoice: Invoice;
  message: string;
  source: 'live' | 'mock';
}

// "Sprawdź płatność" — odpytuje Fakturownię; przy statusie oplacona odpala
// automat dostępu. W trybie mock status się nie zmienia (użyj akcji demo).
export async function checkInvoicePayment(invoiceId: string): Promise<PaymentCheckResult> {
  const invoice = await getInvoice(invoiceId);
  if (!invoice) throw new Error('Faktura nie istnieje');
  if (!invoice.fakturownia_id) {
    return { invoice, message: 'Brak ID Fakturowni — nie można sprawdzić.', source: 'mock' };
  }

  const status = await getInvoiceStatus(invoice.fakturownia_id);
  if (status.data === null) {
    return {
      invoice,
      message: 'Fakturownia nieskonfigurowana — status bez zmian (tryb mock).',
      source: status.source,
    };
  }

  if (status.data === invoice.status) {
    return { invoice, message: `Status bez zmian: ${invoice.status}.`, source: status.source };
  }

  const updated = await setInvoiceStatus(invoiceId, status.data);
  let message = `Status zaktualizowany: ${status.data}.`;
  if (status.data === 'oplacona' && invoice.status !== 'oplacona') {
    message = await onInvoicePaid(updated);
  }
  revalidatePath('/crm');
  return { invoice: updated, message, source: status.source };
}

// Akcje demo/ręczne — CEO może oznaczyć płatność ręcznie (przelew na konto),
// co odpala ten sam automat dostępu co ścieżka z Fakturowni.
export async function markInvoicePaid(invoiceId: string): Promise<PaymentCheckResult> {
  const invoice = await getInvoice(invoiceId);
  if (!invoice) throw new Error('Faktura nie istnieje');
  const updated = await setInvoiceStatus(invoiceId, 'oplacona');
  const message = await onInvoicePaid(updated);
  revalidatePath('/crm');
  return { invoice: updated, message, source: 'mock' };
}

export async function markInvoiceOverdue(invoiceId: string): Promise<Invoice> {
  const updated = await setInvoiceStatus(invoiceId, 'zalegla');
  revalidatePath('/crm');
  revalidatePath('/powiadomienia');
  return updated;
}
