import { sendOpsAlert } from './alerts';
import { demoStore } from './demo-store';
import { AiDecision, decideAiReply } from './conversation-ai';
import { deliverMessage } from './integrations/conversations-send';
import { ScoredDoc, embedText, keywordSearch } from './rag';
import { isSupabaseConfigured } from './supabase/config';
import { createAdminClient, isAdminConfigured } from './supabase/admin';
import {
  Contact,
  Conversation,
  ConversationChannel,
  ConversationExternal,
  KnowledgeDoc,
  Message,
} from './types';

// CONVERSATIONS RUNTIME (Faza 2 zaufania) — wspólna orkiestracja dla
// /api/conversations/*, /api/webchat/* i server actions. W trybie live pracuje
// na SERVICE ROLE (ingest/AI działają bez sesji; RLS nie daje insertu nikomu
// innemu). Server-only — nigdy nie importować z komponentów klienckich.

function db() {
  return createAdminClient();
}
const live = () => isSupabaseConfigured() && isAdminConfigured();

export async function getFirmaName(ownerContactId: string | null): Promise<string> {
  if (!ownerContactId) return 'STRONEVO';
  if (!isSupabaseConfigured()) {
    const c = demoStore.getContact(ownerContactId);
    return c?.firma ?? c?.imie ?? 'firma';
  }
  const { data } = await db().from('contacts').select('firma, imie').eq('id', ownerContactId).maybeSingle();
  return data?.firma ?? data?.imie ?? 'firma';
}

export async function getConversation(id: string): Promise<Conversation | null> {
  if (!isSupabaseConfigured()) return demoStore.getConversation(id);
  const { data } = await db().from('conversations').select('*').eq('id', id).maybeSingle();
  return data as Conversation | null;
}

export async function listThread(conversationId: string): Promise<Message[]> {
  if (!isSupabaseConfigured()) return demoStore.listMessages(conversationId);
  const { data } = await db()
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at');
  return (data ?? []) as Message[];
}

// Upsert wątku po (owner, channel, external): session_id → telefon → email.
// Zamknięta rozmowa przy nowej wiadomości otwiera się ponownie.
export async function upsertConversation(
  ownerContactId: string | null,
  channel: ConversationChannel,
  external: ConversationExternal,
  opts?: { aiAutoDefault?: boolean }
): Promise<Conversation> {
  if (!isSupabaseConfigured()) {
    const existing = demoStore.findConversationByExternal(ownerContactId, channel, external);
    if (existing) {
      return (
        demoStore.updateConversation(existing.id, {
          status: existing.status === 'zamknieta' ? 'otwarta' : existing.status,
          external: { ...existing.external, ...compact(external) },
        }) ?? existing
      );
    }
    return demoStore.createConversation({
      contact_id: null,
      owner_contact_id: ownerContactId,
      external,
      channel,
      status: 'otwarta',
      assigned: null,
      ai_auto: opts?.aiAutoDefault ?? false,
      last_msg_at: null,
    });
  }

  const supabase = db();
  let query = supabase.from('conversations').select('*').eq('channel', channel);
  query = ownerContactId
    ? query.eq('owner_contact_id', ownerContactId)
    : query.is('owner_contact_id', null);
  const { data: candidates } = await query.order('created_at', { ascending: false }).limit(50);

  const key = (v?: string | null) => (v ?? '').replace(/\s+/g, '').toLowerCase();
  const found = ((candidates ?? []) as Conversation[]).find(
    (c) =>
      (key(external.session_id) && key(c.external?.session_id) === key(external.session_id)) ||
      (key(external.telefon) && key(c.external?.telefon) === key(external.telefon)) ||
      (key(external.email) && key(c.external?.email) === key(external.email))
  );
  if (found) {
    const { data } = await supabase
      .from('conversations')
      .update({
        status: found.status === 'zamknieta' ? 'otwarta' : found.status,
        external: { ...found.external, ...compact(external) },
      })
      .eq('id', found.id)
      .select('*')
      .single();
    return (data ?? found) as Conversation;
  }

  const { data, error } = await supabase
    .from('conversations')
    .insert({
      owner_contact_id: ownerContactId,
      external,
      channel,
      status: 'otwarta',
      ai_auto: opts?.aiAutoDefault ?? false,
    })
    .select('*')
    .single();
  if (error) throw new Error(`Nie udało się utworzyć rozmowy: ${error.message}`);
  return data as Conversation;
}

function compact(ext: ConversationExternal): ConversationExternal {
  const out: ConversationExternal = {};
  if (ext.imie) out.imie = ext.imie;
  if (ext.telefon) out.telefon = ext.telefon;
  if (ext.email) out.email = ext.email;
  if (ext.session_id) out.session_id = ext.session_id;
  return out;
}

export async function appendMessage(
  conversation: Conversation,
  input: Pick<Message, 'direction' | 'body' | 'author'> & { media?: unknown[] }
): Promise<Message> {
  if (!isSupabaseConfigured()) {
    return demoStore.createMessage({
      conversation_id: conversation.id,
      owner_contact_id: conversation.owner_contact_id,
      direction: input.direction,
      channel: conversation.channel,
      body: input.body,
      media: input.media ?? [],
      author: input.author,
    });
  }
  const supabase = db();
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversation.id,
      owner_contact_id: conversation.owner_contact_id,
      direction: input.direction,
      channel: conversation.channel,
      body: input.body,
      media: input.media ?? [],
      author: input.author,
    })
    .select('*')
    .single();
  if (error) throw new Error(`Nie udało się zapisać wiadomości: ${error.message}`);
  await supabase
    .from('conversations')
    .update({ last_msg_at: (data as Message).created_at })
    .eq('id', conversation.id);
  return data as Message;
}

export async function updateConversation(
  id: string,
  patch: Partial<Pick<Conversation, 'status' | 'ai_auto' | 'assigned' | 'contact_id'>>
): Promise<void> {
  if (!isSupabaseConfigured()) {
    demoStore.updateConversation(id, patch);
    return;
  }
  await db().from('conversations').update(patch).eq('id', id);
}

// ===== RAG =====

export async function searchKnowledge(
  contactId: string | null,
  query: string,
  k = 3
): Promise<ScoredDoc[]> {
  if (!isSupabaseConfigured()) {
    return keywordSearch(demoStore.listKnowledgeDocs(contactId), query, k);
  }

  // Live: embeddingi (pgvector) → fallback keyword, gdy brak konfiguracji/wektorów
  const vector = await embedText(query);
  if (vector) {
    const { data } = await db().rpc('match_knowledge_docs', {
      query_embedding: vector,
      p_contact: contactId,
      match_count: k,
    });
    const rows = (data ?? []) as { id: string; tytul: string; tresc: string; similarity: number }[];
    if (rows.length > 0) {
      return rows.map((r) => ({
        doc: { id: r.id, tytul: r.tytul, tresc: r.tresc },
        score: r.similarity,
        snippet: r.tresc.slice(0, 320),
      }));
    }
  }
  let query2 = db().from('knowledge_docs').select('id, tytul, tresc');
  query2 = contactId ? query2.eq('contact_id', contactId) : query2.is('contact_id', null);
  const { data: docs } = await query2;
  return keywordSearch((docs ?? []) as KnowledgeDoc[], query, k);
}

// ===== Conversation AI: pełny przebieg na przychodzącej wiadomości =====

export interface AiRunResult {
  decision: AiDecision;
  sent: boolean; // czy odpowiedź poszła do klienta końcowego
  leadId: string | null;
  messageId: string | null; // zapisana wiadomość AI
}

// send=true: auto-odpowiedź (ai_auto / webchat); send=false: tylko szkic (inbox)
export async function runConversationAi(
  conversationId: string,
  opts: { send: boolean }
): Promise<AiRunResult> {
  const conversation = await getConversation(conversationId);
  if (!conversation) throw new Error('Rozmowa nie istnieje.');

  const history = await listThread(conversationId);
  const lastIn = [...history].reverse().find((m) => m.direction === 'in');
  if (!lastIn) {
    return {
      decision: {
        action: 'eskalacja',
        reply: null,
        powod: 'Brak wiadomości przychodzącej',
        zrodla: [],
        engine: 'keyword',
        leadTelefon: null,
        leadEmail: null,
      },
      sent: false,
      leadId: null,
      messageId: null,
    };
  }

  const firma = await getFirmaName(conversation.owner_contact_id);
  const docs = await searchKnowledge(conversation.owner_contact_id, lastIn.body);
  const decision = await decideAiReply({
    conversation,
    firma,
    history,
    incoming: lastIn.body,
    docs,
  });

  let sent = false;
  let messageId: string | null = null;
  let leadId: string | null = null;

  if (opts.send && decision.reply) {
    const msg = await appendMessage(conversation, {
      direction: 'out',
      body: decision.reply,
      author: 'ai',
    });
    messageId = msg.id;
    const delivered = await deliverMessage(conversation, decision.reply, firma);
    sent = delivered.sent;
  }

  if (decision.action === 'eskalacja' && opts.send) {
    leadId = await captureLead(conversation, decision, lastIn.body, firma);
    await updateConversation(conversation.id, { status: 'oczekuje' });
    await notifyEscalation(conversation, firma, lastIn.body);
  }

  return { decision, sent, leadId, messageId };
}

// Lead z rozmowy: trafia do CRM właściciela skrzynki (owner_contact_id) —
// dokładnie tam, gdzie klient prowadzi swoje leady. Dedupe: rozmowa już spięta
// z kontaktem = nie duplikujemy.
async function captureLead(
  conversation: Conversation,
  decision: AiDecision,
  lastMessage: string,
  firma: string
): Promise<string | null> {
  if (conversation.contact_id) return conversation.contact_id;

  const ext = conversation.external ?? {};
  const telefon = decision.leadTelefon ?? ext.telefon ?? null;
  const email = decision.leadEmail ?? ext.email ?? null;
  if (!telefon && !email && !ext.imie) return null; // nie mamy po czym wrócić

  const row = {
    server_id: null,
    typ: 'lead' as const,
    imie: ext.imie ?? `Rozmowa (${conversation.channel})`,
    firma: null,
    nip: null,
    adres: null,
    branza: null,
    miasto: null,
    telefon,
    email,
    zrodlo: `rozmowy-${conversation.channel}`,
    status_pipeline: 'NOWY' as const,
    nastepna_akcja: 'Oddzwonić — eskalacja z rozmów (Conversation AI)',
    nastepna_akcja_data: new Date().toISOString().slice(0, 10),
    data_ostatniego_kontaktu: null,
    notatki: `Ostatnia wiadomość: "${lastMessage.slice(0, 300)}" · powód eskalacji: ${decision.powod}`,
    business_hours: null,
    srednia_wartosc_wizyty: null,
    auto_followup_sms: false,
    przypisany_do: null,
    owner_contact_id: conversation.owner_contact_id,
  };

  let leadId: string | null = null;
  if (!isSupabaseConfigured()) {
    leadId = demoStore.createContact(row).id;
  } else {
    const { data } = await db().from('contacts').insert(row).select('id').single();
    leadId = (data?.id as string) ?? null;
  }
  if (leadId) await updateConversation(conversation.id, { contact_id: leadId });
  return leadId;
}

async function notifyEscalation(
  conversation: Conversation,
  firma: string,
  lastMessage: string
): Promise<void> {
  const kto = conversation.external?.imie ?? 'rozmówca';
  const row = {
    typ: 'biznes' as const,
    severity: 'warn' as const,
    tytul: `Rozmowa czeka na człowieka: ${kto} (${conversation.channel}, ${firma})`,
    opis: `Conversation AI przekazał wątek do obsługi. Ostatnia wiadomość: "${lastMessage.slice(0, 200)}". Odpowiedz w /rozmowy.`,
    related_typ: 'conversation',
    related_id: conversation.id,
    status: 'nowe' as const,
    akcje: [],
  };
  if (!isSupabaseConfigured()) {
    demoStore.createNotification(row);
  } else {
    await db().from('notifications').insert(row);
  }

  // OPERATOR-FIRST: człowiek (operator) dostaje alert od razu — Telegram/SMS
  await sendOpsAlert(
    `Rozmowa czeka na człowieka [${firma} · ${conversation.channel}] ${kto}: "${lastMessage.slice(0, 120)}"`
  );
}

// ===== Przychodząca wiadomość (ingest/webchat): zapis + ewentualne AI =====

export interface IncomingResult {
  conversation: Conversation;
  message: Message;
  ai: AiRunResult | null;
}

export async function recordIncoming(
  ownerContactId: string | null,
  channel: ConversationChannel,
  external: ConversationExternal,
  body: string,
  opts?: { media?: unknown[]; conversationId?: string; aiAutoDefault?: boolean }
): Promise<IncomingResult> {
  let conversation: Conversation | null = null;
  if (opts?.conversationId) {
    conversation = await getConversation(opts.conversationId);
    if (!conversation) throw new Error('Rozmowa nie istnieje (conversation_id).');
  } else {
    conversation = await upsertConversation(ownerContactId, channel, external, {
      aiAutoDefault: opts?.aiAutoDefault,
    });
  }

  if (conversation.status === 'zamknieta') {
    await updateConversation(conversation.id, { status: 'otwarta' });
    conversation = { ...conversation, status: 'otwarta' };
  }

  const message = await appendMessage(conversation, {
    direction: 'in',
    body,
    author: 'koncowy',
    media: opts?.media,
  });

  // ai_auto → bot odpowiada od razu (z wiedzy firmy albo eskaluje)
  let ai: AiRunResult | null = null;
  if (conversation.ai_auto) {
    try {
      ai = await runConversationAi(conversation.id, { send: true });
    } catch {
      ai = null; // AI nie może blokować zapisu wiadomości
    }
  }

  return { conversation, message, ai };
}

export { live as isConversationsLive };
