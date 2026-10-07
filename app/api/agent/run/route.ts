import { NextRequest, NextResponse } from 'next/server';
import { startAgentRun } from '@/lib/agent-runner';

// POST /api/agent/run — uruchomienie agenta (Hermes na VPS podłącza się tutaj).
// MOCK: tworzy agent_run(running) i symuluje pracę (lazy completion ~45 s).
//
// KONTRAKT I/O:
//   Autoryzacja: Authorization: Bearer <AGENT_API_TOKEN>
//                (bez ENV endpoint otwarty — tryb dev/demo)
//   Request:  { "task_id": "t-123", "agent": "hermes-builder" }   // agent opcjonalny
//   Response: 201 { "run_id": "run-101", "task_id": "t-123",
//                   "agent": "hermes-builder", "status": "running" }
//   Błędy:    400 (brak task_id / zły JSON), 401 (token), 404 (task nie istnieje)
//
// Realny runner (Hermes) po podłączeniu: odbiera run_id, wykonuje pracę,
// raportuje kroki/output aktualizując agent_runs — deploy NIGDY sam
// (wymaga zatwierdzenia w panelu: "Zatwierdź → deploy").
export async function POST(request: NextRequest) {
  const token = process.env.AGENT_API_TOKEN;
  if (token) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${token}`) {
      return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 });
    }
  }

  let body: { task_id?: string; agent?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 });
  }

  if (!body.task_id || typeof body.task_id !== 'string') {
    return NextResponse.json({ error: 'Pole "task_id" jest wymagane' }, { status: 400 });
  }

  try {
    const run = await startAgentRun(body.task_id, body.agent ?? 'hermes-builder');
    return NextResponse.json(
      { run_id: run.id, task_id: run.task_id, agent: run.agent, status: run.status },
      { status: 201 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Błąd uruchamiania agenta';
    const status = msg.includes('nie istnieje') ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
