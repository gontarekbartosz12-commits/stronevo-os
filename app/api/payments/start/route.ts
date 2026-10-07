import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/demo-store';
import { activeProvider, startProviderPayment } from '@/lib/payments';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';
import { PaymentLink } from '@/lib/types';

// POST /api/payments/start — start płatności ze strony /pay/[token] (publiczne;
// token linku = kapability). Tworzy payment 'oczekuje' i zwraca redirect do
// bramki (P24/Stripe/PayU wg ENV). Provider 'mock' (demo) = bez redirectu —
// strona pokazuje JAWNY przycisk symulacji.

export async function POST(request: NextRequest) {
  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body musi być JSON-em' }, { status: 400 });
  }
  if (!body.token) return NextResponse.json({ error: 'Podaj token' }, { status: 400 });

  try {
    const demo = !isSupabaseConfigured();
    if (!demo && !isAdminConfigured()) {
      return NextResponse.json({ error: 'Brak service role' }, { status: 503 });
    }

    let link: PaymentLink | null;
    if (demo) {
      link = demoStore.getPaymentLinkByToken(body.token);
    } else {
      const { data } = await createAdminClient()
        .from('payment_links')
        .select('*')
        .eq('token', body.token)
        .maybeSingle();
      link = data as PaymentLink | null;
    }
    if (!link) return NextResponse.json({ error: 'Link nie istnieje' }, { status: 404 });
    if (link.status !== 'aktywny') {
      return NextResponse.json({ error: 'Link jest już opłacony lub wygasł' }, { status: 409 });
    }

    const appUrl = (process.env.APP_URL ?? 'https://crm.stronevo.pl').replace(/\/$/, '');
    const provider = activeProvider();
    const start = await startProviderPayment({
      token: link.token,
      kwota: Number(link.kwota),
      opis: link.opis,
      email: link.external?.email ?? null,
      returnUrl: `${appUrl}/pay/${link.token}`,
      webhookUrl: `${appUrl}/api/payments/webhook?provider=${provider}`,
    });
    if (start.error) {
      return NextResponse.json({ error: `Bramka: ${start.error}` }, { status: 502 });
    }

    // payment 'oczekuje' (jeśli jeszcze nie ma otwartego)
    const paymentRow = {
      contact_id: link.contact_id,
      payment_link_id: link.id,
      subscription_id: null,
      kwota: Number(link.kwota),
      waluta: link.waluta,
      status: 'oczekuje' as const,
      provider: start.provider,
      external_id: start.external_id,
      meta: { opis: link.opis },
      paid_at: null,
    };
    if (demo) {
      const open = demoStore
        .listPayments()
        .find((p) => p.payment_link_id === link.id && p.status === 'oczekuje');
      if (!open) demoStore.createPayment(paymentRow);
    } else {
      const supabase = createAdminClient();
      const { data: open } = await supabase
        .from('payments')
        .select('id')
        .eq('payment_link_id', link.id)
        .eq('status', 'oczekuje')
        .limit(1);
      if ((open ?? []).length === 0) await supabase.from('payments').insert(paymentRow);
    }

    return NextResponse.json({
      ok: true,
      provider: start.provider,
      redirect_url: start.redirect_url, // null przy mock
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Błąd startu płatności' },
      { status: 500 }
    );
  }
}
