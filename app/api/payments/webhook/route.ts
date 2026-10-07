import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhook } from '@/lib/payments';
import { settlePaymentByToken } from '@/lib/payments-settle';
import { PAYMENT_PROVIDERS, PaymentProvider } from '@/lib/types';

// POST /api/payments/webhook?provider=p24|payu|stripe|mock — notyfikacje bramek
// (Faza 4). ⚠️ PRAWDZIWE PIENIĄDZE:
//  1) podpis providera weryfikowany KRYPTOGRAFICZNIE (lib/payments.verifyWebhook;
//     zły podpis = 401, nic nie zapisujemy),
//  2) kwota z webhooka musi się zgadzać z kwotą linku (settle → 400 + alert),
//  3) zapis wyłącznie service role; idempotentne (drugi webhook = already_paid).

export async function POST(request: NextRequest) {
  const provider = request.nextUrl.searchParams.get('provider') as PaymentProvider;
  if (!PAYMENT_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: 'Podaj ?provider=p24|payu|stripe|mock' }, { status: 400 });
  }

  const rawBody = await request.text();
  const verified = verifyWebhook(provider, rawBody, request.headers);
  if (!verified.ok) {
    return NextResponse.json({ error: `Weryfikacja podpisu nieudana: ${verified.error}` }, { status: 401 });
  }
  if (!verified.paid) {
    // zdarzenie inne niż opłacenie (np. inny event Stripe) — potwierdzamy odbiór
    return NextResponse.json({ ok: true, ignored: true });
  }
  if (!verified.token || verified.groszy === null) {
    return NextResponse.json({ error: 'Brak tokenu/kwoty w notyfikacji' }, { status: 400 });
  }

  try {
    const result = await settlePaymentByToken({
      token: verified.token,
      groszy: verified.groszy,
      provider,
      external_id: verified.external_id,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
    }
    return NextResponse.json({
      ok: true,
      payment_id: result.payment_id,
      invoice_id: result.invoice_id ?? null,
      enrollment_token: result.enrollment_token ?? null,
      already_paid: result.already_paid ?? false,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Błąd rozliczenia' },
      { status: 500 }
    );
  }
}
