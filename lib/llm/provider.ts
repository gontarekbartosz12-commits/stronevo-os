// Pluggable LLM — WSZYSTKIE wywołania AI w aplikacji idą przez ten moduł.
// Sterowanie przez ENV:
//   LLM_PROVIDER = anthropic | openai | selfhost
//   LLM_BASE_URL = baza API (dla selfhost, np. vLLM/TGI z modelem z Hugging Face;
//                  endpoint OpenAI-compatible /v1/chat/completions)
//   LLM_KEY      = klucz API (dla selfhost opcjonalny)
//   LLM_MODEL    = nazwa modelu (np. claude-sonnet-5 / gpt-4o / Bielik-11B)
// Bez konfiguracji: mock (deterministyczna odpowiedź) — appka działa bez kluczy.

export interface LlmRequest {
  system?: string;
  prompt: string;
  maxTokens?: number;
  // Nadpisanie modelu per wywołanie (np. mocniejszy model do budowania workflow
  // niż tani model do streszczeń). Bez tego używany jest LLM_MODEL z ENV.
  model?: string;
}

export interface LlmResponse {
  text: string;
  provider: 'anthropic' | 'openai' | 'selfhost' | 'mock';
  model: string;
}

function provider(): string {
  return (process.env.LLM_PROVIDER ?? '').toLowerCase();
}

export function isLlmConfigured(): boolean {
  const p = provider();
  if (p === 'anthropic' || p === 'openai') return Boolean(process.env.LLM_KEY);
  if (p === 'selfhost') return Boolean(process.env.LLM_BASE_URL);
  return false;
}

export async function callLLM(req: LlmRequest): Promise<LlmResponse> {
  const p = provider();
  const maxTokens = req.maxTokens ?? 1024;

  try {
    if (p === 'anthropic' && process.env.LLM_KEY) {
      const model = req.model ?? process.env.LLM_MODEL ?? 'claude-sonnet-5';
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.LLM_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system: req.system,
          messages: [{ role: 'user', content: req.prompt }],
        }),
      });
      if (!res.ok) throw new Error(`Anthropic: HTTP ${res.status}`);
      const json = await res.json();
      return { text: json.content?.[0]?.text ?? '', provider: 'anthropic', model };
    }

    if ((p === 'openai' && process.env.LLM_KEY) || (p === 'selfhost' && process.env.LLM_BASE_URL)) {
      // Respektuj LLM_BASE_URL także dla providera "openai" — pozwala kierować na
      // bramy OpenAI-compatible (OpenRouter, Together, własny vLLM). Kod niżej
      // dokleja /v1/chat/completions, więc LLM_BASE_URL = root BEZ /v1
      // (OpenRouter: https://openrouter.ai/api).
      const base = process.env.LLM_BASE_URL?.replace(/\/$/, '') ?? 'https://api.openai.com';
      const model = req.model ?? process.env.LLM_MODEL ?? (p === 'selfhost' ? 'default' : 'gpt-4o');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (process.env.LLM_KEY) headers.Authorization = `Bearer ${process.env.LLM_KEY}`;

      const res = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: [
            ...(req.system ? [{ role: 'system', content: req.system }] : []),
            { role: 'user', content: req.prompt },
          ],
        }),
      });
      if (!res.ok) throw new Error(`${p}: HTTP ${res.status}`);
      const json = await res.json();
      return {
        text: json.choices?.[0]?.message?.content ?? '',
        provider: p as 'openai' | 'selfhost',
        model,
      };
    }
  } catch {
    // provider padł → fallback na mock, żeby control plane nie stawał
  }

  return {
    text: `[mock LLM] ${req.prompt.slice(0, 120)}...`,
    provider: 'mock',
    model: 'mock',
  };
}
