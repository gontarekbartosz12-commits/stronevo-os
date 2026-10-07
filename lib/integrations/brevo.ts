import { IntegrationResult } from '@/lib/types';
import { emailFrom, sendEmail } from './email';

// Brevo (Sendinblue) — wysyłka kampanii e-mail (Faza 3 zaufania).
// ENV: BREVO_API_KEY (+ opcjonalnie BREVO_SENDER_NAME).
// Fallback 1: istniejący kanał EMAIL_WEBHOOK_URL (n8n → SMTP LH).
// Fallback 2: honest-mock (nie twierdzimy, że wysłano).

export async function sendMarketingEmail(payload: {
  to: string;
  toName?: string | null;
  subject: string;
  html: string;
}): Promise<IntegrationResult<{ sent: boolean; via: string }>> {
  const apiKey = process.env.BREVO_API_KEY;

  if (apiKey) {
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
        body: JSON.stringify({
          sender: {
            email: emailFrom(),
            name: process.env.BREVO_SENDER_NAME ?? 'STRONEVO',
          },
          to: [{ email: payload.to, name: payload.toName ?? undefined }],
          subject: payload.subject,
          htmlContent: payload.html,
        }),
      });
      return { source: 'live', data: { sent: res.ok, via: 'brevo' } };
    } catch {
      return { source: 'mock', data: { sent: false, via: 'brevo (nieosiągalne)' } };
    }
  }

  // Fallback: kanał e-mail z Fazy 2 (webhook n8n → SMTP) albo honest-mock
  const r = await sendEmail({ to: payload.to, subject: payload.subject, html: payload.html });
  return {
    source: r.source,
    data: { sent: r.data.sent, via: r.source === 'live' ? 'smtp-webhook' : 'mock' },
  };
}
