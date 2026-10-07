-- STRONEVO OS — CRM klienta: pełne funkcje (historia/aktywności per lead).
-- Klient wchodzi w leada i loguje notatki/telefony/spotkania (timeline).
-- Uruchomić PO 0012_panel_klienta_crm.sql.

create table if not exists public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  owner_contact_id uuid not null references public.contacts(id) on delete cascade,
  typ text not null default 'notatka', -- notatka | telefon | email | spotkanie | status
  tresc text not null,
  created_at timestamptz not null default now()
);

create index if not exists lead_activities_contact_idx
  on public.lead_activities(contact_id, created_at desc);
create index if not exists lead_activities_owner_idx
  on public.lead_activities(owner_contact_id);

alter table public.lead_activities enable row level security;

-- CEO: pełny dostęp
drop policy if exists "ceo full access lead_activities" on public.lead_activities;
create policy "ceo full access lead_activities" on public.lead_activities
  for all to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo')
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo');

-- Klient: WYŁĄCZNIE aktywności swoich leadów (owner_contact_id = jego contact_id)
drop policy if exists "klient read own activities" on public.lead_activities;
create policy "klient read own activities" on public.lead_activities
  for select to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and owner_contact_id = public.jwt_contact_id()
  );

drop policy if exists "klient insert own activities" on public.lead_activities;
create policy "klient insert own activities" on public.lead_activities
  for insert to authenticated
  with check (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and owner_contact_id = public.jwt_contact_id()
  );

drop policy if exists "klient delete own activities" on public.lead_activities;
create policy "klient delete own activities" on public.lead_activities
  for delete to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and owner_contact_id = public.jwt_contact_id()
  );
