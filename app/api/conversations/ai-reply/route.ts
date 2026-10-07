import { NextRequest, NextResponse } from 'next/server';
import { runConversationAi } from '@/lib/conversations-runtime';

// POST /api/conversations/ai-reply — Conversation AI na żądanie (Faza 2).
// Normalnie AI odpala się samo przy ingest (ai_auto). Ten endpoint pozwala
// n8n/integracjom wymusić przebieg: RAG (pgvector/keyword) + Claude →
// auto-odpowiedź LUB eskalacja (lead do CRM właściciela + notyfikacja).
//
// Autoryzacja: x-ingest-key = CONVERSATIONS_INGEST_KEY (fallback EVENTS_INGEST_KEY).
// Body: { conversation_id, send? (default true; false = tylko szkic/decyzja) }

export async function POST(request: NextRequest) {
  const key = process.env.CONVERSATIONS_INGEST_KEY || process.env.EVENTS_INGEST_KEY;
  if (key && request.headers.get('x-ingest-key') !== key) {
    return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 });
  }

  let body: { conversation_id?: string; send?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body musi być JSON-em' }, { status: 400 });
  }
  if (!body.conversation_id) {
    return NextResponse.json({ error: 'Podaj conversation_id' }, { status: 400 });
  }

  try {
    const result = await runConversationAi(body.conversation_id, {
      send: body.send !== false,
    });
    return NextResponse.json({
      ok: true,
      action: result.decision.action,
      reply: result.decision.reply,
      powod: result.decision.powod,
      zrodla: result.decision.zrodla,
      engine: result.decision.engine,
      sent: result.sent,
      lead_id: result.leadId,
      message_id: result.messageId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Błąd Conversation AI';
    return NextResponse.json(
      { ok: false, error: msg },
      { status: msg.includes('nie istnieje') ? 404 : 500 }
    );
  }
}
