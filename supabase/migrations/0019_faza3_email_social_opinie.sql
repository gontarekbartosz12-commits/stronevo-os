-- STRONEVO OS — FAZA 3 „Marketing" cz. 2: e-mail marketing + social planner
-- + reputacja (opinie). Multi-tenant contact_id; RODO: zgoda + 1-klik wypis.
-- OPERATOR-FIRST: sekwencje/integracje = operator; klient (hybryda) edytuje
-- treść kampanii, planuje posty i odpowiada na opinie.
-- Uruchomić PO 0018_faza3_strony_formularze.sql.

-- ===== C. e-mail marketing =====

create table if not exists public.email_lists (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete cascade,
  nazwa text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.email_contacts (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.email_lists(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade, -- denorm pod RLS
  email text not null,
  imie text,
  zgoda boolean not null default true, -- zgoda marketingowa (RODO)
  opt_out boolean not null default false, -- 1-klik wypis
  created_at timestamptz not null default now(),
  unique (list_id, email)
);

create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete cascade,
  list_id uuid references public.email_lists(id) on delete set null,
  temat text not null,
  -- treść jako bloki (reuse builder: hero/text/cta/image), props jsonb
  bloki jsonb not null default '[]',
  status text not null default 'szkic' check (status in ('szkic', 'zaplanowana', 'wysylanie', 'wyslana')),
  zaplanowano timestamptz,
  wyslano_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.email_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade, -- denorm pod RLS
  email text not null,
  token text not null unique, -- tracking open/click + wypis
  sent boolean not null default false,
  opened_at timestamptz,
  clicked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists email_sends_campaign_idx on public.email_sends(campaign_id);

-- ===== D. social planner =====

create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete cascade,
  kanaly text[] not null default '{}', -- fb / ig / gbp / linkedin
  tresc text not null,
  media jsonb not null default '[]', -- [{url}]
  zaplanowano timestamptz,
  status text not null default 'szkic' check (status in ('szkic', 'zaplanowany', 'opublikowany', 'blad')),
  wynik jsonb not null default '{}', -- odpowiedzi API per kanał (zapisuje cron)
  created_at timestamptz not null default now()
);

create index if not exists social_posts_contact_idx on public.social_posts(contact_id, zaplanowano);

-- ===== E. reputacja =====

create table if not exists public.review_requests (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete cascade,
  external jsonb not null default '{}', -- {imie, telefon, email}
  kanal text not null check (kanal in ('sms', 'email')),
  review_link text,
  status text not null default 'wyslana' check (status in ('wyslana', 'blad')),
  created_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete cascade,
  zrodlo text not null default 'google' check (zrodlo in ('google', 'fb')),
  autor text,
  ocena int check (ocena between 1 and 5),
  tresc text,
  odpowiedz text,
  status text not null default 'nowa' check (status in ('nowa', 'szkic', 'odpowiedziano')),
  external_id text, -- id opinii w GBP (dedupe monitora n8n)
  created_at timestamptz not null default now()
);

create index if not exists reviews_contact_idx on public.reviews(contact_id, created_at desc);
create unique index if not exists reviews_external_idx on public.reviews(zrodlo, external_id)
  where external_id is not null;

-- ===== RLS =====

do $$
declare t text;
begin
  foreach t in array array[
    'email_lists', 'email_contacts', 'email_campaigns', 'email_sends',
    'social_posts', 'review_requests', 'reviews'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "ceo full access %I" on public.%I', t, t);
    execute format('create policy "ceo full access %I" on public.%I for all to authenticated
      using ((auth.jwt() -> ''user_metadata'' ->> ''role'') = ''ceo'')
      with check ((auth.jwt() -> ''user_metadata'' ->> ''role'') = ''ceo'')', t, t);
    execute format('drop policy if exists "klient read own %I" on public.%I', t, t);
    execute format('create policy "klient read own %I" on public.%I for select to authenticated
      using ((auth.jwt() -> ''user_metadata'' ->> ''role'') = ''klient''
        and contact_id = public.jwt_contact_id())', t, t);
  end loop;
end $$;

-- HYBRYDA (guardrail operator-first) — funkcje UŻYTKOWE klienta:
-- social: klient planuje/edytuje własne posty (treść + termin)
drop policy if exists "klient write own social_posts" on public.social_posts;
create policy "klient write own social_posts" on public.social_posts
  for insert to authenticated
  with check (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and contact_id = public.jwt_contact_id()
  );
drop policy if exists "klient update own social_posts" on public.social_posts;
create policy "klient update own social_posts" on public.social_posts
  for update to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'klient' and contact_id = public.jwt_contact_id())
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'klient' and contact_id = public.jwt_contact_id());

-- opinie: klient odpowiada na własne opinie (treść odpowiedzi + status)
drop policy if exists "klient update own reviews" on public.reviews;
create policy "klient update own reviews" on public.reviews
  for update to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'klient' and contact_id = public.jwt_contact_id())
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'klient' and contact_id = public.jwt_contact_id());

-- prośby o opinię: klient wysyła po usłudze (codzienny ruch)
drop policy if exists "klient write own review_requests" on public.review_requests;
create policy "klient write own review_requests" on public.review_requests
  for insert to authenticated
  with check (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and contact_id = public.jwt_contact_id()
  );

-- kampanie: klient edytuje TREŚĆ własnych kampanii (temat/bloki) — wysyłkę
-- i harmonogram odpala operator lub akcja panelu (service-side)
drop policy if exists "klient update own email_campaigns" on public.email_campaigns;
create policy "klient update own email_campaigns" on public.email_campaigns
  for update to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'klient' and contact_id = public.jwt_contact_id())
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'klient' and contact_id = public.jwt_contact_id());

-- Wysyłki/tracking/wypisy/ingest opinii zapisuje WYŁĄCZNIE service role
-- (endpointy /api/email/*, /api/social/publish-due, /api/reviews/ingest).
