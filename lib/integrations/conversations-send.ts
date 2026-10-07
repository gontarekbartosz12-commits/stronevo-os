import { sendEmail } from './email';
import { sendSms } from './sms';
import { Conversation, DataSource } from '@/lib/types';

// Wysyłka odpowiedzi z inboxa per kanał (Faza 2 zaufania).
//  - sms     → istniejąca darmowa brama / Zadarma (lib/integrations/sms.ts)
//  - email   → istniejący kanał (webhook n8n → Brevo/SMTP LH)
//  - webchat → nic nie wysyłamy: widget odbiera przez polling /api/webchat/poll
//  - whatsapp/fb/ig/gbp → router n8n: CONVERSATIONS_SEND_WEBHOOK_URL
//    (POST {channel, external, body, conversation_id}; n8n mapuje na
//    WhatsApp Cloud API / Messenger / GBP). Bez ENV = honest-mock.

export interface DeliverResult {
  source: DataSource;
  sent: boolean;
  via: string;
}

export async function deliverMessage(
  conversation: Conversation,
  body: string,
  firma: string
): Promise<DeliverResult> {
  const ext = conversation.external ?? {};

  switch (conversation.channel) {
    case 'sms': {
      if (!ext.telefon) return { source: 'mock', sent: false, via: 'sms (brak numeru)' };
      const r = await sendSms(ext.telefon, body);
      return { source: r.source, sent: r.data.sent, via: 'sms' };
    }
    case 'email': {
      if (!ext.email) return { source: 'mock', sent: false, via: 'email (brak adresu)' };
      const r = await sendEmail({
        to: ext.email,
        subject: `Odpowiedź od ${firma}`,
        html: `<div style="font-family:Inter,system-ui,sans-serif;white-space:pre-wrap;">${escapeHtml(body)}</div>`,
      });
      return { source: r.source, sent: r.data.sent, via: 'email' };
    }
    case 'webchat':
      // dostarczenie = widget pobierze wiadomość przy najbliższym pollingu
      return { source: 'live', sent: true, via: 'webchat (polling widgetu)' };
    default: {
      const webhook = process.env.CONVERSATIONS_SEND_WEBHOOK_URL;
      if (!webhook) {
        console.log(
          `[conversations:mock] kanał=${conversation.channel} body="${body.slice(0, 60)}..." (brak CONVERSATIONS_SEND_WEBHOOK_URL)`
        );
        return { source: 'mock', sent: false, via: conversation.channel };
      }
      const key = process.env.CONVERSATIONS_SEND_WEBHOOK_KEY;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (key) {
        headers['Authorization'] = `Bearer ${key}`;
        headers['x-api-key'] = key;
      }
      try {
        const res = await fetch(webhook, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            channel: conversation.channel,
            external: ext,
            body,
            conversation_id: conversation.id,
          }),
        });
        return { source: 'live', sent: res.ok, via: `${conversation.channel} (n8n router)` };
      } catch {
        return { source: 'mock', sent: false, via: `${conversation.channel} (router nieosiągalny)` };
      }
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
