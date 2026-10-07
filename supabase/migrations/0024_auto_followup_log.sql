-- STRONEVO OS — TOR 1: realny AUTO-FOLLOW-UP SMS straconych leadów.
-- Do tej pory przełącznik `contacts.auto_followup_sms` był martwą flagą (nikt jej
-- nie czytał). Teraz cron /api/followup/run realnie wysyła SMS do nieodebranych
-- leadów po godzinach. Ta tabela = DEDUP: każdy stracony telefon dostaje SMS
-- najwyżej RAZ (klucz contact_id + call_id). Uruchomić PO 0023.

create table if not exists public.followup_log (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete cascade,
  call_id text not null,            -- id połączenia (Vapi) — stabilny klucz dedupu
  numer text,                       -- numer, na który poszedł SMS (audyt)
  sent boolean not null default true,
  created_at timestamptz not null default now(),
  unique (contact_id, call_id)
);

create index if not exists followup_log_contact_idx on public.followup_log(contact_id, created_at desc);

-- RLS: wpis/edycja WYŁĄCZNIE service role (cron). Klient może czytać własne
-- (transparentność: „wysłaliśmy za Ciebie follow-up"); operator (CEO) widzi wszystko.
alter table public.followup_log enable row level security;

drop policy if exists "ceo full access followup_log" on public.followup_log;
create policy "ceo full access followup_log" on public.followup_log
  for all to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo')
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo');

drop policy if exists "klient read own followup_log" on public.followup_log;
create policy "klient read own followup_log" on public.followup_log
  for select to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and contact_id = public.jwt_contact_id()
  );
