-- STRONEVO OS — Faza 4: control plane agentów (kolejka build, agent_runs,
-- self-healing powiadomień). Uruchomić PO 0004_dodatek_f3.sql.

-- ===== tasks: kategoria + stany buildowe =====
alter table public.tasks add column if not exists kategoria text not null default 'standard'
  check (kategoria in ('standard', 'build', 'remediation'));

-- nowe stany: zatwierdzone (po review CEO/Claude), wdrozone (po deployu)
alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check
  check (status in ('do_zrobienia', 'w_budowie', 'do_zatwierdzenia',
                    'zatwierdzone', 'wdrozone', 'gotowe'));

-- ===== agent_runs =====
create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  agent text not null default 'hermes-builder',
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  log jsonb not null default '[]'::jsonb,
  output text,
  wynik_review text check (wynik_review in
    ('oczekuje', 'zaakceptowane', 'odrzucone', 'eskalowane_claude')),
  koszt numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists agent_runs_task_idx on public.agent_runs (task_id);
create index if not exists agent_runs_status_idx on public.agent_runs (status);

-- ===== notifications: spięcie z self-healing =====
alter table public.notifications add column if not exists remediation_task_id uuid
  references public.tasks(id) on delete set null;

-- ===== RLS =====
alter table public.agent_runs enable row level security;

create policy "ceo full access agent_runs" on public.agent_runs
  for all to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo')
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo');

-- Pracownik widzi runy (kontekst zadań), bez modyfikacji
create policy "pracownik read agent_runs" on public.agent_runs
  for select to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'pracownik');

-- Endpointy /api/agent/run, /api/server/provision i self-healing w
-- /api/notifications działają przez SERVICE ROLE (wołane bez sesji) —
-- wymagany SUPABASE_SERVICE_ROLE_KEY w ENV.
