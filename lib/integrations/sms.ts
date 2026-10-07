import { createHash, createHmac } from 'node:crypto';
import { IntegrationResult } from '@/lib/types';

// Wysyłka SMS (follow-up straconych leadów, przypomnienia, prośby o opinię).
// DECYZJA 2026-07-04: user MA Zadarmę → używamy Zadarma SMS API (nie osobna brama).
// UWAGA: Zadarma SMS jest PŁATNE (~0,16-0,24 zł/SMS wg kierunku), nie darmowe.
// Alternatywa darmowa (Twój telefon jako brama) zostaje jako fallback SMS_GATEWAY_URL.
//
// Priorytet: ZADARMA_KEY+ZADARMA_SECRET → Zadarma; inaczej SMS_GATEWAY_URL → brama; inaczej mock.
// ZADARMA_SENDER (opcjonalnie) = zarejestrowany numer/SenderID nadawcy.

// PHP urlencode (RFC1738) — Zadarma podpisuje http_build_query: spacje jako '+',
// oraz koduje ! ' ( ) * ~ (których encodeURIComponent nie rusza).
function phpUrlencode(s: string): string {
  return encodeURIComponent(s)
    .replace(/%20/g, '+')
    .replace(/[!'()*~]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

async function sendViaZadarma(
  to: string,
  message: string,
  key: string,
  secret: string
): Promise<boolean> {
  const path = '/v1/sms/send/';
  const params: Record<string, string> = { message, number: to };
  const sender = process.env.ZADARMA_SENDER;
  if (sender) params.caller_id = sender;

  // ksort + http_build_query
  const paramsStr = Object.keys(params)
    .sort()
    .map((k) => `${phpUrlencode(k)}=${phpUrlencode(params[k])}`)
    .join('&');

  const md5 = createHash('md5').update(paramsStr).digest('hex');
  const hmacHex = createHmac('sha1', secret).update(path + paramsStr + md5).digest('hex');
  const sign = Buffer.from(hmacHex).toString('base64');

  const res = await fetch(`https://api.zadarma.com${path}`, {
    method: 'POST',
    headers: {
      Authorization: `${key}:${sign}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: paramsStr,
  });
  if (!res.ok) return false;
  try {
    const j = (await res.json()) as { status?: string };
    return j?.status === 'success';
  } catch {
    return true; // 2xx bez JSON — traktuj jako wysłane
  }
}

export async function sendSms(
  to: string,
  message: string
): Promise<IntegrationResult<{ sent: boolean }>> {
  const phone = to.replace(/[^\d+]/g, '');
  const zKey = process.env.ZADARMA_KEY;
  const zSecret = process.env.ZADARMA_SECRET;

  // 1) Zadarma (numer w formacie międzynarodowym, bez znaków innych niż cyfry/+)
  if (zKey && zSecret) {
    try {
      const sent = await sendViaZadarma(phone.replace(/^\+/, ''), message, zKey, zSecret);
      return { source: 'live', data: { sent } };
    } catch {
      return { source: 'mock', data: { sent: false } };
    }
  }

  // 2) Darmowa brama (TextBee/SMSGate/webhook n8n) — jeśli ktoś woli 0 zł/SMS
  const url = process.env.SMS_GATEWAY_URL;
  if (url) {
    const key = process.env.SMS_GATEWAY_KEY;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (key) {
      headers['Authorization'] = `Bearer ${key}`;
      headers['x-api-key'] = key;
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          to: phone,
          recipients: [phone],
          phoneNumbers: [phone],
          message,
          text: message,
        }),
      });
      return { source: 'live', data: { sent: res.ok } };
    } catch {
      return { source: 'mock', data: { sent: false } };
    }
  }

  // 3) Mock
  console.log(
    `[sms:mock] to=${phone} msg="${message.slice(0, 60)}..." (brak ZADARMA_KEY/SECRET ani SMS_GATEWAY_URL)`
  );
  return { source: 'mock', data: { sent: false } };
}
