-- STRONEVO OS — FAZA 4 „Commerce" cz. 1: płatności + subskrypcje.
-- ⚠️ PRAWDZIWE PIENIĄDZE: kwoty dokładne (numeric), zapis statusów płatności
-- WYŁĄCZNIE service role (webhook z weryfikacją podpisu providera).
-- Multi-tenant: contact_id = firma-właściciel. OPERATOR-FIRST: konfiguracja
-- bramek/subskrypcji = operator; klient (użytkowo) wystawia linki text-to-pay
-- i czyta swoje płatności. Uruchomić PO 0019_faza3_email_social_opinie.sql.

-- ===== payments =====

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete set null,
  payment_link_id uuid,
  subscription_id uuid,
  kwota numeric(10,2) not null check (kwota > 0),
  waluta text not null default 'PLN',
  status text not null default 'nowa'
    check (status in ('nowa', 'oczekuje', 'oplacona', 'blad', 'zwrot')),
  provider text not null check (provider in ('p24', 'payu', 'stripe', 'mock')),
  external_id text, -- id transakcji u providera
  meta jsonb not null default '{}',
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists payments_contact_idx on public.payments(contact_id, created_at desc);
create index if not exists payments_status_idx on public.payments(status);

-- ===== payment_links (text-to-pay) =====

create table if not exists public.payment_links (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete set null,
  kwota numeric(10,2) not null check (kwota > 0),
  waluta text not null default 'PLN',
  opis text not null,
  token text not null unique, -- kapability URL /pay/[token]
  status text not null default 'aktywny' check (status in ('aktywny', 'oplacony', 'wygasly')),
  external jsonb not null default '{}', -- {imie, telefon, email} płatnika
  meta jsonb not null default '{}',     -- {course_id, invoice_id}
  payment_id uuid references public.payments(id) on delete set null,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists payment_links_contact_idx on public.payment_links(contact_id);

-- ===== subscriptions =====

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete cascade,
  client_automation_id uuid references public.client_automations(id) on delete set null,
  plan text not null,
  kwota numeric(10,2) not null check (kwota > 0),
  cykl text not null default 'miesieczny' check (cykl in ('miesieczny', 'roczny')),
  status text not null default 'aktywna' check (status in ('aktywna', 'zalegla', 'anulowana')),
  provider text not null default 'mock' check (provider in ('p24', 'payu', 'stripe', 'mock')),
  provider_ref text, -- np. Stripe customer/subscription id (auto-charge)
  next_charge date,
  created_at timestamptz not null default now()
);

create index if not exists subscriptions_due_idx on public.subscriptions(status, next_charge);

alter table public.payments add constraint payments_link_fk
  foreign key (payment_link_id) references public.payment_links(id) on delete set null;
alter table public.payments add constraint payments_subscription_fk
  foreign key (subscription_id) references public.subscriptions(id) on delete set null;

-- ===== RLS =====

do $$
declare t text;
begin
  foreach t in array array['payments', 'payment_links', 'subscriptions'] loop
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

-- Text-to-pay = funkcja UŻYTKOWA: klient wystawia linki dla SWOJEJ firmy
drop policy if exists "klient insert own payment_links" on public.payment_links;
create policy "klient insert own payment_links" on public.payment_links
  for insert to authenticated
  with check (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and contact_id = public.jwt_contact_id()
  );

-- Statusy płatności/linków/subskrypcji zmienia WYŁĄCZNIE service role
-- (webhook providera po weryfikacji podpisu + cron obciążeń) — brak polityk
-- update dla roli klient. Konfiguracja subskrypcji = operator (CEO).
