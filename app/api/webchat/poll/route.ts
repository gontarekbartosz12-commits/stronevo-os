import { NextRequest, NextResponse } from 'next/server';
import { getConversation, listThread } from '@/lib/conversations-runtime';

// GET /api/webchat/poll — realtime widgetu przez polling (Faza 2).
// Widget odpytuje co kilka sekund o NOWE wiadomości wychodzące (odpowiedzi
// bota/zespołu z inboxa). Dostęp: conversation_id + session_id muszą się
// zgadzać (session_id = capability token wątku, nigdzie nie publikowany).
// Query: conversation=<uuid> & session=<session_id> & after=<ISO, opcjonalnie>

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const conversationId = params.get('conversation');
  const session = (params.get('session') ?? '').trim();
  const after = params.get('after');

  if (!conversationId || !session) {
    return NextResponse.json({ error: 'Podaj conversation i session' }, { status: 400 });
  }

  try {
    const conversation = await getConversation(conversationId);
    if (!conversation || (conversation.external?.session_id ?? '') !== session) {
      return NextResponse.json({ error: 'Brak dostępu do wątku' }, { status: 404 });
    }

    const thread = await listThread(conversationId);
    const messages = thread
      .filter((m) => m.direction === 'out' && (!after || m.created_at > after))
      .map((m) => ({ id: m.id, body: m.body, author: m.author, created_at: m.created_at }));

    return NextResponse.json({ ok: true, messages, status: conversation.status });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Błąd pollingu' },
      { status: 500 }
    );
  }
}
