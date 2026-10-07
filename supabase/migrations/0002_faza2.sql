-- STRONEVO OS — Faza 2: katalog automatyzacji, faktury, umowy, zadania,
-- powiadomienia, konta klientów. Uruchomić PO 0001_init.sql.

-- ===== contacts: adres do umów/faktur =====
alter table public.contacts add column if not exists adres text;

-- ===== automations_catalog =====
create table if not exists public.automations_catalog (
  id uuid primary key default gen_random_uuid(),
  nazwa text not null,
  typ text not null check (typ in ('recepcja', 'chatbot', 'opinie', 'n8n', 'strona')),
  opis text not null default '',
  cena_wdrozenie numeric(10,2) not null default 0,
  cena_mc numeric(10,2) not null default 0,
  template_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.automations_catalog (nazwa, typ, opis, cena_wdrozenie, cena_mc, template_config)
select * from (values
  ('Recepcja AI', 'recepcja',
   'Głosowa recepcjonistka AI — odbiera telefony 24/7, umawia wizyty w kalendarzu, wysyła SMS z potwierdzeniem.',
   1500::numeric, 390::numeric, '{"stack":["vapi","cal.com","n8n"],"jezyk":"pl"}'::jsonb),
  ('Chatbot RAG', 'chatbot',
   'Chatbot na stronie WWW odpowiadający z wiedzy firmy (cennik, oferta, FAQ). Zbiera leady po godzinach.',
   1200::numeric, 290::numeric, '{"stack":["n8n","supabase-pgvector","claude"],"widget":true}'::jsonb),
  ('Opinie AI', 'opinie',
   'Automatyczne zbieranie opinii Google po usłudze (SMS/e-mail) + monitoring i szkice odpowiedzi na opinie.',
   800::numeric, 190::numeric, '{"stack":["n8n","google-business"],"kanaly":["sms","email"]}'::jsonb),
  ('Automatyzacja n8n', 'n8n',
   'Dedykowany workflow n8n pod proces klienta — integracje, powiadomienia, raporty. Wycena wg złożoności.',
   900::numeric, 190::numeric, '{"stack":["n8n"],"custom":true}'::jsonb)
) as seed(nazwa, typ, opis, cena_wdrozenie, cena_mc, template_config)
where not exists (select 1 from public.automations_catalog);

-- ===== client_automations =====
create table if not exists public.client_automations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  automation_id uuid not null references public.automations_catalog(id) on delete restrict,
  n8n_workflow_id text,
  status text not null default 'provisioning'
    check (status in ('provisioning', 'active', 'paused')),
  data_startu date,
  created_at timestamptz not null default now()
);
create index if not exists client_automations_contact_idx on public.client_automations (contact_id);

-- ===== invoices =====
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  fakturownia_id text,
  tytul text not null default '',
  kwota numeric(10,2) not null default 0,
  cykl text not null default 'jednorazowa' check (cykl in ('jednorazowa', 'miesieczna')),
  status text not null default 'wystawiona'
    check (status in ('wystawiona', 'oplacona', 'zalegla')),
  data date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists invoices_contact_idx on public.invoices (contact_id);
create index if not exists invoices_status_idx on public.invoices (status);

-- ===== contracts =====
create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  pakiet_nazwa text not null,
  cena_wdrozenie numeric(10,2) not null default 0,
  cena_abonament numeric(10,2) not null default 0,
  lista_automatyzacji jsonb not null default '[]'::jsonb,
  data_startu date not null default current_date,
  status text not null default 'szkic'
    check (status in ('szkic', 'wyslana', 'zaakceptowana')),
  accepted_at timestamptz,
  accepted_ip text,
  created_at timestamptz not null default now()
);
create index if not exists contracts_contact_idx on public.contracts (contact_id);

-- ===== tasks =====
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete set null,
  typ text not null,
  wykonawca text not null default 'human' check (wykonawca in ('agent', 'human')),
  status text not null default 'do_zrobienia'
    check (status in ('do_zrobienia', 'w_budowie', 'do_zatwierdzenia', 'gotowe')),
  diff text,
  review_status text check (review_status in ('oczekuje', 'zaakceptowane', 'odrzucone')),
  created_at timestamptz not null default now()
);
create index if not exists tasks_status_idx on public.tasks (status);

-- ===== notifications =====
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  typ text not null check (typ in ('techniczne', 'biznes', 'agent')),
  severity text not null default 'info' check (severity in ('info', 'warn', 'krytyczne')),
  tytul text not null,
  opis text,
  related_typ text,
  related_id text,
  status text not null default 'nowe' check (status in ('nowe', 'w_toku', 'rozwiazane')),
  akcje jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists notifications_status_idx on public.notifications (status);
create index if not exists notifications_related_idx on public.notifications (related_typ, related_id);

-- ===== client_accounts (dostęp po opłacie) =====
create table if not exists public.client_accounts (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  auth_user_id uuid,
  email text not null,
  active boolean not null default true,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  unique (contact_id)
);

-- ===== RLS =====
-- Faza 2: pełny dostęp CEO; pracownik czyta/aktualizuje zadania.
-- Panel klienta (odczyt własnych danych) dojdzie w Fazie 3.
alter table public.automations_catalog enable row level security;
alter table public.client_automations enable row level security;
alter table public.invoices enable row level security;
alter table public.contracts enable row level security;
alter table public.tasks enable row level security;
alter table public.notifications enable row level security;
alter table public.client_accounts enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'automations_catalog', 'client_automations', 'invoices',
    'contracts', 'tasks', 'notifications', 'client_accounts'
  ] loop
    execute format(
      'create policy "ceo full access %1$s" on public.%1$I for all to authenticated
         using ((auth.jwt() -> ''user_metadata'' ->> ''role'') = ''ceo'')
         with check ((auth.jwt() -> ''user_metadata'' ->> ''role'') = ''ceo'')',
      t
    );
  end loop;
end $$;

create policy "pracownik read tasks" on public.tasks
  for select to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'pracownik');

create policy "pracownik update tasks" on public.tasks
  for update to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'pracownik')
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'pracownik');

create policy "pracownik insert tasks" on public.tasks
  for insert to authenticated
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'pracownik');

-- Pracownik widzi kontakty (nazwy przy zadaniach) — bez edycji
create policy "pracownik read contacts" on public.contacts
  for select to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'pracownik');

-- ===== konta =====
-- Pracownika załóż jak CEO (Authentication > Users), rola w metadanych:
--   update auth.users
--   set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"role":"pracownik"}'::jsonb
--   where email = 'pracownik@example.com';
-- Konta klientów tworzy automat "dostęp po opłacie" (service role).
