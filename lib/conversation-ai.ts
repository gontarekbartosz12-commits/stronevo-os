import { callLLM, isLlmConfigured } from './llm/provider';
import {
  EMBEDDING_CONFIDENCE_MIN,
  KEYWORD_CONFIDENCE_MIN,
  ScoredDoc,
  isEmbeddingsConfigured,
} from './rag';
import { Conversation, Message } from './types';

// CONVERSATION AI (Faza 2 zaufania) — decyzja: odpowiedzieć z wiedzy firmy
// czy eskalować do człowieka. Czysta logika (bez I/O) — dane wstrzykiwane,
// persystencję robi lib/conversations-runtime.ts.
//
// Zasady (twarde):
//  - bot odpowiada WYŁĄCZNIE z dostarczonej wiedzy firmy (RAG) — nie zmyśla,
//  - prośba o kontakt/człowieka LUB niepewność → eskalacja (lead + notyfikacja),
//  - ton „usprawniamy": uprzejmie, konkretnie, bez lania wody.

export interface AiDecision {
  action: 'odpowiedz' | 'eskalacja';
  reply: string | null; // treść odpowiedzi / wiadomość przekazująca do zespołu
  powod: string;
  zrodla: string[]; // tytuły użytych dokumentów wiedzy
  engine: 'llm' | 'keyword';
  // dane leada wyciągnięte z rozmowy (przy eskalacji)
  leadTelefon: string | null;
  leadEmail: string | null;
}

const ESCALATION_RX =
  /(człowiek|konsultant|doradc|opiekun|prosz[eę] o kontakt|oddzwo|zadzwo|reklamacj|skarg|pilne|umów|umow[ii][cć])/i;

const PHONE_RX = /(\+?\d[\d\s-]{7,}\d)/;
const EMAIL_RX = /([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i;

export function extractLeadData(text: string): { telefon: string | null; email: string | null } {
  return {
    telefon: text.match(PHONE_RX)?.[1]?.replace(/\s+/g, ' ').trim() ?? null,
    email: text.match(EMAIL_RX)?.[1] ?? null,
  };
}

export interface AiInput {
  conversation: Conversation;
  firma: string; // nazwa firmy-właściciela skrzynki
  history: Message[]; // ostatnie wiadomości (chronologicznie)
  incoming: string; // treść przychodzącej
  docs: ScoredDoc[]; // wynik RAG dla incoming
}

export async function decideAiReply(input: AiInput): Promise<AiDecision> {
  const lead = extractLeadData(input.incoming);
  const wantsHuman = ESCALATION_RX.test(input.incoming);

  // LLM skonfigurowany → pełna odpowiedź z kontekstem RAG (JSON-decyzja)
  if (isLlmConfigured()) {
    const decision = await llmDecision(input, wantsHuman);
    if (decision) return { ...decision, leadTelefon: lead.telefon, leadEmail: lead.email };
    // LLM padł / nie sparsował się → bezpiecznie eskalujemy (nigdy nie zmyślamy)
    return escalation(input, 'LLM niedostępny — bezpieczna eskalacja', lead);
  }

  // ===== Tryb bez LLM (demo / brak kluczy): deterministycznie z wiedzy =====
  if (wantsHuman) {
    return escalation(input, 'Rozmówca prosi o kontakt z człowiekiem', lead);
  }

  const confident =
    input.docs.length > 0 &&
    input.docs[0].score >= (isEmbeddingsConfigured() ? EMBEDDING_CONFIDENCE_MIN : KEYWORD_CONFIDENCE_MIN);

  if (!confident) {
    return escalation(input, 'Brak pewnej odpowiedzi w bazie wiedzy', lead);
  }

  const top = input.docs[0];
  return {
    action: 'odpowiedz',
    reply: `Dzień dobry! ${top.snippet} W razie dodatkowych pytań — jestem do dyspozycji, a na życzenie połączę z zespołem ${input.firma}.`,
    powod: `Dopasowano wiedzę: ${top.doc.tytul}`,
    zrodla: input.docs.map((d) => d.doc.tytul),
    engine: 'keyword',
    leadTelefon: lead.telefon,
    leadEmail: lead.email,
  };
}

function escalation(
  input: AiInput,
  powod: string,
  lead: { telefon: string | null; email: string | null }
): AiDecision {
  return {
    action: 'eskalacja',
    reply: `Dziękuję za wiadomość! Przekazuję rozmowę do zespołu ${input.firma} — odezwiemy się najszybciej, jak to możliwe.${lead.telefon || input.conversation.external.telefon ? '' : ' Jeśli wygodniej Panu/Pani telefonicznie, proszę zostawić numer.'}`,
    powod,
    zrodla: [],
    engine: isLlmConfigured() ? 'llm' : 'keyword',
    leadTelefon: lead.telefon,
    leadEmail: lead.email,
  };
}

async function llmDecision(
  input: AiInput,
  wantsHuman: boolean
): Promise<Omit<AiDecision, 'leadTelefon' | 'leadEmail'> | null> {
  const kontekst =
    input.docs.length > 0
      ? input.docs
          .map((d) => `### ${d.doc.tytul}\n${d.doc.tresc.slice(0, 1500)}`)
          .join('\n\n')
      : '(brak dopasowanych dokumentów)';
  const historia = input.history
    .slice(-8)
    .map((m) => `${m.direction === 'in' ? 'KLIENT' : m.author === 'ai' ? 'BOT' : 'ZESPÓŁ'}: ${m.body}`)
    .join('\n');

  const res = await callLLM({
    system: `Jesteś asystentem AI firmy "${input.firma}" w skrzynce rozmów (kanał: ${input.conversation.channel}). Odpowiadasz po polsku, uprzejmie i KONKRETNIE, wyłącznie na podstawie WIEDZY FIRMY poniżej. Zasady twarde: (1) jeśli wiedza nie zawiera odpowiedzi — action "eskalacja", nigdy nie zmyślaj cen/terminów; (2) jeśli rozmówca prosi o kontakt/człowieka lub podaje telefon/e-mail — action "eskalacja" z uprzejmym potwierdzeniem; (3) zero tonu ocennego. Zwróć WYŁĄCZNIE JSON: {"action":"odpowiedz"|"eskalacja","reply":"treść wiadomości do klienta","powod":"krótko dlaczego"}.`,
    prompt: `WIEDZA FIRMY:\n${kontekst}\n\nHISTORIA ROZMOWY:\n${historia}\n\nNOWA WIADOMOŚĆ KLIENTA:\n${input.incoming}\n\n${wantsHuman ? 'UWAGA: wiadomość wygląda na prośbę o kontakt z człowiekiem.' : ''}\nJSON:`,
    maxTokens: 500,
  });
  if (res.provider === 'mock') return null;

  try {
    const jsonStr = res.text.slice(res.text.indexOf('{'), res.text.lastIndexOf('}') + 1);
    const parsed = JSON.parse(jsonStr) as { action?: string; reply?: string; powod?: string };
    if (parsed.action !== 'odpowiedz' && parsed.action !== 'eskalacja') return null;
    return {
      action: parsed.action,
      reply: parsed.reply ?? null,
      powod: parsed.powod ?? 'decyzja LLM',
      zrodla: input.docs.map((d) => d.doc.tytul),
      engine: 'llm',
    };
  } catch {
    return null;
  }
}
