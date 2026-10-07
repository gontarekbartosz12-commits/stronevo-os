import { NextRequest, NextResponse } from 'next/server';
import { runPaymentReminders } from '@/app/actions/reminders';

// POST /api/reminders/run — dzienny cron VPS odpala automat przypomnień o płatności.
// Autoryzacja: Authorization: Bearer <REMINDERS_API_TOKEN | NOTIFY_API_TOKEN>.
// Bez tokena w ENV — endpoint otwarty (dev/demo).
export async function POST(request: NextRequest) {
  const token = process.env.REMINDERS_API_TOKEN || process.env.NOTIFY_API_TOKEN;
  if (token) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${token}`) {
      return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 });
    }
  }

  try {
    const result = await runPaymentReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Błąd automatu' },
      { status: 500 }
    );
  }
}
