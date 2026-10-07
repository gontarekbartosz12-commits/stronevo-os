import { CallRecord, IntegrationResult } from '@/lib/types';

// Połączenia obsłużone przez Adę (Vapi) i chatbota — dane do live dashboardu.
// STUB: bez VAPI_API_KEY generuje realistyczny, deterministyczny mock
// (ostatnie ~48h, część połączeń celowo po godzinach — to sedno Ekranu Kasy).
// Live: Vapi GET /call + webhooki n8n; mapowanie asystent→klient przy deployu.

// Deterministyczny pseudo-random (stabilny między renderami/pollingiem,
// bez Math.random — mock nie może "skakać" przy odświeżeniach)
function seededRand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function mockCalls(clientId: string): CallRecord[] {
  const seed = [...clientId].reduce((sum, ch) => sum + ch.charCodeAt(0), 7);
  const rand = seededRand(seed);
  const calls: CallRecord[] = [];

  const now = new Date();
  const todayBase = new Date(now);
  todayBase.setHours(0, 0, 0, 0);

  // ~4-6 połączeń dziennie przez 14 dni (dane pod live dashboard,
  // Ekran Kasy i Kalendarz Kasy), godziny 8:00–21:59
  for (let day = 0; day < 14; day++) {
    const perDay = 3 + Math.floor(rand() * 4);
    for (let i = 0; i < perDay; i++) {
      // rozkład z naciskiem na wieczory — po godzinach ma być co pokazać
      const hour = 8 + Math.floor(rand() * 14); // 8..21
      const minute = Math.floor(rand() * 60);
      const czas = new Date(todayBase);
      czas.setDate(czas.getDate() - day);
      czas.setHours(hour, minute, 0, 0);
      if (czas > now) continue;

      const num = `+48 ${600 + Math.floor(rand() * 300)} ${String(
        Math.floor(rand() * 900) + 100
      )} ${String(Math.floor(rand() * 900) + 100)}`;

      calls.push({
        id: `call-${clientId}-${day}-${i}`,
        numer: num,
        czas: czas.toISOString(),
        // Ada umawia skutecznie także wieczorem — to jest puenta dashboardu
        wynik: rand() < 0.45 ? 'umowiono' : 'nieumowiono',
        zrodlo: rand() < 0.7 ? 'ada' : 'chatbot',
      });
    }
  }

  return calls.sort((a, b) => b.czas.localeCompare(a.czas));
}

export async function getCalls(clientId: string): Promise<IntegrationResult<CallRecord[]>> {
  const apiKey = process.env.VAPI_API_KEY;

  if (!apiKey) {
    return { source: 'mock', data: mockCalls(clientId) };
  }

  try {
    // TODO(deploy): filtr per klient — assistantId z client_automations
    // (metadata clientId w asystencie Vapi) zamiast pobierania wszystkiego.
    const res = await fetch('https://api.vapi.ai/call?limit=100', {
      headers: { Authorization: `Bearer ${apiKey}` },
      next: { revalidate: 15 },
    });
    if (!res.ok) throw new Error(`Vapi: HTTP ${res.status}`);
    const json = await res.json();

    const data: CallRecord[] = (Array.isArray(json) ? json : [])
      .filter((c: { metadata?: { clientId?: string } }) => c.metadata?.clientId === clientId)
      .map(
        (c: {
          id: string;
          customer?: { number?: string };
          startedAt?: string;
          analysis?: { successEvaluation?: string };
        }) => ({
          id: c.id,
          numer: c.customer?.number ?? 'nieznany',
          czas: c.startedAt ?? new Date().toISOString(),
          wynik: c.analysis?.successEvaluation === 'true' ? 'umowiono' : 'nieumowiono',
          zrodlo: 'ada' as const,
        })
      );
    return { source: 'live', data };
  } catch {
    return { source: 'mock', data: mockCalls(clientId) };
  }
}
