import { IntegrationResult, N8nWorkflow, Server } from '@/lib/types';

const MOCK_WORKFLOWS: N8nWorkflow[] = [
  {
    id: 'wf-1',
    nazwa: 'Chatbot RAG — Mercatura',
    klient: 'Mercatura',
    aktywny: true,
    ostatniStatus: 'success',
    ostatnieUruchomienie: '2026-07-03T06:41:00Z',
  },
  {
    id: 'wf-2',
    nazwa: 'Lead intake — stronevo.pl /wycena/',
    klient: 'STRONEVO (wewn.)',
    aktywny: true,
    ostatniStatus: 'success',
    ostatnieUruchomienie: '2026-07-02T19:12:00Z',
  },
  {
    id: 'wf-3',
    nazwa: 'Rezerwacje Cal.com → SMS przypomnienie',
    klient: 'Klinika Uśmiech',
    aktywny: true,
    ostatniStatus: 'waiting',
    ostatnieUruchomienie: '2026-07-01T08:00:00Z',
  },
  {
    id: 'wf-4',
    nazwa: 'trends_scout — daily report',
    klient: 'STRONEVO (wewn.)',
    aktywny: true,
    ostatniStatus: 'success',
    ostatnieUruchomienie: '2026-07-03T06:00:00Z',
  },
  {
    id: 'wf-5',
    nazwa: 'Backup vault → storage (nocny)',
    klient: 'STRONEVO (wewn.)',
    aktywny: true,
    ostatniStatus: 'error',
    ostatnieUruchomienie: '2026-07-03T02:00:00Z',
  },
  {
    id: 'wf-6',
    nazwa: 'Faktury — przypomnienia o płatności',
    klient: null,
    aktywny: false,
    ostatniStatus: 'unknown',
    ostatnieUruchomienie: null,
  },
];

// Mock dla serwerów innych niż główny — świeży VPS z podstawą monitoringu
const MOCK_WORKFLOWS_SECONDARY: N8nWorkflow[] = [
  {
    id: 'wfx-1',
    nazwa: 'Healthcheck ping — nowy serwer',
    klient: 'STRONEVO (wewn.)',
    aktywny: true,
    ostatniStatus: 'success',
    ostatnieUruchomienie: '2026-07-03T07:00:00Z',
  },
  {
    id: 'wfx-2',
    nazwa: 'Golden template — do sklonowania per klient',
    klient: null,
    aktywny: false,
    ostatniStatus: 'unknown',
    ostatnieUruchomienie: null,
  },
];

// Lista workflowów z n8n (REST API v1).
// Multi-VPS (Faza 3): serwer z własnym n8n_url/n8n_api_key odpytuje SWOJĄ
// instancję; bez tych pól używany jest globalny ENV; bez niczego — mock.
export async function getN8nWorkflows(
  server?: Server
): Promise<IntegrationResult<N8nWorkflow[]>> {
  const baseUrl = server?.n8n_url || process.env.N8N_BASE_URL;
  const apiKey = server?.n8n_api_key || process.env.N8N_API_KEY;
  const mock = server && server.id !== 'srv-1' ? MOCK_WORKFLOWS_SECONDARY : MOCK_WORKFLOWS;

  if (!baseUrl || !apiKey) {
    return { source: 'mock', data: mock };
  }

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1/workflows?limit=100`, {
      headers: { 'X-N8N-API-KEY': apiKey },
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`n8n API: HTTP ${res.status}`);
    const json = await res.json();

    const data: N8nWorkflow[] = (json.data ?? []).map(
      (wf: { id: string; name: string; active: boolean; updatedAt?: string; tags?: { name: string }[] }) => ({
        id: String(wf.id),
        nazwa: wf.name,
        // Konwencja: tag "klient:Nazwa" w n8n przypisuje workflow do klienta
        klient:
          wf.tags?.find((t) => t.name.startsWith('klient:'))?.name.replace('klient:', '') ?? null,
        aktywny: wf.active,
        ostatniStatus: 'unknown' as const,
        ostatnieUruchomienie: wf.updatedAt ?? null,
      })
    );
    return { source: 'live', data };
  } catch {
    return { source: 'mock', data: mock };
  }
}

// Utworzenie workflow w n8n (REST API v1) — używane przez agenta-buildera
// (Level 2). Workflow powstaje jako NIEAKTYWNY draft do review CEO/Claude.
// Bez klucza n8n zwraca ok:false (control plane nie wdraża w próżnię).
export async function createN8nWorkflow(
  name: string,
  nodes: unknown[],
  connections: Record<string, unknown>,
  opts?: { baseUrl?: string; apiKey?: string }
): Promise<{ ok: boolean; id?: string; url?: string; error?: string }> {
  const baseUrl = opts?.baseUrl || process.env.N8N_BASE_URL;
  const apiKey = opts?.apiKey || process.env.N8N_API_KEY;
  if (!baseUrl || !apiKey) return { ok: false, error: 'Brak N8N_BASE_URL / N8N_API_KEY' };
  const root = baseUrl.replace(/\/$/, '');
  try {
    const res = await fetch(`${root}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'X-N8N-API-KEY': apiKey, 'Content-Type': 'application/json' },
      // active pomijamy — n8n tworzy workflow jako nieaktywny (bramka review)
      body: JSON.stringify({ name, nodes, connections, settings: {} }),
    });
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, error: `n8n HTTP ${res.status}: ${t.slice(0, 240)}` };
    }
    const json = await res.json();
    const id = String(json.id ?? '');
    return { ok: true, id, url: `${root}/workflow/${id}` };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 200) };
  }
}

// ===== Golden-template: klon zamiast budowy od zera =====
// Spec (FABLE-BRIEF §9): "golden template n8n per usługa → klon per klient".
// Klon = pobranie DZIAŁAJĄCEGO szablonu z n8n + utworzenie kopii jako draft.
// To daje workflow, który FAKTYCZNIE działa (bo szablon działa), zamiast
// szkieletu z placeholderami wygenerowanego przez LLM.

interface N8nWorkflowDetail {
  id: string;
  name: string;
  nodes: unknown[];
  connections: Record<string, unknown>;
  tags?: { name: string }[];
}

// Słowa-klucze dopasowujące golden-template do typu usługi z katalogu.
const TEMPLATE_KEYWORDS: Record<string, string[]> = {
  recepcja: ['sekretarka', 'głosowa', 'glosowa', 'recepcja', 'voice', 'ada', 'kalendarz', 'rezerwacj'],
  chatbot: ['chatbot', 'rag', 'asystent', 'widget', 'wiedzy', 'rezerwacj'],
  opinie: ['opinie', 'opinia', 'review', 'google business', 'reputacj'],
  n8n: ['lead', 'engine', 'automatyzacj'],
  strona: ['strona', 'landing', 'lead'],
  pakiet: ['chatbot', 'rag', 'recepcja', 'sekretarka'],
};

async function n8nCreds(opts?: { baseUrl?: string; apiKey?: string }) {
  const baseUrl = opts?.baseUrl || process.env.N8N_BASE_URL;
  const apiKey = opts?.apiKey || process.env.N8N_API_KEY;
  return { root: baseUrl?.replace(/\/$/, ''), apiKey };
}

// Tag oznaczający KANONICZNY golden-template (kuracja operatora).
// Gdy w n8n są workflowy z tym tagiem — klon celuje WYŁĄCZNIE w nie
// (deterministycznie), zamiast rozmytego dopasowania po nazwie do
// przypadkowego/eksperymentalnego workflowa.
export const GOLDEN_TEMPLATE_TAG = 'golden-template';

// Wybiera najlepszy golden-template dla danego typu usługi z żywego n8n.
// Kolejność: (1) preferuj workflowy otagowane `golden-template`; (2) dopiero
// gdy żaden nie istnieje — fallback do rozmytego dopasowania po nazwie.
// Zawsze pomija drafty agenta i workflowy przypisane do klienta (tag klient:).
export async function resolveGoldenTemplate(
  automationType: string,
  opts?: { baseUrl?: string; apiKey?: string }
): Promise<{ id: string; name: string } | null> {
  const { root, apiKey } = await n8nCreds(opts);
  if (!root || !apiKey) return null;
  const keywords = TEMPLATE_KEYWORDS[automationType] ?? [];
  if (keywords.length === 0) return null;

  try {
    const res = await fetch(`${root}/api/v1/workflows?limit=100`, {
      headers: { 'X-N8N-API-KEY': apiKey },
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const json = await res.json();

    type Wf = { id: string; name: string; tags?: { name: string }[] };
    const all = (json.data ?? []) as Wf[];
    // Eligible = nie draft agenta i nie instancja konkretnego klienta.
    const eligible = all.filter((wf) => {
      const name = (wf.name || '').toLowerCase();
      if (name.includes('[agent draft]')) return false;
      if (wf.tags?.some((t) => t.name.startsWith('klient:'))) return false;
      return true;
    });
    // Pula: jeśli są oznaczone golden-template — TYLKO one (kuracja); inaczej wszystkie.
    const tagged = eligible.filter((wf) => wf.tags?.some((t) => t.name === GOLDEN_TEMPLATE_TAG));
    const pool = tagged.length > 0 ? tagged : eligible;

    const candidates: { id: string; name: string; score: number }[] = [];
    for (const wf of pool) {
      const name = (wf.name || '').toLowerCase();
      const score = keywords.reduce((s, k) => (name.includes(k) ? s + 1 : s), 0);
      if (score > 0) candidates.push({ id: String(wf.id), name: wf.name, score });
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.score - a.score);
    return { id: candidates[0].id, name: candidates[0].name };
  } catch {
    return null;
  }
}

// Klonuje istniejący workflow (golden-template) jako NIEAKTYWNY draft do review.
export async function cloneN8nWorkflow(
  templateId: string,
  newName: string,
  opts?: { baseUrl?: string; apiKey?: string }
): Promise<{ ok: boolean; id?: string; url?: string; error?: string; nodeCount?: number }> {
  const { root, apiKey } = await n8nCreds(opts);
  if (!root || !apiKey) return { ok: false, error: 'Brak N8N_BASE_URL / N8N_API_KEY' };
  try {
    const getRes = await fetch(`${root}/api/v1/workflows/${templateId}`, {
      headers: { 'X-N8N-API-KEY': apiKey },
    });
    if (!getRes.ok) return { ok: false, error: `Pobranie szablonu HTTP ${getRes.status}` };
    const tpl = (await getRes.json()) as N8nWorkflowDetail;

    const postRes = await fetch(`${root}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'X-N8N-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newName,
        nodes: tpl.nodes ?? [],
        connections: tpl.connections ?? {},
        settings: {},
      }),
    });
    if (!postRes.ok) {
      const t = await postRes.text();
      return { ok: false, error: `Klon HTTP ${postRes.status}: ${t.slice(0, 200)}` };
    }
    const json = await postRes.json();
    const id = String(json.id ?? '');
    return {
      ok: true,
      id,
      url: `${root}/workflow/${id}`,
      nodeCount: Array.isArray(tpl.nodes) ? tpl.nodes.length : 0,
    };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 200) };
  }
}

// Taguje workflow tagiem `klient:{Nazwa}` — dashboard CEO (getN8nWorkflows)
// grupuje po tym tagu, więc od razu widać, do którego klienta należy workflow.
// Tworzy tag jeśli nie istnieje. Best-effort: błąd tagowania nie wywraca klonu.
export async function tagWorkflowForClient(
  workflowId: string,
  clientName: string,
  opts?: { baseUrl?: string; apiKey?: string }
): Promise<{ ok: boolean; error?: string }> {
  const { root, apiKey } = await n8nCreds(opts);
  if (!root || !apiKey) return { ok: false, error: 'Brak N8N kluczy' };
  const tagName = `klient:${clientName}`.slice(0, 60);
  const headers = { 'X-N8N-API-KEY': apiKey, 'Content-Type': 'application/json' };
  try {
    // 1. Znajdź istniejący tag
    let tagId: string | null = null;
    const listRes = await fetch(`${root}/api/v1/tags?limit=250`, { headers });
    if (listRes.ok) {
      const list = await listRes.json();
      const found = (list.data ?? []).find((t: { id: string; name: string }) => t.name === tagName);
      if (found) tagId = String(found.id);
    }
    // 2. Utwórz jeśli brak
    if (!tagId) {
      const createRes = await fetch(`${root}/api/v1/tags`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: tagName }),
      });
      if (createRes.ok) {
        tagId = String((await createRes.json()).id ?? '');
      } else {
        // 409 „już istnieje" (race / 2. automatyzacja tego klienta) → odszukaj ponownie
        const reRes = await fetch(`${root}/api/v1/tags?limit=250`, { headers });
        if (reRes.ok) {
          const re = await reRes.json();
          const f = (re.data ?? []).find((t: { id: string; name: string }) => t.name === tagName);
          if (f) tagId = String(f.id);
        }
      }
    }
    if (!tagId) return { ok: false, error: 'Nie udało się utworzyć/znaleźć tagu' };
    // 3. Przypnij tag do workflowa
    const putRes = await fetch(`${root}/api/v1/workflows/${workflowId}/tags`, {
      method: 'PUT',
      headers,
      body: JSON.stringify([{ id: tagId }]),
    });
    return { ok: putRes.ok, error: putRes.ok ? undefined : `PUT tags HTTP ${putRes.status}` };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 120) };
  }
}
