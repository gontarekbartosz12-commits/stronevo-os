-- STRONEVO OS — PANEL WYNIKÓW, Faza A cz. 2: raporty miesięczne.
-- Auto-raport 1. dnia miesiąca (cron → /api/reports/run) zapisuje payload
-- i wysyła mail z linkiem do brandowanej strony /raport/[id] (capability URL).
-- Uruchomić PO 0014_panel_wynikow.sql.

create table if not exists public.monthly_reports (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  okres date not null, -- 1. dzień raportowanego miesiąca
  payload jsonb not null default '{}',
  wyslany_at timestamptz,
  created_at timestamptz not null default now(),
  unique (contact_id, okres)
);

create index if not exists monthly_reports_contact_idx
  on public.monthly_reports(contact_id, okres desc);

alter table public.monthly_reports enable row level security;

-- CEO: pełny dostęp
drop policy if exists "ceo full access monthly_reports" on public.monthly_reports;
create policy "ceo full access monthly_reports" on public.monthly_reports
  for all to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo')
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo');

-- Klient: WYŁĄCZNIE własne raporty
drop policy if exists "klient read own monthly_reports" on public.monthly_reports;
create policy "klient read own monthly_reports" on public.monthly_reports
  for select to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and contact_id = public.jwt_contact_id()
  );

-- Zapis raportów: WYŁĄCZNIE service role (cron /api/reports/run omija RLS).
-- Publiczny odczyt /raport/[id]: service role + UUID jako token (jak /umowa/[id]).
