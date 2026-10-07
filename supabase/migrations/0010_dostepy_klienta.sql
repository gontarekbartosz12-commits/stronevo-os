-- STRONEVO OS — Dostępy/klucze od klienta (blokada deployu).
-- Per klient, per wymaganie z kompendium. Idempotentne.

create table if not exists public.client_credentials (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  automation_id uuid references public.automations_catalog(id) on delete set null,
  pozycja text not null,
  metoda text not null default 'przeslij'
    check (metoda in ('wideo', 'poradnik', 'przeslij', 'sami')),
  status text not null default 'oczekuje' check (status in ('oczekuje', 'otrzymano')),
  wartosc text, -- klucz/notatka; UWAGA: szyfrowanie at-rest (pgcrypto/vault) = hardening TODO
  created_at timestamptz not null default now()
);
create index if not exists client_credentials_contact_idx on public.client_credentials (contact_id);

alter table public.client_credentials enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'client_credentials'
      and policyname = 'ceo full access client_credentials'
  ) then
    create policy "ceo full access client_credentials" on public.client_credentials
      for all to authenticated
      using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo')
      with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo');
  end if;
end $$;
