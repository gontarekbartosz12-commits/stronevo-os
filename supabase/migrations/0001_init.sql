-- STRONEVO OS — Faza 1: serwery + kontakty (CRM pipeline)
-- Uruchomić w Supabase SQL Editor (projekt EU-Frankfurt).

create extension if not exists "pgcrypto";

-- ===== servers =====
create table if not exists public.servers (
  id uuid primary key default gen_random_uuid(),
  nazwa text not null,
  host text,
  port integer,
  notatka text,
  status text default 'aktywny',
  created_at timestamptz not null default now()
);

-- ===== contacts =====
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  server_id uuid references public.servers(id) on delete set null,
  typ text not null default 'lead'
    check (typ in ('lead', 'prospekt', 'klient')),
  imie text not null,
  firma text,
  nip text,
  branza text,
  miasto text,
  telefon text,
  email text,
  zrodlo text,
  status_pipeline text not null default 'NOWY'
    check (status_pipeline in (
      'NOWY', 'PROBA_KONTAKTU', 'UMOWIONY', 'PO_DEMO',
      'OFERTA', 'KLIENT', 'STRACONY', 'PIEC'
    )),
  nastepna_akcja text,
  nastepna_akcja_data date,
  data_ostatniego_kontaktu date,
  notatki text,
  created_at timestamptz not null default now()
);

create index if not exists contacts_status_idx on public.contacts (status_pipeline);
create index if not exists contacts_typ_idx on public.contacts (typ);

-- ===== seed =====
insert into public.servers (nazwa, host, port, notatka, status)
select 'Serwer 1 (stronevo-prod)', null, 22, 'Główny VPS produkcyjny — n8n, Coolify, klienci', 'aktywny'
where not exists (select 1 from public.servers where nazwa = 'Serwer 1 (stronevo-prod)');

-- ===== RLS =====
-- Faza 1: dostęp ma wyłącznie zalogowany użytkownik z rolą 'ceo'
-- (rola trzymana w auth.users.raw_user_meta_data->>'role').
alter table public.servers enable row level security;
alter table public.contacts enable row level security;

create policy "ceo full access servers" on public.servers
  for all to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo')
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo');

create policy "ceo full access contacts" on public.contacts
  for all to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo')
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo');

-- ===== konto CEO =====
-- Konto załóż w Supabase Dashboard: Authentication > Users > Add user,
-- następnie ustaw rolę w SQL:
--   update auth.users
--   set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"role":"ceo"}'::jsonb
--   where email = 'twoj-email@example.com';
