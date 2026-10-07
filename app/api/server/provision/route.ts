import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/demo-store';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';

// POST /api/server/provision — provisioning nowego serwera (playbook na VPS
// podłącza się tutaj). MOCK: tworzy rekord servers + task provisioningowy
// i zwraca plan kroków; realny playbook (Coolify + n8n + świeże agenty
// z template) raportuje postęp aktualizując status serwera.
//
// KONTRAKT I/O:
//   Autoryzacja: Authorization: Bearer <AGENT_API_TOKEN>
//                (bez ENV endpoint otwarty — tryb dev/demo)
//   Request:  { "nazwa": "Serwer 3 (klienci-B)", "host": "vps3.stronevo.pl",
//               "port": 22, "n8n_url": "https://n8n3.stronevo.pl" }  // port/n8n_url opcjonalne
//   Response: 201 { "server_id": "srv-102", "status": "provisioning",
//                   "kroki": [ ...plan playbooka... ] }
//   Błędy:    400 (brak nazwa/host), 401 (token), 503 (Supabase bez service role)
export async function POST(request: NextRequest) {
  const token = process.env.AGENT_API_TOKEN;
  if (token) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${token}`) {
      return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 });
    }
  }

  let body: { nazwa?: string; host?: string; port?: number; n8n_url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowy JSON' }, { status: 400 });
  }

  if (!body.nazwa || !body.host) {
    return NextResponse.json({ error: 'Pola "nazwa" i "host" są wymagane' }, { status: 400 });
  }

  const serverRow = {
    nazwa: body.nazwa,
    host: body.host,
    port: body.port ?? 22,
    notatka: 'Serwer w provisioningu (utworzony przez /api/server/provision)',
    status: 'provisioning',
    n8n_url: body.n8n_url ?? null,
    n8n_api_key: null,
  };

  const KROKI_PLAYBOOKA = [
    '1. Bootstrap VPS: hardening SSH, firewall, docker',
    '2. Instalacja Coolify + n8n (golden template)',
    '3. Konfiguracja healthchecks + backup nocny',
    '4. Sklonowanie świeżych agentów z template (hermes-builder, hermes-fixer)',
    '5. Rejestracja n8n_api_key w panelu (robi Claude przy deployu)',
    '6. Zmiana statusu serwera na "aktywny"',
  ];

  const taskRow = {
    contact_id: null,
    typ: `Provisioning serwera: ${body.nazwa} (${body.host})`,
    kategoria: 'build' as const,
    wykonawca: 'agent' as const,
    status: 'w_budowie' as const,
    diff: KROKI_PLAYBOOKA.join('\n'),
    review_status: null,
  };

  if (!isSupabaseConfigured()) {
    const server = demoStore.createServer(serverRow);
    demoStore.createTask(taskRow);
    return NextResponse.json(
      { server_id: server.id, status: 'provisioning', kroki: KROKI_PLAYBOOKA },
      { status: 201 }
    );
  }

  if (!isAdminConfigured()) {
    return NextResponse.json(
      { error: 'Brak SUPABASE_SERVICE_ROLE_KEY — endpoint nieaktywny' },
      { status: 503 }
    );
  }
  const admin = createAdminClient();
  const { data: server, error } = await admin.from('servers').insert(serverRow).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await admin.from('tasks').insert(taskRow);

  return NextResponse.json(
    { server_id: server.id, status: 'provisioning', kroki: KROKI_PLAYBOOKA },
    { status: 201 }
  );
}
