-- STRONEVO OS — FAZA 3 „Marketing" cz. 1: builder stron/funneli + formularze.
-- Multi-tenant: contact_id = firma-właściciel. MODEL OPERATOR-FIRST:
-- struktury (strony, slugi, definicje formularzy, triggery) tworzy operator;
-- klient (hybryda) edytuje TREŚĆ bloków własnych stron — nic poza tym.
-- Uruchomić PO 0017_faza2_conversations.sql.

-- ===== A. sites / site_pages / page_blocks =====

create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete cascade, -- null = strona STRONEVO
  nazwa text not null,
  slug text not null unique, -- publiczny adres /s/[slug]
  domena text, -- własna domena (podpina operator w Traefiku)
  status text not null default 'szkic' check (status in ('szkic', 'opublikowana', 'wylaczona')),
  theme jsonb not null default '{"accent":"#9b2242"}',
  created_at timestamptz not null default now()
);

create table if not exists public.site_pages (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade, -- denorm pod RLS
  sciezka text not null default '', -- '' = strona główna; 'kontakt' = /s/slug/kontakt
  seo jsonb not null default '{}', -- {title, description}
  created_at timestamptz not null default now(),
  unique (site_id, sciezka)
);

create table if not exists public.page_blocks (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.site_pages(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade, -- denorm pod RLS
  typ text not null check (typ in ('hero', 'features', 'form', 'cta', 'testimonials', 'text', 'image', 'pricing')),
  props jsonb not null default '{}',
  kolejnosc int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists page_blocks_page_idx on public.page_blocks(page_id, kolejnosc);
create index if not exists sites_contact_idx on public.sites(contact_id);

alter table public.sites enable row level security;
alter table public.site_pages enable row level security;
alter table public.page_blocks enable row level security;

-- CEO full + pracownik read (wzorzec); klient: read own; page_blocks: klient
-- może UPDATE (edycja treści bloku = hybryda), bez insert/delete (struktura=operator).
do $$
declare t text;
begin
  foreach t in array array['sites', 'site_pages', 'page_blocks'] loop
    execute format('drop policy if exists "ceo full access %I" on public.%I', t, t);
    execute format('create policy "ceo full access %I" on public.%I for all to authenticated
      using ((auth.jwt() -> ''user_metadata'' ->> ''role'') = ''ceo'')
      with check ((auth.jwt() -> ''user_metadata'' ->> ''role'') = ''ceo'')', t, t);
    execute format('drop policy if exists "pracownik read %I" on public.%I', t, t);
    execute format('create policy "pracownik read %I" on public.%I for select to authenticated
      using ((auth.jwt() -> ''user_metadata'' ->> ''role'') = ''pracownik'')', t, t);
    execute format('drop policy if exists "klient read own %I" on public.%I', t, t);
    execute format('create policy "klient read own %I" on public.%I for select to authenticated
      using ((auth.jwt() -> ''user_metadata'' ->> ''role'') = ''klient''
        and contact_id = public.jwt_contact_id())', t, t);
  end loop;
end $$;

drop policy if exists "klient update own page_blocks" on public.page_blocks;
create policy "klient update own page_blocks" on public.page_blocks
  for update to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and contact_id = public.jwt_contact_id()
  )
  with check (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and contact_id = public.jwt_contact_id()
  );

-- Publiczny render /s/[slug] czyta service role (jak /umowa) — brak polityk anon.

-- ===== B. forms / form_submissions =====

create table if not exists public.forms (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete cascade,
  nazwa text not null,
  -- pola: [{name, label, typ[text|email|tel|textarea|select], required, options?}]
  pola jsonb not null default '[]',
  -- konfiguracja OPERATORA: webhook n8n odpalany po submit (klient nie widzi)
  webhook_url text,
  zgoda_tekst text not null default 'Wyrażam zgodę na przetwarzanie moich danych osobowych w celu obsługi zapytania (RODO).',
  created_at timestamptz not null default now()
);

create table if not exists public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade, -- denorm pod RLS
  dane jsonb not null default '{}',
  zgoda_rodo boolean not null default false,
  lead_id uuid references public.contacts(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists form_submissions_form_idx on public.form_submissions(form_id, created_at desc);

alter table public.forms enable row level security;
alter table public.form_submissions enable row level security;

do $$
declare t text;
begin
  foreach t in array array['forms', 'form_submissions'] loop
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

-- Submisje z publicznego formularza zapisuje WYŁĄCZNIE service role
-- (/api/forms/submit; wymusza zgodę RODO i tworzy lead w CRM właściciela).
