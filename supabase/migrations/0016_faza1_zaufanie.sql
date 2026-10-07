-- STRONEVO OS — FAZA 1 „Warstwa zaufania operacyjnego".
-- A. workflow_errors (zdrowie floty: błędy z globalnego Error-Workflow n8n)
-- B. uptime_checks + uptime_pings (dostępność endpointów wdrożeń)
-- C. client_credentials: RLS dla klienta (krokowy intake dostępów w /klient)
-- D. template_versions + client_automations.template_version (rejestr wersji)
-- Zapis z zewnątrz (n8n/cron) = WYŁĄCZNIE service role. Uruchomić PO 0015.

-- ===== A. workflow_errors — źródło prawdy o błędach wdrożeń =====

create table if not exists public.workflow_errors (
  id uuid primary key default gen_random_uuid(),
  client_automation_id uuid references public.client_automations(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete cascade,
  workflow_id text,
  node text,
  message text not null,
  severity text not null default 'warn' check (severity in ('info', 'warn', 'krytyczne')),
  status text not null default 'nowy' check (status in ('nowy', 'w_toku', 'rozwiazany')),
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists workflow_errors_ca_idx on public.workflow_errors(client_automation_id);
create index if not exists workflow_errors_status_idx on public.workflow_errors(status);
create index if not exists workflow_errors_created_idx on public.workflow_errors(created_at desc);

alter table public.workflow_errors enable row level security;

-- CEO: pełny dostęp (przegląd + zmiana statusu nowy/w_toku/rozwiazany)
drop policy if exists "ceo full access workflow_errors" on public.workflow_errors;
create policy "ceo full access workflow_errors" on public.workflow_errors
  for all to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo')
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo');

-- Pracownik: odczyt (naprawia w ramach zadań remediation)
drop policy if exists "pracownik read workflow_errors" on public.workflow_errors;
create policy "pracownik read workflow_errors" on public.workflow_errors
  for select to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'pracownik');

-- INSERT: brak polityki dla authenticated — zapis WYŁĄCZNIE service role
-- (/api/errors/ingest za kluczem ERRORS_INGEST_KEY). Klient NIE widzi surowych
-- błędów technicznych (ton „usprawniamy" — klient dostaje dostępność, nie stacktrace).

-- ===== B. uptime_checks + uptime_pings — dostępność wdrożeń =====

create table if not exists public.uptime_checks (
  id uuid primary key default gen_random_uuid(),
  client_automation_id uuid references public.client_automations(id) on delete set null,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  nazwa text not null,
  url text not null,
  method text not null default 'GET' check (method in ('GET', 'HEAD', 'POST')),
  expected_status int not null default 200,
  interval_min int not null default 5,
  aktywny boolean not null default true,
  last_check_at timestamptz,
  last_status int,
  ok boolean, -- null = jeszcze nie sprawdzone
  created_at timestamptz not null default now()
);

create index if not exists uptime_checks_contact_idx on public.uptime_checks(contact_id);

-- Historia pingów — z niej liczy się „dostępność 99,x% w tym miesiącu"
create table if not exists public.uptime_pings (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references public.uptime_checks(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  ok boolean not null,
  status int,
  ms int,
  checked_at timestamptz not null default now()
);

create index if not exists uptime_pings_check_idx on public.uptime_pings(check_id, checked_at desc);
create index if not exists uptime_pings_contact_idx on public.uptime_pings(contact_id, checked_at desc);

alter table public.uptime_checks enable row level security;
alter table public.uptime_pings enable row level security;

drop policy if exists "ceo full access uptime_checks" on public.uptime_checks;
create policy "ceo full access uptime_checks" on public.uptime_checks
  for all to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo')
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo');

-- Klient: widzi dostępność WYŁĄCZNIE swoich usług (widżet w /klient)
drop policy if exists "klient read own uptime_checks" on public.uptime_checks;
create policy "klient read own uptime_checks" on public.uptime_checks
  for select to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and contact_id = public.jwt_contact_id()
  );

drop policy if exists "ceo full access uptime_pings" on public.uptime_pings;
create policy "ceo full access uptime_pings" on public.uptime_pings
  for all to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo')
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo');

drop policy if exists "klient read own uptime_pings" on public.uptime_pings;
create policy "klient read own uptime_pings" on public.uptime_pings
  for select to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and contact_id = public.jwt_contact_id()
  );

-- Pingi zapisuje WYŁĄCZNIE cron /api/uptime/run (service role).

-- ===== C. client_credentials — krokowy intake w /klient =====
-- Klient czyta i uzupełnia WYŁĄCZNIE własne dostępy. Plaintext wartości nigdy
-- nie wraca do UI klienta (maskowanie w warstwie akcji, server-side).

drop policy if exists "klient read own client_credentials" on public.client_credentials;
create policy "klient read own client_credentials" on public.client_credentials
  for select to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and contact_id = public.jwt_contact_id()
  );

drop policy if exists "klient update own client_credentials" on public.client_credentials;
create policy "klient update own client_credentials" on public.client_credentials
  for update to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and contact_id = public.jwt_contact_id()
  )
  with check (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and contact_id = public.jwt_contact_id()
  );

-- ===== D. template_versions — rejestr wersji szablonów =====

create table if not exists public.template_versions (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid references public.automations_catalog(id) on delete set null,
  nazwa text not null,       -- np. 'chatbot-rag'
  wersja text not null,      -- np. '1.2.0'
  opis text,
  n8n_json_ref text,         -- ścieżka/URL do golden-template JSON
  created_at timestamptz not null default now(),
  unique (nazwa, wersja)
);

alter table public.template_versions enable row level security;

drop policy if exists "ceo full access template_versions" on public.template_versions;
create policy "ceo full access template_versions" on public.template_versions
  for all to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo')
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo');

drop policy if exists "pracownik read template_versions" on public.template_versions;
create policy "pracownik read template_versions" on public.template_versions
  for select to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'pracownik');

-- Która wersja szablonu stoi u klienta (widok w /agenci)
alter table public.client_automations
  add column if not exists template_version text;

-- Seed rejestru (wersje startowe golden-templates)
insert into public.template_versions (nazwa, wersja, opis, n8n_json_ref) values
  ('recepcja-ai',  '2.1.0', 'Recepcja AI: Vapi + Cal.com + SMS potwierdzenia; poprawka slotów przy kolizji', 'templates/recepcja-ai-2.1.0.json'),
  ('chatbot-rag',  '1.2.0', 'Chatbot RAG: pgvector + Claude; leady po godzinach → e-mail + event', 'templates/chatbot-rag-1.2.0.json'),
  ('opinie-ai',    '1.0.3', 'Opinie: monitor Google Business + SMS prośba po usłudze', 'templates/opinie-ai-1.0.3.json'),
  ('n8n-custom',   '1.0.0', 'Baza pod dedykowane workflow (error handler + event ingest wpięte)', 'templates/n8n-custom-1.0.0.json')
on conflict (nazwa, wersja) do nothing;
