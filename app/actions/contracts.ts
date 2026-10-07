'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { demoStore } from '@/lib/demo-store';
import { emailFrom, sendEmail } from '@/lib/integrations/email';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';
import { Automation, Contact, Contract } from '@/lib/types';

// Klient DB do PUBLICZNEGO odczytu/akceptacji umowy (link z maila, brak sesji):
// service role omija RLS — UUID umowy pełni rolę tokenu dostępu. CEO też przez to
// czyta (ma pełny dostęp). Fallback: zwykły klient sesyjny, gdy brak service role.
async function contractDb() {
  return isAdminConfigured() ? createAdminClient() : await createClient();
}

export async function listContracts(contactId: string): Promise<Contract[]> {
  if (!isSupabaseConfigured()) return demoStore.listContracts(contactId);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('contracts')
    .select('*')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Nie udało się pobrać umów: ${error.message}`);
  return data as Contract[];
}

export async function getContract(
  id: string
): Promise<{ contract: Contract; contact: Contact } | null> {
  if (!isSupabaseConfigured()) {
    const contract = demoStore.getContract(id);
    if (!contract) return null;
    const contact = demoStore.getContact(contract.contact_id);
    if (!contact) return null;
    return { contract, contact };
  }

  const supabase = await contractDb();
  const { data: contract } = await supabase.from('contracts').select('*').eq('id', id).maybeSingle();
  if (!contract) return null;
  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', contract.contact_id)
    .maybeSingle();
  if (!contact) return null;
  return { contract: contract as Contract, contact: contact as Contact };
}

// "Generuj umowę" na karcie prospekta — merge kontaktu + wybranych automatyzacji
// (pakietu) do rekordu umowy. Treść renderuje /umowa/[id] z szablonu.
export async function generateContract(
  contactId: string,
  automationIds: string[],
  dataStartu: string
): Promise<Contract> {
  if (automationIds.length === 0) throw new Error('Wybierz co najmniej jedną automatyzację.');

  const configured = isSupabaseConfigured();
  let automations: Automation[];
  if (!configured) {
    automations = automationIds
      .map((id) => demoStore.getAutomation(id))
      .filter((a): a is Automation => a !== null);
  } else {
    const supabase = await createClient();
    const { data } = await supabase.from('automations_catalog').select('*').in('id', automationIds);
    automations = (data ?? []) as Automation[];
  }
  if (automations.length === 0) throw new Error('Nie znaleziono wybranych automatyzacji.');

  const row: Omit<Contract, 'id' | 'created_at'> = {
    contact_id: contactId,
    pakiet_nazwa:
      automations.length === 1
        ? automations[0].nazwa
        : `Pakiet: ${automations.map((a) => a.nazwa).join(' + ')}`,
    cena_wdrozenie: automations.reduce((s, a) => s + a.cena_wdrozenie, 0),
    cena_abonament: automations.reduce((s, a) => s + a.cena_mc, 0),
    lista_automatyzacji: automations.map((a) => `${a.nazwa} (${a.cena_mc} zł/mc)`),
    data_startu: dataStartu,
    status: 'szkic',
    accepted_at: null,
    accepted_ip: null,
  };

  let created: Contract;
  if (!configured) {
    created = demoStore.createContract(row);
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase.from('contracts').insert(row).select().single();
    if (error) throw new Error(`Nie udało się utworzyć umowy: ${error.message}`);
    created = data as Contract;
  }

  revalidatePath('/crm');
  return created;
}

// Wysyłka umowy mailem z kontakt@stronevo.pl (stub e-mail w Fazie 2)
export async function sendContractEmail(contractId: string): Promise<string> {
  const found = await getContract(contractId);
  if (!found) throw new Error('Umowa nie istnieje');
  const { contract, contact } = found;
  if (!contact.email) throw new Error('Kontakt nie ma adresu e-mail.');

  const appUrl = (process.env.APP_URL ?? 'https://crm.stronevo.pl').replace(/\/$/, '');
  const link = `${appUrl}/umowa/${contractId}`;
  const result = await sendEmail({
    to: contact.email,
    subject: `Umowa STRONEVO — ${contract.pakiet_nazwa}`,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1f2937;">
        <h2 style="color:#7B2D3B;margin:0 0 8px;">STRONEVO</h2>
        <p>Dzień dobry${contact.imie ? ` ${contact.imie}` : ''},</p>
        <p>Dziękujemy za zainteresowanie. Poniżej link do umowy na pakiet
        <strong>${contract.pakiet_nazwa}</strong>:</p>
        <ul>
          <li>Wdrożenie: <strong>${contract.cena_wdrozenie} zł netto</strong> (jednorazowo)</li>
          <li>Abonament: <strong>${contract.cena_abonament} zł netto/mc</strong> — pierwszy miesiąc gratis</li>
        </ul>
        <p style="margin:24px 0;">
          <a href="${link}" style="background:#7B2D3B;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:bold;">
            Przeczytaj i zaakceptuj umowę online
          </a>
        </p>
        <p style="font-size:13px;color:#6b7280;">Lub skopiuj link: <a href="${link}">${link}</a><br/>
        Akceptacja jest elektroniczna (przycisk „Akceptuję warunki" — zapis daty i IP). Umowa elastyczna, 30-dniowe wypowiedzenie.</p>
        <p style="margin-top:24px;">Pozdrawiamy,<br/><strong>STRONEVO</strong> — ${emailFrom()} · stronevo.pl</p>
      </div>
    `,
  });

  if (contract.status === 'szkic') {
    if (!isSupabaseConfigured()) {
      demoStore.updateContract(contractId, { status: 'wyslana' });
    } else {
      const supabase = await createClient();
      await supabase.from('contracts').update({ status: 'wyslana' }).eq('id', contractId);
    }
  }

  revalidatePath('/crm');
  revalidatePath(`/umowa/${contractId}`);
  return result.source === 'live'
    ? `Umowa wysłana na ${contact.email}.`
    : `E-mail w trybie mock (SMTP nieskonfigurowany) — umowa oznaczona jako wysłana.`;
}

// E-akceptacja (stub signContract): zapis timestampu + IP akceptującego.
export async function signContract(contractId: string): Promise<Contract> {
  const headerList = await headers();
  const ip =
    headerList.get('x-forwarded-for')?.split(',')[0].trim() ??
    headerList.get('x-real-ip') ??
    'unknown';
  const acceptedAt = new Date().toISOString();

  let updated: Contract | null;
  if (!isSupabaseConfigured()) {
    updated = demoStore.updateContract(contractId, {
      status: 'zaakceptowana',
      accepted_at: acceptedAt,
      accepted_ip: ip,
    });
  } else {
    const supabase = await contractDb();
    const { data, error } = await supabase
      .from('contracts')
      .update({ status: 'zaakceptowana', accepted_at: acceptedAt, accepted_ip: ip })
      .eq('id', contractId)
      .select()
      .single();
    if (error) throw new Error(`Nie udało się zapisać akceptacji: ${error.message}`);
    updated = data as Contract;
  }
  if (!updated) throw new Error('Umowa nie istnieje');

  revalidatePath('/crm');
  revalidatePath(`/umowa/${contractId}`);
  return updated;
}
