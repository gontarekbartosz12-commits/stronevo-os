-- STRONEVO OS — PANEL WYNIKÓW (Dashboard ROI), Faza A cz. 1.
-- Źródło prawdy o wynikach wdrożeń: automation_events (zapis WYŁĄCZNIE service
-- role przez /api/events/ingest), konfiguracja wartościowania event_values,
-- zdrowie wdrożeń na client_automations, stawka zł/h per klient.
-- Uruchomić PO 0013_klient_crm_aktywnosci.sql.

-- ===== 1. automation_events — źródło prawdy o wynikach =====

create table if not exists public.automation_events (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  client_automation_id uuid references public.client_automations(id) on delete set null,
  typ text not null check (typ in (
    'rozmowa_odebrana', 'lead_zlapany', 'rezerwacja',
    'sms_wyslany', 'opinia_zebrana', 'workflow_run', 'blad'
  )),
  zrodlo text not null check (zrodlo in ('ada', 'chatbot', 'opinie', 'n8n', 'sms')),
  minuty_oszczedzone int not null default 0,
  wartosc_pln numeric(10,2) not null default 0,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists automation_events_contact_idx on public.automation_events(contact_id);
create index if not exists automation_events_created_idx on public.automation_events(created_at);
create index if not exists automation_events_typ_idx on public.automation_events(typ);

alter table public.automation_events enable row level security;

-- CEO: pełny dostęp
drop policy if exists "ceo full access automation_events" on public.automation_events;
create policy "ceo full access automation_events" on public.automation_events
  for all to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo')
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo');

-- Klient: WYŁĄCZNIE odczyt własnych zdarzeń (multi-tenant szczelny)
drop policy if exists "klient read own automation_events" on public.automation_events;
create policy "klient read own automation_events" on public.automation_events
  for select to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and contact_id = public.jwt_contact_id()
  );

-- INSERT: brak polityki insert dla authenticated poza CEO — zapis zdarzeń
-- wykonuje WYŁĄCZNIE service role (/api/events/ingest omija RLS).

-- ===== 2. event_values — konfiguracja wartościowania (minuty per typ) =====
-- Wszystkie kwoty w panelu to JAWNY SZACUNEK („~”): minuty/60 × stawka zł/h.

create table if not exists public.event_values (
  typ text primary key,
  minuty int not null default 0,
  etykieta text not null
);

alter table public.event_values enable row level security;

-- Odczyt dla wszystkich zalogowanych (klient widzi metodę liczenia swojego ROI)
drop policy if exists "authenticated read event_values" on public.event_values;
create policy "authenticated read event_values" on public.event_values
  for select to authenticated
  using (true);

drop policy if exists "ceo write event_values" on public.event_values;
create policy "ceo write event_values" on public.event_values
  for all to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo')
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo');

insert into public.event_values (typ, minuty, etykieta) values
  ('rozmowa_odebrana', 5,  'Rozmowa odebrana'),
  ('lead_zlapany',     10, 'Lead złapany'),
  ('rezerwacja',       8,  'Rezerwacja'),
  ('sms_wyslany',      2,  'SMS wysłany'),
  ('opinia_zebrana',   15, 'Opinia zebrana'),
  ('workflow_run',     1,  'Uruchomienie workflow'),
  ('blad',             0,  'Błąd')
on conflict (typ) do nothing;

-- ===== 3. client_automations — zdrowie wdrożenia =====

alter table public.client_automations
  add column if not exists last_event_at timestamptz,
  add column if not exists health text not null default 'nowa'
    check (health in ('ok', 'uwaga', 'blad', 'nowa'));

-- ===== 4. contacts — stawka zł/h per klient (nadpisuje globalną z ENV) =====

alter table public.contacts
  add column if not exists stawka_pln_h numeric(8,2);
