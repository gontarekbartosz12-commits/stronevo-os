import { IntegrationResult } from '@/lib/types';

// Push na Telegram (powiadomienia krytyczne/biznesowe).
// Stub: bez TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID nic nie wysyła (mock).
export async function sendTelegram(
  message: string
): Promise<IntegrationResult<{ sent: boolean }>> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return { source: 'mock', data: { sent: false } };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
    });
    return { source: 'live', data: { sent: res.ok } };
  } catch {
    return { source: 'mock', data: { sent: false } };
  }
}
