import { sendSms } from '@/lib/integrations/sms';
import { sendTelegram } from '@/lib/integrations/telegram';

// Alert operacyjny do CEO (awaria workflowa, padnięty endpoint).
// Kanały: Telegram (TELEGRAM_BOT_TOKEN/CHAT_ID) + opcjonalnie SMS na numer
// operatora (ALERT_SMS_TO — darmowa brama / Zadarma wg sms.ts). Bez ENV = mock,
// nigdy nie blokuje ingestu (fire-and-forget z catch).

export interface OpsAlertResult {
  telegram: boolean;
  sms: boolean;
}

export async function sendOpsAlert(message: string): Promise<OpsAlertResult> {
  const result: OpsAlertResult = { telegram: false, sms: false };

  try {
    const tg = await sendTelegram(`🔴 <b>STRONEVO OS</b>\n${message}`);
    result.telegram = tg.source === 'live' && tg.data.sent;
  } catch {
    // alert nie może wywrócić ingestu
  }

  const smsTo = process.env.ALERT_SMS_TO;
  if (smsTo) {
    try {
      const sms = await sendSms(smsTo, `STRONEVO OS: ${message.slice(0, 140)}`);
      result.sms = sms.source === 'live' && sms.data.sent;
    } catch {
      // j.w.
    }
  }

  return result;
}
