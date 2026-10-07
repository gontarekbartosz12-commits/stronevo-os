-- STRONEVO OS — FAZA 5 cz. 2: kalendarze bookingu (round-robin/collective/class)
-- + Ad Manager (kampanie Meta/Google). OPERATOR-FIRST: konfiguracja kalendarzy
-- i kampanii = operator; publiczny widget bookingu = klient końcowy (kapability
-- slug), rezerwacje zapisuje service role. Uruchomić PO 0022.

-- ===== C. kalendarze =====

create table if not exists public.booking_calendars (
  id uuid primary key default gen_random_uuid(),
  owner_contact_id uuid references public.contacts(id) on delete cascade,
  nazwa text not null,
  slug text not null unique, -- publiczny widget /rezerwacja/[slug]
  typ text not null default 'osobisty'
    check (typ in ('osobisty', 'round_robin', 'collective', 'class')),
  slot_min int not null default 30,
  capacity int not null default 1, -- class: limit miejsc na slot
  aktywny boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.calendar_members (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.booking_calendars(id) on delete cascade,
  owner_contact_id uuid references public.contacts(id) on delete cascade,
  nazwa text not null,
  kolejnosc int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.calendar_availability (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.booking_calendars(id) on delete cascade,
  owner_contact_id uuid references public.contacts(id) on delete cascade,
  dzien int not null check (dzien between 0 and 6), -- 0=niedziela (getDay)
  od text not null,  -- 'HH:MM'
  "do" text not null -- 'HH:MM'
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.booking_calendars(id) on delete cascade,
  owner_contact_id uuid references public.contacts(id) on delete cascade,
  member_id uuid references public.calendar_members(id) on delete set null,
  external jsonb not null default '{}', -- {imie, telefon, email}
  start timestamptz not null,
  koniec timestamptz not null,
  status text not null default 'potwierdzona' check (status in ('potwierdzona', 'odwolana')),
  created_at timestamptz not null default now()
);

create index if not exists bookings_calendar_idx on public.bookings(calendar_id, start);

-- ===== D. Ad Manager =====

create table if not exists public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_contact_id uuid references public.contacts(id) on delete cascade,
  kanal text not null check (kanal in ('meta', 'google')),
  nazwa text not null,
  budzet_dzienny numeric(10,2) not null default 0,
  status text not null default 'szkic' check (status in ('szkic', 'aktywna', 'wstrzymana')),
  segment text, -- spięcie z /audiencje (nie_odebral / piec / klienci_upsell)
  external_id text, -- id kampanii w Meta/Google (nadaje n8n przy uruchomieniu)
  metryki jsonb not null default '{}', -- {wydano, wyswietlenia, klikniecia, leady} — sync cron
  created_at timestamptz not null default now()
);

-- ===== RLS =====

do $$
declare t text;
begin
  foreach t in array array[
    'booking_calendars', 'calendar_members', 'calendar_availability', 'bookings', 'ad_campaigns'
  ] loop
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

-- Publiczny widget /rezerwacja/[slug] czyta i zapisuje przez SERVICE ROLE
-- (rezerwacja tworzy też lead w CRM właściciela). Metryki kampanii aktualizuje
-- WYŁĄCZNIE cron /api/ads/sync (service role, n8n → Meta/Google Ads API).
