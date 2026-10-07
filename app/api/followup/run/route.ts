import { NextRequest, NextResponse } from 'next/server';
import { runAutoFollowups } from '@/lib/followup-run';

// POST /api/followup/run — cron auto-follow-upu straconych leadów (TOR 1).
// Woła n8n/cron cyklicznie (np. co godzinę). Dla kontaktów z auto_followup_sms=true
// wysyła JEDEN SMS do świeżych, nieodebranych leadów po godzinach (dedup w bazie).
// Autoryzacja: Bearer <MARKETING_API_TOKEN | NOTIFY_API_TOKEN>.

export async function POST(request: NextRequest) {
  const token = process.env.MARKETING_API_TOKEN || process.env.NOTIFY_API_TOKEN;
  if (token) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${token}`) {
      return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 });
    }
  }

  try {
    const result = await runAutoFollowups();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Błąd follow-upu' },
      { status: 500 }
    );
  }
}
