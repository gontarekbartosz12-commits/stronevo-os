-- STRONEVO OS — FAZA 4 „Commerce" cz. 2: membership/kursy.
-- Kurs należy do firmy-klienta (contact_id); kursant (klient końcowy firmy)
-- dostaje dostęp kapability URL-em /kurs/[token] — po opłacie (payment_links
-- meta.course_id) albo nadany ręcznie. OPERATOR-FIRST: strukturę kursu tworzy
-- operator; klient (hybryda) edytuje TREŚĆ lekcji. Uruchomić PO 0020.

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete cascade,
  tytul text not null,
  opis text,
  cena numeric(10,2), -- null = dostęp nadawany ręcznie (bez sprzedaży)
  created_at timestamptz not null default now()
);

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade, -- denorm pod RLS
  tytul text not null,
  tresc text,
  wideo_url text,
  kolejnosc int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists lessons_course_idx on public.lessons(course_id, kolejnosc);

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade, -- denorm (tenant)
  external jsonb not null default '{}', -- {imie, email} kursanta
  token text not null unique, -- kapability /kurs/[token]
  payment_id uuid references public.payments(id) on delete set null, -- dostęp po opłacie
  status text not null default 'aktywny' check (status in ('aktywny', 'wstrzymany')),
  created_at timestamptz not null default now()
);

create index if not exists enrollments_course_idx on public.enrollments(course_id);

create table if not exists public.course_progress (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  ukonczona boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (enrollment_id, lesson_id)
);

-- ===== RLS =====

do $$
declare t text;
begin
  foreach t in array array['courses', 'lessons', 'enrollments'] loop
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

alter table public.course_progress enable row level security;
drop policy if exists "ceo full access course_progress" on public.course_progress;
create policy "ceo full access course_progress" on public.course_progress
  for all to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo')
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'ceo');

-- HYBRYDA: klient edytuje TREŚĆ lekcji własnych kursów (struktura = operator)
drop policy if exists "klient update own lessons" on public.lessons;
create policy "klient update own lessons" on public.lessons
  for update to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'klient' and contact_id = public.jwt_contact_id())
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'klient' and contact_id = public.jwt_contact_id());

-- Widok kursanta /kurs/[token] i postęp: publiczny odczyt/zapis przez service
-- role, token = jedyny klucz dostępu (jak /umowa, /raport).
