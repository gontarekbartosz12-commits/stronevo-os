import { createHash } from 'crypto';
import { Contact, IntegrationResult } from '@/lib/types';

// Meta Custom Audiences (remarketing) — stub z ENV META_TOKEN
// (+ META_AD_ACCOUNT_ID). Bez kluczy: mock, nic nie wychodzi na zewnątrz.
// Live: Graph API wymaga danych hashowanych SHA-256 (email/telefon).

function isConfigured(): boolean {
  return Boolean(process.env.META_TOKEN && process.env.META_AD_ACCOUNT_ID);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizePhone(phone: string): string {
  // Meta wymaga cyfr z kodem kraju, bez spacji/plusów
  return phone.replace(/\D/g, '');
}

export interface AudiencePushResult {
  audienceName: string;
  wyslanych: number;
  pominietych: number; // kontakty bez e-maila i telefonu
}

export async function sendCustomAudience(
  audienceName: string,
  contacts: Contact[]
): Promise<IntegrationResult<AudiencePushResult>> {
  // Schema Graph API: [EMAIL, PHONE] — rekordy hashowane SHA-256
  const rows = contacts
    .map((c) => {
      const email = c.email ? sha256(c.email.trim().toLowerCase()) : null;
      const phone = c.telefon ? sha256(normalizePhone(c.telefon)) : null;
      if (!email && !phone) return null;
      return [email ?? '', phone ?? ''];
    })
    .filter((r): r is string[] => r !== null);

  const result: AudiencePushResult = {
    audienceName,
    wyslanych: rows.length,
    pominietych: contacts.length - rows.length,
  };

  if (!isConfigured()) {
    return { source: 'mock', data: result };
  }

  try {
    const accountId = process.env.META_AD_ACCOUNT_ID;
    const token = process.env.META_TOKEN;

    // 1. Utwórz (lub użyj istniejącej) audiencji
    const createRes = await fetch(
      `https://graph.facebook.com/v21.0/act_${accountId}/customaudiences`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: audienceName,
          subtype: 'CUSTOM',
          customer_file_source: 'USER_PROVIDED_ONLY',
          access_token: token,
        }),
      }
    );
    if (!createRes.ok) throw new Error(`Meta API: HTTP ${createRes.status}`);
    const audience = await createRes.json();

    // 2. Wgraj użytkowników (hashowane rekordy)
    const usersRes = await fetch(
      `https://graph.facebook.com/v21.0/${audience.id}/users`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload: { schema: ['EMAIL', 'PHONE'], data: rows },
          access_token: token,
        }),
      }
    );
    if (!usersRes.ok) throw new Error(`Meta API users: HTTP ${usersRes.status}`);

    return { source: 'live', data: result };
  } catch {
    return { source: 'mock', data: result };
  }
}
