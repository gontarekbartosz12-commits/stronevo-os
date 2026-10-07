import { NextRequest, NextResponse } from 'next/server';
import { listThread, recordIncoming } from '@/lib/conversations-runtime';

// POST /api/webchat/message — publiczny endpoint widgetu czatu (Faza 2).
// Widget na stronie klienta wysyła wiadomości gościa → wątek channel=webchat
// (upsert po session_id). Webchat domyślnie ai_auto=TRUE (bot z wiedzy firmy
// odpowiada od razu; konfiguruje to operator przy wdrożeniu, nie klient).
// Publiczne bez klucza (widget działa u gościa); wątek chroni nieodgadywalny
// session_id (capability), body limitowane.
//
// Body: { owner (uuid firmy; brak = STRONEVO), session_id, imie?, body }

export async function POST(request: NextRequest) {
  let body: { owner?: string | null; session_id?: string; imie?: string; body?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body musi być JSON-em' }, { status: 400 });
  }

  const tresc = (body.body ?? '').trim().slice(0, 2000);
  const sessionId = (body.session_id ?? '').trim();
  if (!tresc || !sessionId || sessionId.length < 8) {
    return NextResponse.json({ error: 'Podaj session_id (≥8 znaków) i body' }, { status: 400 });
  }

  try {
    const result = await recordIncoming(
      body.owner || null,
      'webchat',
      { imie: body.imie?.slice(0, 80) || `Gość ${sessionId.slice(-4)}`, session_id: sessionId },
      tresc,
      { aiAutoDefault: true }
    );

    // Odpowiedzi bota od razu w response (bez czekania na polling)
    const thread = await listThread(result.conversation.id);
    const lastInAt = result.message.created_at;
    const replies = thread
      .filter((m) => m.direction === 'out' && m.created_at >= lastInAt)
      .map((m) => ({ id: m.id, body: m.body, author: m.author, created_at: m.created_at }));

    return NextResponse.json({
      ok: true,
      conversation_id: result.conversation.id,
      replies,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Błąd czatu' },
      { status: 500 }
    );
  }
}
