import { NextRequest, NextResponse } from 'next/server';
import {
  appendMessage,
  getConversation,
  getFirmaName,
} from '@/lib/conversations-runtime';
import { deliverMessage } from '@/lib/integrations/conversations-send';

// POST /api/conversations/send — wysyłka odpowiedzi wątku per kanał (Faza 2).
// Używane przez n8n/integracje zewnętrzne; UI panelu idzie przez server action
// (sendReply), które woła te same deliverMessage/appendMessage.
// Routing kanałów: SMS=brama, e-mail=Brevo/SMTP (webhook n8n), webchat=polling
// widgetu, WhatsApp/FB/IG/GBP=router n8n (CONVERSATIONS_SEND_WEBHOOK_URL).
//
// Autoryzacja: x-ingest-key = CONVERSATIONS_INGEST_KEY (fallback EVENTS_INGEST_KEY).
// Body: { conversation_id, body, author? ('human'|'ai', default human) }

export async function POST(request: NextRequest) {
  const key = process.env.CONVERSATIONS_INGEST_KEY || process.env.EVENTS_INGEST_KEY;
  if (key && request.headers.get('x-ingest-key') !== key) {
    return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 });
  }

  let body: { conversation_id?: string; body?: string; author?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body musi być JSON-em' }, { status: 400 });
  }

  const tresc = (body.body ?? '').trim();
  if (!body.conversation_id || !tresc) {
    return NextResponse.json({ error: 'Podaj conversation_id i body' }, { status: 400 });
  }

  try {
    const conversation = await getConversation(body.conversation_id);
    if (!conversation) {
      return NextResponse.json({ error: 'Rozmowa nie istnieje' }, { status: 404 });
    }
    const author = body.author === 'ai' ? ('ai' as const) : ('human' as const);
    const message = await appendMessage(conversation, { direction: 'out', body: tresc, author });
    const firma = await getFirmaName(conversation.owner_contact_id);
    const delivered = await deliverMessage(conversation, tresc, firma);

    return NextResponse.json({
      ok: true,
      message_id: message.id,
      delivered: delivered.sent,
      via: delivered.via,
      source: delivered.source,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Błąd wysyłki' },
      { status: 500 }
    );
  }
}
