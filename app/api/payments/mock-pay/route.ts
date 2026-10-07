import { createHmac } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/demo-store';
import { activeProvider, mockSecret, verifyWebhook } from '@/lib/payments';
import { settlePaymentByToken } from '@/lib/payments-settle';
import { isSupabaseConfigured } from '@/lib/supabase/config';

// POST /api/payments/mock-pay — SYMULACJA bramki (WYŁĄCZNIE tryb demo/mock).
// Odtwarza pełny, produkcyjny tor: buduje PODPISANĄ notyfikację (HMAC jak
// prawdziwy provider) → verifyWebhook → settle. Dzięki temu ścieżka weryfikacji
// podpisu i twardej kwoty jest ćwiczona nawet bez kluczy bramek.
// Przy skonfigurowanym P24/Stripe/PayU endpoint jest WYŁĄCZONY (403).

export async function POST(request: NextRequest) {
  if (activeProvider() !== 'mock') {
    return NextResponse.json(
      { error: 'Symulacja wyłączona — skonfigurowana prawdziwa bramka płatności.' },
      { status: 403 }
    );
  }

  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body musi być JSON-em' }, { status: 400 });
  }
  if (!body.token) return NextResponse.json({ error: 'Podaj token' }, { status: 400 });

  // kwota z LINKU (symulujemy uczciwego providera)
  let kwota: number | null = null;
  if (!isSupabaseConfigured()) {
    kwota = demoStore.getPaymentLinkByToken(body.token)?.kwota ?? null;
  } else {
    const { createAdminClient, isAdminConfigured } = await import('@/lib/supabase/admin');
    if (isAdminConfigured()) {
      const { data } = await createAdminClient()
        .from('payment_links')
        .select('kwota')
        .eq('token', body.token)
        .maybeSingle();
      kwota = data ? Number(data.kwota) : null;
    }
  }
  if (kwota === null) return NextResponse.json({ error: 'Link nie istnieje' }, { status: 404 });

  const groszy = Math.round(kwota * 100);
  const notification = {
    token: body.token,
    groszy,
    external_id: `mock-${Date.now()}`,
    signature: createHmac('sha256', mockSecret()).update(`${body.token}|${groszy}`).digest('hex'),
  };

  // pełny tor produkcyjny: weryfikacja podpisu → rozliczenie
  const verified = verifyWebhook('mock', JSON.stringify(notification), new Headers());
  if (!verified.ok) {
    return NextResponse.json({ error: `Symulacja: ${verified.error}` }, { status: 500 });
  }
  const result = await settlePaymentByToken({
    token: verified.token!,
    groszy: verified.groszy!,
    provider: 'mock',
    external_id: verified.external_id,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  }
  return NextResponse.json({
    ok: true,
    symulacja: true,
    payment_id: result.payment_id,
    invoice_id: result.invoice_id ?? null,
    enrollment_token: result.enrollment_token ?? null,
    already_paid: result.already_paid ?? false,
  });
}
