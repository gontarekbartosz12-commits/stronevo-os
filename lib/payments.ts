import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { PaymentProvider } from './types';

// PŁATNOŚCI (Faza 4) — abstrakcja providerów + WERYFIKACJA PODPISÓW webhooków.
// ⚠️ Prawdziwe pieniądze: żaden webhook nie zmienia statusu bez poprawnego
// podpisu; kwota z webhooka MUSI zgadzać się z kwotą płatności (payments-settle).
//
// Provider aktywny wg ENV (pierwszy skonfigurowany):
//   P24_MERCHANT_ID + P24_POS_ID + P24_CRC + P24_API_KEY  (+P24_SANDBOX=1)
//   STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET
//   PAYU_POS_ID + PAYU_CLIENT_ID + PAYU_CLIENT_SECRET + PAYU_SECOND_KEY
// Bez kluczy → 'mock': jawna SYMULACJA (strona /pay pokazuje tryb demo),
// webhook mock też jest PODPISANY (HMAC z MOCK_PAYMENTS_SECRET) — ścieżka
// weryfikacji podpisu jest ćwiczona nawet w demo.

export function activeProvider(): PaymentProvider {
  if (process.env.P24_MERCHANT_ID && process.env.P24_CRC) return 'p24';
  if (process.env.STRIPE_SECRET_KEY) return 'stripe';
  if (process.env.PAYU_POS_ID && process.env.PAYU_SECOND_KEY) return 'payu';
  return 'mock';
}

// Czy realna bramka płatności jest podłączona (nie mock/demo). Bez tego
// /pay/[token] pokazuje „tryb demo" — więc UI klienta ma NIE eksponować
// wystawiania linków (teaser „uruchamiamy w pakiecie"), a nie prowadzić do symulacji.
export function paymentsWired(): boolean {
  return activeProvider() !== 'mock';
}

export function mockSecret(): string {
  return (
    process.env.MOCK_PAYMENTS_SECRET ??
    process.env.EVENTS_INGEST_KEY ??
    'stronevo-demo-mock' // stała TYLKO dla trybu demo bez ENV
  );
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

// ===== Start płatności: URL przekierowania do bramki =====

export interface PaymentStart {
  provider: PaymentProvider;
  redirect_url: string | null; // null przy mock → UI pokazuje przycisk symulacji
  external_id: string | null;
  error?: string;
}

export async function startProviderPayment(input: {
  token: string; // sessionId/extOrderId = token linku
  kwota: number; // zł
  opis: string;
  email: string | null;
  returnUrl: string;
  webhookUrl: string;
}): Promise<PaymentStart> {
  const provider = activeProvider();
  const grosze = Math.round(input.kwota * 100);

  if (provider === 'p24') {
    try {
      const base = process.env.P24_SANDBOX
        ? 'https://sandbox.przelewy24.pl'
        : 'https://secure.przelewy24.pl';
      const merchantId = Number(process.env.P24_MERCHANT_ID);
      const sign = createHash('sha384')
        .update(
          JSON.stringify({
            sessionId: input.token,
            merchantId,
            amount: grosze,
            currency: 'PLN',
            crc: process.env.P24_CRC,
          })
        )
        .digest('hex');
      const res = await fetch(`${base}/api/v1/transaction/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:
            'Basic ' +
            Buffer.from(`${process.env.P24_POS_ID}:${process.env.P24_API_KEY}`).toString('base64'),
        },
        body: JSON.stringify({
          merchantId,
          posId: Number(process.env.P24_POS_ID),
          sessionId: input.token,
          amount: grosze,
          currency: 'PLN',
          description: input.opis.slice(0, 120),
          email: input.email ?? 'platnosci@stronevo.pl',
          country: 'PL',
          language: 'pl',
          urlReturn: input.returnUrl,
          urlStatus: input.webhookUrl,
          sign,
        }),
      });
      const json = await res.json();
      const p24Token = json?.data?.token;
      if (!res.ok || !p24Token) {
        return { provider, redirect_url: null, external_id: null, error: `P24 register: ${JSON.stringify(json).slice(0, 200)}` };
      }
      return {
        provider,
        redirect_url: `${base}/trnRequest/${p24Token}`,
        external_id: p24Token,
      };
    } catch (e) {
      return { provider, redirect_url: null, external_id: null, error: e instanceof Error ? e.message : 'P24 nieosiągalne' };
    }
  }

  if (provider === 'stripe') {
    try {
      const params = new URLSearchParams({
        mode: 'payment',
        success_url: input.returnUrl,
        cancel_url: input.returnUrl,
        'line_items[0][price_data][currency]': 'pln',
        'line_items[0][price_data][unit_amount]': String(grosze),
        'line_items[0][price_data][product_data][name]': input.opis.slice(0, 120),
        'line_items[0][quantity]': '1',
        'metadata[token]': input.token,
        'payment_intent_data[metadata][token]': input.token,
      });
      if (input.email) params.set('customer_email', input.email);
      const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });
      const json = await res.json();
      if (!res.ok || !json.url) {
        return { provider, redirect_url: null, external_id: null, error: `Stripe: ${json?.error?.message ?? res.status}` };
      }
      return { provider, redirect_url: json.url, external_id: json.id };
    } catch (e) {
      return { provider, redirect_url: null, external_id: null, error: e instanceof Error ? e.message : 'Stripe nieosiągalny' };
    }
  }

  if (provider === 'payu') {
    try {
      const authRes = await fetch('https://secure.payu.com/pl/standard/user/oauth/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=client_credentials&client_id=${process.env.PAYU_CLIENT_ID}&client_secret=${process.env.PAYU_CLIENT_SECRET}`,
      });
      const auth = await authRes.json();
      if (!auth.access_token) {
        return { provider, redirect_url: null, external_id: null, error: 'PayU OAuth: brak tokenu' };
      }
      const res = await fetch('https://secure.payu.com/api/v2_1/orders', {
        method: 'POST',
        redirect: 'manual', // PayU zwraca 302 z redirectUri w body JSON
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.access_token}`,
        },
        body: JSON.stringify({
          notifyUrl: input.webhookUrl,
          continueUrl: input.returnUrl,
          customerIp: '127.0.0.1',
          merchantPosId: process.env.PAYU_POS_ID,
          description: input.opis.slice(0, 120),
          currencyCode: 'PLN',
          totalAmount: String(grosze),
          extOrderId: input.token,
          products: [{ name: input.opis.slice(0, 120), unitPrice: String(grosze), quantity: '1' }],
          buyer: input.email ? { email: input.email } : undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!json.redirectUri) {
        return { provider, redirect_url: null, external_id: null, error: `PayU: ${JSON.stringify(json).slice(0, 200)}` };
      }
      return { provider, redirect_url: json.redirectUri, external_id: json.orderId ?? null };
    } catch (e) {
      return { provider, redirect_url: null, external_id: null, error: e instanceof Error ? e.message : 'PayU nieosiągalne' };
    }
  }

  // mock: bez przekierowania — /pay pokazuje jawny przycisk symulacji
  return { provider: 'mock', redirect_url: null, external_id: `mock-${input.token}` };
}

// ===== Weryfikacja podpisów webhooków (per provider) =====

export interface VerifiedNotification {
  ok: boolean;
  error?: string;
  token: string | null;   // sessionId/extOrderId/metadata.token → payment_link.token
  groszy: number | null;  // kwota z webhooka w groszach (do twardej weryfikacji)
  external_id: string | null;
  paid: boolean;          // czy zdarzenie oznacza opłacenie
}

export function verifyWebhook(
  provider: PaymentProvider,
  rawBody: string,
  headers: Headers
): VerifiedNotification {
  const fail = (error: string): VerifiedNotification => ({
    ok: false,
    error,
    token: null,
    groszy: null,
    external_id: null,
    paid: false,
  });

  try {
    if (provider === 'mock') {
      const body = JSON.parse(rawBody) as { token?: string; groszy?: number; external_id?: string; signature?: string };
      if (!body.token || !Number.isInteger(body.groszy)) return fail('mock: brak token/groszy');
      const expected = createHmac('sha256', mockSecret())
        .update(`${body.token}|${body.groszy}`)
        .digest('hex');
      if (!body.signature || !safeEqual(expected, body.signature)) {
        return fail('mock: zły podpis');
      }
      return { ok: true, token: body.token, groszy: body.groszy!, external_id: body.external_id ?? null, paid: true };
    }

    if (provider === 'p24') {
      const body = JSON.parse(rawBody) as {
        sessionId?: string; amount?: number; originAmount?: number; currency?: string;
        orderId?: number; sign?: string;
      };
      if (!body.sessionId || !body.sign) return fail('p24: brak pól');
      const expected = createHash('sha384')
        .update(
          JSON.stringify({
            merchantId: Number(process.env.P24_MERCHANT_ID),
            posId: Number(process.env.P24_POS_ID),
            sessionId: body.sessionId,
            amount: body.amount,
            originAmount: body.originAmount,
            currency: body.currency,
            orderId: body.orderId,
            methodId: (JSON.parse(rawBody) as { methodId?: number }).methodId,
            statement: (JSON.parse(rawBody) as { statement?: string }).statement,
            crc: process.env.P24_CRC,
          })
        )
        .digest('hex');
      if (!safeEqual(expected, body.sign)) return fail('p24: zły podpis (sign)');
      return { ok: true, token: body.sessionId, groszy: body.amount ?? null, external_id: String(body.orderId ?? ''), paid: true };
    }

    if (provider === 'stripe') {
      const sigHeader = headers.get('stripe-signature') ?? '';
      const parts = Object.fromEntries(
        sigHeader.split(',').map((p) => p.split('=') as [string, string])
      );
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!secret || !parts.t || !parts.v1) return fail('stripe: brak podpisu/sekretu');
      const expected = createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest('hex');
      if (!safeEqual(expected, parts.v1)) return fail('stripe: zły podpis');
      const event = JSON.parse(rawBody) as {
        type?: string;
        data?: { object?: { id?: string; amount_total?: number; metadata?: { token?: string } } };
      };
      const obj = event.data?.object;
      return {
        ok: true,
        token: obj?.metadata?.token ?? null,
        groszy: obj?.amount_total ?? null,
        external_id: obj?.id ?? null,
        paid: event.type === 'checkout.session.completed',
      };
    }

    if (provider === 'payu') {
      const header = headers.get('openpayu-signature') ?? '';
      const sigMatch = header.match(/signature=([a-f0-9]+)/i);
      const secondKey = process.env.PAYU_SECOND_KEY;
      if (!secondKey || !sigMatch) return fail('payu: brak podpisu/sekretu');
      const expected = createHash('md5').update(rawBody + secondKey).digest('hex');
      if (!safeEqual(expected, sigMatch[1].toLowerCase())) return fail('payu: zły podpis');
      const body = JSON.parse(rawBody) as {
        order?: { extOrderId?: string; totalAmount?: string; status?: string; orderId?: string };
      };
      return {
        ok: true,
        token: body.order?.extOrderId ?? null,
        groszy: body.order?.totalAmount ? Number(body.order.totalAmount) : null,
        external_id: body.order?.orderId ?? null,
        paid: body.order?.status === 'COMPLETED',
      };
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'błąd weryfikacji');
  }
  return fail('nieznany provider');
}

export function newPaymentToken(): string {
  return `pay-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function newEnrollmentToken(): string {
  return `kurs-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
