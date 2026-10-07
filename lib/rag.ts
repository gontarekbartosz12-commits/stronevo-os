import { KnowledgeDoc } from './types';

// RAG — wyszukiwanie w bazie wiedzy firmy (Conversation AI, Faza 2 zaufania).
//
// Embeddingi: ENV EMBEDDINGS_BASE_URL (OpenAI-compatible, root BEZ /v1)
//             + EMBEDDINGS_KEY + EMBEDDINGS_MODEL (default text-embedding-3-small,
//             1536 dim — zgodnie z vector(1536) w 0017).
// Bez konfiguracji lub w trybie demo: uczciwy fallback — scoring słów kluczowych
// (deterministyczny, bez sieci). Bot NADAL odpowiada z wiedzy firmy.

export function isEmbeddingsConfigured(): boolean {
  return Boolean(process.env.EMBEDDINGS_BASE_URL || process.env.EMBEDDINGS_KEY);
}

export async function embedText(text: string): Promise<number[] | null> {
  if (!isEmbeddingsConfigured()) return null;
  const base = (process.env.EMBEDDINGS_BASE_URL ?? 'https://api.openai.com').replace(/\/$/, '');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.EMBEDDINGS_KEY) headers.Authorization = `Bearer ${process.env.EMBEDDINGS_KEY}`;
  try {
    const res = await fetch(`${base}/v1/embeddings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: process.env.EMBEDDINGS_MODEL ?? 'text-embedding-3-small',
        input: text.slice(0, 8000),
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

// ===== Fallback: scoring słów kluczowych (demo / brak embeddingów) =====

const STOPWORDS = new Set([
  'i', 'w', 'z', 'na', 'do', 'o', 'a', 'to', 'czy', 'jak', 'co', 'sie', 'się',
  'jest', 'są', 'the', 'dzień', 'dobry', 'proszę', 'dziękuję', 'was', 'u', 'mi',
  'mnie', 'pan', 'pani', 'państwa', 'oraz', 'lub', 'dla', 'od', 'po', 'za', 'ile',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-ząćęłńóśźż0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

export interface ScoredDoc {
  doc: Pick<KnowledgeDoc, 'id' | 'tytul' | 'tresc'>;
  score: number; // keyword: liczba trafień; embeddingi: similarity 0-1
  snippet: string;
}

// Zdanie z dokumentu z największą liczbą trafionych termów — do odpowiedzi bota
function bestSnippet(tresc: string, terms: string[]): string {
  const sentences = tresc.split(/(?<=[.!?])\s+|\n+/).filter((s) => s.trim().length > 0);
  let best = sentences[0] ?? tresc.slice(0, 200);
  let bestHits = -1;
  for (const s of sentences) {
    const low = s.toLowerCase();
    const hits = terms.filter((t) => low.includes(t)).length;
    if (hits > bestHits) {
      bestHits = hits;
      best = s;
    }
  }
  return best.trim().slice(0, 320);
}

export function keywordSearch(
  docs: Pick<KnowledgeDoc, 'id' | 'tytul' | 'tresc'>[],
  query: string,
  k = 3
): ScoredDoc[] {
  const terms = [...new Set(tokenize(query))];
  if (terms.length === 0) return [];

  return docs
    .map((doc) => {
      const hay = `${doc.tytul} ${doc.tresc}`.toLowerCase();
      // prefiksowe dopasowanie łagodzi polską fleksję (gaśnic/gaśnice/gaśnicy)
      const score = terms.filter((t) => hay.includes(t) || hay.includes(t.slice(0, Math.max(4, t.length - 2)))).length;
      return { doc, score, snippet: bestSnippet(doc.tresc, terms) };
    })
    .filter((s) => s.score >= 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

// Minimalny score, od którego uznajemy, że wiedza firmy ODPOWIADA na pytanie
// (poniżej = eskalacja do człowieka — bot nie zmyśla)
export const KEYWORD_CONFIDENCE_MIN = 2;
export const EMBEDDING_CONFIDENCE_MIN = 0.4;
