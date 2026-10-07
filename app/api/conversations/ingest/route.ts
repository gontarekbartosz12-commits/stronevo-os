import { NextRequest, NextResponse } from 'next/server';
import { recordIncoming } from '@/lib/conversations-runtime';
import { CONVERSATION_CHANNELS, ConversationChannel } from '@/lib/types';

// POST /api/conversations/ingest — przychodzące wiadomości ze WSZYSTKICH kanałów
// (Faza 2 zaufania). Webhooki n8n per kanał (SMS brama, Brevo inbound, WhatsApp
// Cloud API, Messenger/IG, GBP) wrzucają tu wiadomość → upsert wątku po
// (owner, channel, external) → zapis → jeśli ai_auto: bot odpowiada od razu.
//
// Autoryzacja: x-ingest-key = CONVERSATIONS_INGEST_KEY (fallback EVENTS_INGEST_KEY).
// Zapis w trybie live: WYŁĄCZNIE service role.
//
// Body: { owner_contact_id (uuid firmy-właściciela skrzynki; null/brak = STRONEVO),
//         channel, external: {imie?, telefon?, email?, session_id?}, body,
//         media?, conversation_id? (kontynuacja konkretnego wątku) }

export async function POST(request: NextRequest) {
  const key = process.env.CONVERSATIONS_INGEST_KEY || process.env.EVENTS_INGEST_KEY;
  if (key && request.headers.get('x-ingest-key') !== key) {
    return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 });
  }

  let body: {
    owner_contact_id?: string | null;
    channel?: string;
    external?: Record<string, string | null>;
    body?: string;
    media?: unknown[];
    conversation_id?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body musi być JSON-em' }, { status: 400 });
  }

  const channel = body.channel as ConversationChannel;
  if (!CONVERSATION_CHANNELS.includes(channel)) {
    return NextResponse.json(
      { error: `Nieznany kanał. Dozwolone: ${CONVERSATION_CHANNELS.join(', ')}` },
      { status: 400 }
    );
  }
  const tresc = (body.body ?? '').trim();
  if (!tresc) {
    return NextResponse.json({ error: 'Podaj body (treść wiadomości)' }, { status: 400 });
  }
  const external = body.external ?? {};
  if (!body.conversation_id && !external.telefon && !external.email && !external.session_id) {
    return NextResponse.json(
      { error: 'external musi mieć telefon, email lub session_id (klucz upsertu wątku)' },
      { status: 400 }
    );
  }

  try {
    const result = await recordIncoming(
      body.owner_contact_id ?? null,
      channel,
      external,
      tresc,
      { media: body.media, conversationId: body.conversation_id }
    );
    return NextResponse.json({
      ok: true,
      conversation_id: result.conversation.id,
      message_id: result.message.id,
      ai: result.ai
        ? {
            action: result.ai.decision.action,
            sent: result.ai.sent,
            lead_id: result.ai.leadId,
            zrodla: result.ai.decision.zrodla,
          }
        : null,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Błąd zapisu wiadomości' },
      { status: e instanceof Error && e.message.includes('nie istnieje') ? 404 : 500 }
    );
  }
}
