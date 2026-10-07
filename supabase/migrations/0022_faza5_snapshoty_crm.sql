-- STRONEVO OS — FAZA 5 „Produktyzacja + głębia CRM" cz. 1:
-- snapshots (produktyzacja setupów) + custom objects + smart lists.
-- OPERATOR-FIRST: snapshoty i SCHEMATY obiektów = operator; REKORDY obiektów
-- i smart listy = funkcje użytkowe (klient na własnych danych).
-- Uruchomić PO 0021_faza4_kursy.sql.

-- ===== A. snapshots =====

create table if not exists public.snapshots (
  id uuid primary key default gen_random_uuid(),
  nazwa text not null,
  opis text,
  payload jsonb not null default '{}', -- SnapshotPayload (automatyzacje+szablony+wiedza+uptime+pipeline)
  created_at timestamptz not null default now()
);

alter table public.snapshots enable row level security;

-- Snapshoty = narzędzie operatora (produktyzacja) — WYŁĄCZNIE CEO (+pracownik read)
drop policy if exists "ceo full access snapshots" on public.snapshots;
create policy "ceo full access snapshots" on public.snapshots
  for all to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo')
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo');

drop policy if exists "pracownik read snapshots" on public.snapshots;
create policy "pracownik read snapshots" on public.snapshots
  for select to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'pracownik');

-- ===== B. custom objects + smart lists =====

create table if not exists public.custom_objects (
  id uuid primary key default gen_random_uuid(),
  owner_contact_id uuid references public.contacts(id) on delete cascade, -- tenant (null=STRONEVO)
  nazwa text not null,
  ikona text,
  schema jsonb not null default '[]', -- [{name,label,typ[text|number|date]}]
  created_at timestamptz not null default now()
);

create table if not exists public.custom_object_records (
  id uuid primary key default gen_random_uuid(),
  object_id uuid not null references public.custom_objects(id) on delete cascade,
  owner_contact_id uuid references public.contacts(id) on delete cascade, -- denorm pod RLS
  contact_id uuid references public.contacts(id) on delete set null, -- powiązany kontakt CRM
  dane jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists custom_object_records_object_idx
  on public.custom_object_records(object_id, created_at desc);

create table if not exists public.smart_lists (
  id uuid primary key default gen_random_uuid(),
  owner_contact_id uuid references public.contacts(id) on delete cascade,
  nazwa text not null,
  filtr jsonb not null default '{}', -- SmartListFilter (zapisany filtr kontaktów)
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['custom_objects', 'custom_object_records', 'smart_lists'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "ceo full access %I" on public.%I', t, t);
    execute format('create policy "ceo full access %I" on public.%I for all to authenticated
      using ((auth.jwt() -> ''user_metadata'' ->> ''role'') = ''ceo'')
      with check ((auth.jwt() -> ''user_metadata'' ->> ''role'') = ''ceo'')', t, t);
    execute format('drop policy if exists "klient read own %I" on public.%I', t, t);
    execute format('create policy "klient read own %I" on public.%I for select to authenticated
      using ((auth.jwt() -> ''user_metadata'' ->> ''role'') = ''klient''
        and owner_contact_id = public.jwt_contact_id())', t, t);
  end loop;
end $$;

-- Funkcje UŻYTKOWE klienta: rekordy obiektów (dane) + własne smart listy.
-- SCHEMATY obiektów tworzy operator (struktura) — brak insertu do custom_objects.
drop policy if exists "klient write own records" on public.custom_object_records;
create policy "klient write own records" on public.custom_object_records
  for insert to authenticated
  with check (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and owner_contact_id = public.jwt_contact_id()
  );
drop policy if exists "klient update own records" on public.custom_object_records;
create policy "klient update own records" on public.custom_object_records
  for update to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'klient' and owner_contact_id = public.jwt_contact_id())
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'klient' and owner_contact_id = public.jwt_contact_id());

drop policy if exists "klient write own smart_lists" on public.smart_lists;
create policy "klient write own smart_lists" on public.smart_lists
  for insert to authenticated
  with check (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and owner_contact_id = public.jwt_contact_id()
  );
