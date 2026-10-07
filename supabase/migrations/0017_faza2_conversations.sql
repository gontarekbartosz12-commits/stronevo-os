-- STRONEVO OS — FAZA 2 „Conversations": jedna skrzynka na wszystkie kanały
-- + bot AI z wiedzy firmy (RAG na pgvector).
-- Multi-tenant: owner_contact_id = firma-właściciel skrzynki (null = STRONEVO/CEO,
-- ustawione = klient; RLS klient = owner_contact_id = jwt_contact_id()).
-- contact_id = dopasowany kontakt/lead w CRM (koniec-klient), uzupełniany po
-- złapaniu leada. Zapis z n8n/webchat = WYŁĄCZNIE service role.
-- Uruchomić PO 0016_faza1_zaufanie.sql.

create extension if not exists vector;

-- ===== A. conversations + messages =====

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete set null,
  owner_contact_id uuid references public.contacts(id) on delete cascade,
  external jsonb not null default '{}', -- {imie, telefon, email, session_id}
  channel text not null check (channel in ('sms', 'email', 'whatsapp', 'webchat', 'fb', 'ig', 'gbp')),
  status text not null default 'otwarta' check (status in ('otwarta', 'oczekuje', 'zamknieta')),
  assigned text,
  ai_auto boolean not null default false,
  last_msg_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists conversations_owner_idx on public.conversations(owner_contact_id, last_msg_at desc);
create index if not exists conversations_channel_idx on public.conversations(channel);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  -- denormalizacja właściciela = proste RLS bez joinów
  owner_contact_id uuid references public.contacts(id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  channel text not null,
  body text not null,
  media jsonb not null default '[]',
  author text not null check (author in ('koncowy', 'ai', 'human')),
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_idx on public.messages(conversation_id, created_at);
create index if not exists messages_owner_idx on public.messages(owner_contact_id);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "ceo full access conversations" on public.conversations;
create policy "ceo full access conversations" on public.conversations
  for all to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo')
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo');

drop policy if exists "pracownik read conversations" on public.conversations;
create policy "pracownik read conversations" on public.conversations
  for select to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'pracownik');

-- Klient: WYŁĄCZNIE własna skrzynka. MODEL OPERATOR-FIRST: klient używa
-- gotowego (czyta, odpowiada, zamyka wątek) — konfiguracji automatyzacji
-- (ai_auto) NIE zmienia; pilnuje tego trigger conversations_guard_klient niżej.
drop policy if exists "klient read own conversations" on public.conversations;
create policy "klient read own conversations" on public.conversations
  for select to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and owner_contact_id = public.jwt_contact_id()
  );

drop policy if exists "klient update own conversations" on public.conversations;
create policy "klient update own conversations" on public.conversations
  for update to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and owner_contact_id = public.jwt_contact_id()
  )
  with check (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and owner_contact_id = public.jwt_contact_id()
  );

-- OPERATOR-FIRST (guardrail): klient może zmieniać status/assigned (obsługa
-- codziennego ruchu), ale NIE ai_auto/kanał/właściciela — to konfiguracja
-- automatyzacji, która należy do STRONEVO. RLS nie zna kolumn → trigger.
create or replace function public.conversations_guard_klient() returns trigger
language plpgsql security definer as $$
begin
  if (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient' then
    if new.ai_auto is distinct from old.ai_auto
       or new.owner_contact_id is distinct from old.owner_contact_id
       or new.channel is distinct from old.channel
       or new.contact_id is distinct from old.contact_id then
      raise exception 'Konfiguracja automatyzacji nalezy do operatora STRONEVO';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists conversations_guard_klient on public.conversations;
create trigger conversations_guard_klient
  before update on public.conversations
  for each row execute function public.conversations_guard_klient();

drop policy if exists "ceo full access messages" on public.messages;
create policy "ceo full access messages" on public.messages
  for all to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo')
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo');

drop policy if exists "pracownik read messages" on public.messages;
create policy "pracownik read messages" on public.messages
  for select to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'pracownik');

drop policy if exists "klient read own messages" on public.messages;
create policy "klient read own messages" on public.messages
  for select to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and owner_contact_id = public.jwt_contact_id()
  );

-- Klient odpowiada z własnej skrzynki (wysyłka = server action + integracje)
drop policy if exists "klient insert own messages" on public.messages;
create policy "klient insert own messages" on public.messages
  for insert to authenticated
  with check (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and owner_contact_id = public.jwt_contact_id()
    and direction = 'out'
    and author = 'human'
  );

-- Przychodzące (n8n webhooki per kanał, webchat) zapisuje WYŁĄCZNIE service role.

-- ===== C. message_templates =====

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  owner_contact_id uuid references public.contacts(id) on delete cascade, -- null = szablon globalny STRONEVO
  nazwa text not null,
  tresc text not null,
  created_at timestamptz not null default now()
);

alter table public.message_templates enable row level security;

drop policy if exists "ceo full access message_templates" on public.message_templates;
create policy "ceo full access message_templates" on public.message_templates
  for all to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo')
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo');

drop policy if exists "authenticated read templates" on public.message_templates;
create policy "authenticated read templates" on public.message_templates
  for select to authenticated
  using (
    owner_contact_id is null
    or owner_contact_id = public.jwt_contact_id()
    or (auth.jwt() -> 'user_metadata' ->> 'role') in ('ceo', 'pracownik')
  );

drop policy if exists "klient write own templates" on public.message_templates;
create policy "klient write own templates" on public.message_templates
  for insert to authenticated
  with check (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and owner_contact_id = public.jwt_contact_id()
  );

-- Seed globalnych szablonów
insert into public.message_templates (owner_contact_id, nazwa, tresc) values
  (null, 'Dziękujemy za kontakt', 'Dzień dobry! Dziękujemy za wiadomość — wracamy z odpowiedzią najszybciej, jak się da (zwykle do 2 h w godzinach pracy).'),
  (null, 'Prośba o telefon', 'Dzień dobry! Najszybciej ustalimy szczegóły telefonicznie — proszę o numer i dogodną godzinę, oddzwonimy.'),
  (null, 'Zamknięcie z podziękowaniem', 'Dziękujemy za rozmowę! W razie pytań jesteśmy pod tym samym numerem/adresem. Miłego dnia!')
on conflict do nothing;

-- ===== D. knowledge_docs (RAG per firma) =====

create table if not exists public.knowledge_docs (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete cascade, -- null = wiedza STRONEVO (własny webchat)
  tytul text not null,
  tresc text not null,
  embedding vector(1536), -- EMBEDDINGS_MODEL (OpenAI-compatible, 1536 dim); null = fallback keyword
  created_at timestamptz not null default now()
);

create index if not exists knowledge_docs_contact_idx on public.knowledge_docs(contact_id);

alter table public.knowledge_docs enable row level security;

drop policy if exists "ceo full access knowledge_docs" on public.knowledge_docs;
create policy "ceo full access knowledge_docs" on public.knowledge_docs
  for all to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo')
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo');

drop policy if exists "klient read own knowledge_docs" on public.knowledge_docs;
create policy "klient read own knowledge_docs" on public.knowledge_docs
  for select to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and contact_id = public.jwt_contact_id()
  );

-- OPERATOR-FIRST: bazę wiedzy bota (konfiguracja AI) zasila WYŁĄCZNIE operator
-- (/api/knowledge/ingest, service role). Klient widzi swoją wiedzę (jego treść),
-- ale zmiany przechodzą przez STRONEVO — celowo BRAK polityki insert/update
-- dla roli klient.
drop policy if exists "klient insert own knowledge_docs" on public.knowledge_docs;

-- Podobieństwo kosinusowe — RAG (wołane service role z /api/conversations/ai-reply)
create or replace function public.match_knowledge_docs(
  query_embedding vector(1536),
  p_contact uuid,
  match_count int default 3
) returns table (id uuid, tytul text, tresc text, similarity float)
language sql stable as $$
  select kd.id, kd.tytul, kd.tresc, 1 - (kd.embedding <=> query_embedding) as similarity
  from public.knowledge_docs kd
  where kd.embedding is not null
    and ((p_contact is null and kd.contact_id is null) or kd.contact_id = p_contact)
  order by kd.embedding <=> query_embedding
  limit match_count;
$$;
