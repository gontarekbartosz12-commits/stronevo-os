import { NextRequest, NextResponse } from 'next/server';
import { sendCampaignNow } from '@/lib/email-campaign-send';

// POST /api/email/send — wysyłka kampanii (Faza 3): cron zaplanowanych (n8n)
// lub integracje. Panel operatora używa tej samej logiki przez server action.
// Autoryzacja: x-ingest-key = MARKETING_API_KEY (fallback EVENTS_INGEST_KEY).
// Body: { campaign_id }

export async function POST(request: NextRequest) {
  const key = process.env.MARKETING_API_KEY || process.env.EVENTS_INGEST_KEY;
  if (key && request.headers.get('x-ingest-key') !== key) {
    return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 });
  }

  let body: { campaign_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body musi być JSON-em' }, { status: 400 });
  }
  if (!body.campaign_id) return NextResponse.json({ error: 'Podaj campaign_id' }, { status: 400 });

  try {
    const result = await sendCampaignNow(body.campaign_id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Błąd wysyłki kampanii' },
      { status: 500 }
    );
  }
}
