import { NextRequest, NextResponse } from 'next/server';
import { chargeDueSubscriptions } from '@/lib/subscriptions-charge';

// POST /api/subscriptions/charge-due — cron auto-obciążeń subskrypcji (Faza 4).
// Codziennie (np. 07:00): aktywne subskrypcje z next_charge <= dziś →
// Stripe off-session / symulacja (demo) / smart dunning (link text-to-pay).
// Autoryzacja: Bearer <PAYMENTS_API_TOKEN | NOTIFY_API_TOKEN>.

export async function POST(request: NextRequest) {
  const token = process.env.PAYMENTS_API_TOKEN || process.env.NOTIFY_API_TOKEN;
  if (token) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${token}`) {
      return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 });
    }
  }

  try {
    const results = await chargeDueSubscriptions();
    return NextResponse.json({
      ok: true,
      przetworzone: results.length,
      obciazone: results.filter((r) => r.wynik === 'obciazona').length,
      linki: results.filter((r) => r.wynik === 'link_wyslany').length,
      bledy: results.filter((r) => r.wynik === 'blad').length,
      results,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Błąd crona obciążeń' },
      { status: 500 }
    );
  }
}
