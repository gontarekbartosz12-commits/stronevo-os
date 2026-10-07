import { randomInt } from 'node:crypto';
import { demoStore } from './demo-store';
import { emailFrom, sendEmail } from './integrations/email';
import { isSupabaseConfigured } from './supabase/config';
import { createAdminClient, isAdminConfigured } from './supabase/admin';
import { createClient } from './supabase/server';
import { ClientAccount, Contact } from './types';

// Silny generator hasła tymczasowego (crypto): 16 znaków, gwarantowany
// duża/mała/cyfra/symbol. Wymuszona zmiana przy pierwszym logowaniu.
export function tempPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digit = '23456789';
  const symbol = '!@#$%&*?';
  const all = upper + lower + digit + symbol;
  const pick = (set: string) => set[randomInt(set.length)];
  const chars = [pick(upper), pick(lower), pick(digit), pick(symbol)];
  for (let i = chars.length; i < 16; i++) chars.push(pick(all));
  // Fisher-Yates shuffle (crypto), by symbol nie zawsze był na końcu
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

// Dostęp po opłacie: konto klienta (rola 'klient', przypięte do contact_id)
// + hasło tymczasowe + mail z loginem. Bez opłaconej faktury NIE wywoływać.
// Zwraca `password` dla NOWEGO konta (created:true), żeby CEO ZAWSZE miał
// hasło do przekazania klientowi — nawet jeśli mail nie dojdzie (bramka pewności).
export async function provisionClientAccess(
  contact: Contact
): Promise<{ account: ClientAccount; created: boolean; password: string | null }> {
  if (!contact.email) {
    throw new Error('Kontakt nie ma adresu e-mail — nie można założyć konta klienta.');
  }

  const password = tempPassword();

  if (!isSupabaseConfigured()) {
    const existing = demoStore.getClientAccountByContact(contact.id);
    if (existing) {
      if (!existing.active) demoStore.updateClientAccount(existing.id, { active: true });
      return { account: { ...existing, active: true }, created: false, password: null };
    }
    const account = demoStore.createClientAccount({
      contact_id: contact.id,
      email: contact.email,
      active: true,
      must_change_password: true,
    });
    await sendWelcomeEmail(contact.email, password);
    return { account, created: true, password };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from('client_accounts')
    .select('*')
    .eq('contact_id', contact.id)
    .maybeSingle();

  if (existing) {
    if (!existing.active) {
      await supabase.from('client_accounts').update({ active: true }).eq('id', existing.id);
      if (isAdminConfigured()) {
        const admin = createAdminClient();
        await admin.auth.admin.updateUserById(existing.auth_user_id, { ban_duration: 'none' });
      }
    }
    return { account: { ...existing, active: true } as ClientAccount, created: false, password: null };
  }

  let authUserId: string | null = null;
  if (isAdminConfigured()) {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email: contact.email,
      password,
      email_confirm: true,
      user_metadata: { role: 'klient', contact_id: contact.id, must_change_password: true },
    });
    if (error) throw new Error(`Nie udało się utworzyć konta klienta: ${error.message}`);
    authUserId = data.user?.id ?? null;
  }

  const { data: account, error } = await supabase
    .from('client_accounts')
    .insert({
      contact_id: contact.id,
      email: contact.email,
      auth_user_id: authUserId,
      active: true,
      must_change_password: true,
    })
    .select()
    .single();
  if (error) throw new Error(`Nie udało się zapisać konta klienta: ${error.message}`);

  await sendWelcomeEmail(contact.email, password);
  return { account: account as ClientAccount, created: true, password };
}

// Dezaktywacja dostępu klienta (za potwierdzeniem CEO — modal w UI)
export async function deactivateClientAccess(contactId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    const acc = demoStore.getClientAccountByContact(contactId);
    if (!acc) return false;
    demoStore.updateClientAccount(acc.id, { active: false });
    return true;
  }

  const supabase = await createClient();
  const { data: acc } = await supabase
    .from('client_accounts')
    .select('*')
    .eq('contact_id', contactId)
    .maybeSingle();
  if (!acc) return false;

  await supabase.from('client_accounts').update({ active: false }).eq('id', acc.id);
  if (isAdminConfigured() && acc.auth_user_id) {
    const admin = createAdminClient();
    // Ban = brak możliwości logowania do odwołania
    await admin.auth.admin.updateUserById(acc.auth_user_id, { ban_duration: '876000h' });
  }
  return true;
}

async function sendWelcomeEmail(email: string, password: string) {
  const appUrl = (process.env.APP_URL ?? 'https://crm.stronevo.pl').replace(/\/$/, '');
  await sendEmail({
    to: email,
    subject: 'STRONEVO — dostęp do panelu klienta',
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1f2937;">
        <h2 style="color:#7B2D3B;margin:0 0 8px;">STRONEVO</h2>
        <p>Dzień dobry,</p>
        <p>Twoje konto w panelu klienta STRONEVO jest gotowe.</p>
        <p style="background:#f8f7f4;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;">
          <strong>Login:</strong> ${email}<br/>
          <strong>Hasło tymczasowe:</strong> ${password}
        </p>
        <p style="margin:24px 0;">
          <a href="${appUrl}" style="background:#7B2D3B;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:bold;">
            Zaloguj się do panelu
          </a>
        </p>
        <p style="font-size:13px;color:#6b7280;">Przy pierwszym logowaniu poprosimy o ustawienie własnego hasła.
        W panelu masz: swoje leady i kalendarz, faktury, umowy oraz podgląd automatyzacji.</p>
        <p style="margin-top:24px;">Pozdrawiamy,<br/><strong>STRONEVO</strong> — ${emailFrom()} · stronevo.pl</p>
      </div>
    `,
  });
}
