import { NextRequest, NextResponse } from 'next/server';
import { publishDuePosts } from '@/lib/social-publish';

// POST /api/social/publish-due — cron publikacji zaplanowanych postów (Faza 3).
// Woła n8n/cron co kilka minut; publikuje posty z terminem <= teraz przez
// router n8n (SOCIAL_PUBLISH_WEBHOOK_URL → FB/IG/GBP/LinkedIn).
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
    const results = await publishDuePosts();
    return NextResponse.json({ ok: true, opublikowane: results.length, results });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Błąd publikacji' },
      { status: 500 }
    );
  }
}
