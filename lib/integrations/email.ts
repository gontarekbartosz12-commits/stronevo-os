import { IntegrationResult } from '@/lib/types';

// Wysyłka e-mail (umowy, loginy, przypomnienia o płatności).
// DARMOWO: routing przez webhook n8n (węzeł Gmail/SMTP klienta = 0 zł), spójnie
// z SMS-em. ENV:
//   EMAIL_WEBHOOK_URL — webhook n8n, który realnie wysyła (POST JSON {to, subject, html, from})
//   EMAIL_WEBHOOK_KEY — opcjonalny klucz (Bearer + x-api-key)
//   EMAIL_FROM — adres nadawcy (default kontakt@stronevo.pl)
// Bez EMAIL_WEBHOOK_URL → honest-mock (NIE twierdzimy, że wysłano).

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(
  payload: EmailPayload
): Promise<IntegrationResult<{ sent: boolean }>> {
  const webhook = process.env.EMAIL_WEBHOOK_URL;

  if (!webhook) {
    console.log(
      `[email:mock] to=${payload.to} subject="${payload.subject}" (brak EMAIL_WEBHOOK_URL)`
    );
    return { source: 'mock', data: { sent: false } };
  }

  const key = process.env.EMAIL_WEBHOOK_KEY;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) {
    headers['Authorization'] = `Bearer ${key}`;
    headers['x-api-key'] = key;
  }

  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...payload, from: emailFrom() }),
    });
    return { source: 'live', data: { sent: res.ok } };
  } catch {
    console.log(`[email:mock] to=${payload.to} (webhook nieosiągalny)`);
    return { source: 'mock', data: { sent: false } };
  }
}

export function emailFrom(): string {
  return process.env.EMAIL_FROM ?? 'kontakt@stronevo.pl';
}
