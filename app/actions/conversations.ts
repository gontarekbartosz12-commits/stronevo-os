'use server';

import { revalidatePath } from 'next/cache';
import {
  appendMessage,
  getFirmaName,
  runConversationAi,
} from '@/lib/conversations-runtime';
import { demoStore } from '@/lib/demo-store';
import { deliverMessage, DeliverResult } from '@/lib/integrations/conversations-send';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import {
  Conversation,
  ConversationStatus,
  Message,
  MessageTemplate,
} from '@/lib/types';

// Inbox „Rozmowy" (Faza 2 zaufania) — akcje UI.
// MODEL OPERATOR-FIRST: klient obsługuje codzienny ruch (czyta/odpowiada/zamyka);
// konfiguracja automatyzacji (ai_auto, szkice AI) = wyłącznie operator (CEO).
// W trybie live izolację klienta pilnuje RLS + trigger conversations_guard_klient.

async function sessionRole(): Promise<'ceo' | 'pracownik' | 'klient'> {
  if (!isSupabaseConfigured()) return 'ceo'; // demo = widok operatora
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const role = user?.user_metadata?.role;
  return role === 'klient' ? 'klient' : role === 'pracownik' ? 'pracownik' : 'ceo';
}

export interface InboxConversation extends Conversation {
  ownerName: string; // czyja skrzynka (STRONEVO / firma klienta)
  lastMessage: string | null;
  lastAuthor: string | null;
  unanswered: boolean; // ostatnia wiadomość = przychodząca bez odpowiedzi
}

// scopeOwner: undefined = wszystkie skrzynki (CEO); string = skrzynka klienta (/klient)
export async function listInboxConversations(
  scopeOwner?: string
): Promise<InboxConversation[]> {
  let conversations: Conversation[];
  let ownerNames = new Map<string, string>();
  let lastByConv = new Map<string, Message>();

  if (!isSupabaseConfigured()) {
    conversations = demoStore.listConversations(scopeOwner === undefined ? undefined : scopeOwner);
    for (const c of demoStore.listContacts()) ownerNames.set(c.id, c.firma ?? c.imie);
    for (const conv of conversations) {
      const msgs = demoStore.listMessages(conv.id);
      if (msgs.length > 0) lastByConv.set(conv.id, msgs[msgs.length - 1]);
    }
  } else {
    const supabase = await createClient(); // RLS: CEO wszystko, klient tylko swoje
    let q = supabase.from('conversations').select('*').order('last_msg_at', { ascending: false });
    if (scopeOwner !== undefined) q = q.eq('owner_contact_id', scopeOwner);
    const [{ data: convs }, { data: contacts }] = await Promise.all([
      q.limit(200),
      supabase.from('contacts').select('id, firma, imie'),
    ]);
    conversations = (convs ?? []) as Conversation[];
    for (const c of contacts ?? []) ownerNames.set(c.id, c.firma ?? c.imie);

    if (conversations.length > 0) {
      const { data: msgs } = await supabase
        .from('messages')
        .select('*')
        .in('conversation_id', conversations.map((c) => c.id))
        .order('created_at', { ascending: false })
        .limit(600);
      for (const m of (msgs ?? []) as Message[]) {
        if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m);
      }
    }
  }

  return conversations
    .map((conv) => {
      const last = lastByConv.get(conv.id) ?? null;
      return {
        ...conv,
        ownerName: conv.owner_contact_id
          ? ownerNames.get(conv.owner_contact_id) ?? 'klient'
          : 'STRONEVO',
        lastMessage: last?.body ?? null,
        lastAuthor: last?.author ?? null,
        unanswered: last?.direction === 'in' && conv.status !== 'zamknieta',
      };
    })
    .sort((a, b) => (b.last_msg_at ?? b.created_at).localeCompare(a.last_msg_at ?? a.created_at));
}

export async function getThread(conversationId: string): Promise<Message[]> {
  if (!isSupabaseConfigured()) return demoStore.listMessages(conversationId);
  const supabase = await createClient(); // RLS pilnuje własności
  const { data } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at');
  return (data ?? []) as Message[];
}

export interface SendReplyResult {
  message: Message;
  delivery: DeliverResult; // realny wynik dostarczenia — UI NIE udaje wysłania
}

// Odpowiedź z inboxa (CEO i klient — codzienny ruch). Zapis przez sesję
// (RLS: klient insert wyłącznie out/human do własnej skrzynki), dostarczenie
// przez integracje kanału (server-side). Wynik dostarczenia wraca do UI:
// jeśli kanał nie jest wpięty (sent:false), inbox mówi to wprost.
export async function sendReply(conversationId: string, body: string): Promise<SendReplyResult> {
  const tresc = body.trim();
  if (!tresc) throw new Error('Wpisz treść odpowiedzi.');

  let conversation: Conversation | null;
  if (!isSupabaseConfigured()) {
    conversation = demoStore.getConversation(conversationId);
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .maybeSingle();
    conversation = data as Conversation | null;
  }
  if (!conversation) throw new Error('Rozmowa nie istnieje.');

  let message: Message;
  if (!isSupabaseConfigured()) {
    message = await appendMessage(conversation, { direction: 'out', body: tresc, author: 'human' });
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        owner_contact_id: conversation.owner_contact_id,
        direction: 'out',
        channel: conversation.channel,
        body: tresc,
        media: [],
        author: 'human',
      })
      .select('*')
      .single();
    if (error) throw new Error(`Nie udało się zapisać odpowiedzi: ${error.message}`);
    message = data as Message;
    await supabase
      .from('conversations')
      .update({ last_msg_at: message.created_at })
      .eq('id', conversation.id);
  }

  const firma = await getFirmaName(conversation.owner_contact_id);
  const delivery = await deliverMessage(conversation, tresc, firma);

  revalidatePath('/rozmowy');
  return { message, delivery };
}

// OPERATOR-FIRST: włączanie/wyłączanie bota per rozmowa = konfiguracja
// automatyzacji → WYŁĄCZNIE operator (CEO). W DB pilnuje tego też trigger.
export async function toggleAiAuto(conversationId: string, enabled: boolean): Promise<string> {
  const role = await sessionRole();
  if (role !== 'ceo') {
    throw new Error('Obsługę AI konfiguruje opiekun STRONEVO — napisz, a ustawimy to od ręki.');
  }

  if (!isSupabaseConfigured()) {
    demoStore.updateConversation(conversationId, { ai_auto: enabled });
  } else {
    const supabase = await createClient();
    const { error } = await supabase
      .from('conversations')
      .update({ ai_auto: enabled })
      .eq('id', conversationId);
    if (error) throw new Error(`Nie udało się zapisać: ${error.message}`);
  }
  revalidatePath('/rozmowy');
  return enabled
    ? 'Bot AI włączony — przychodzące w tym wątku obsługuje automat (z eskalacją do człowieka).'
    : 'Bot AI wyłączony — wątek obsługuje człowiek.';
}

export async function setConversationStatus(
  conversationId: string,
  status: ConversationStatus
): Promise<void> {
  if (!isSupabaseConfigured()) {
    demoStore.updateConversation(conversationId, { status });
  } else {
    const supabase = await createClient();
    const { error } = await supabase
      .from('conversations')
      .update({ status })
      .eq('id', conversationId);
    if (error) throw new Error(`Nie udało się zmienić statusu: ${error.message}`);
  }
  revalidatePath('/rozmowy');
}

export interface AiDraftResult {
  draft: string | null;
  action: 'odpowiedz' | 'eskalacja';
  powod: string;
  zrodla: string[];
}

// Szkic odpowiedzi AI do wklejenia w pole (narzędzie OPERATORA — nie klienta)
export async function aiDraft(conversationId: string): Promise<AiDraftResult> {
  const role = await sessionRole();
  if (role === 'klient') {
    throw new Error('Szkice AI przygotowuje opiekun STRONEVO.');
  }
  const result = await runConversationAi(conversationId, { send: false });
  return {
    draft: result.decision.reply,
    action: result.decision.action,
    powod: result.decision.powod,
    zrodla: result.decision.zrodla,
  };
}

export async function listTemplates(ownerContactId?: string): Promise<MessageTemplate[]> {
  if (!isSupabaseConfigured()) return demoStore.listMessageTemplates(ownerContactId ?? undefined);
  const supabase = await createClient(); // RLS: globalne + własne
  const { data } = await supabase.from('message_templates').select('*').order('nazwa');
  return (data ?? []) as MessageTemplate[];
}
