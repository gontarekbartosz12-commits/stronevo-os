-- STRONEVO OS — Faza 3: multi-VPS (n8n per serwer), panel klienta (RLS),
-- remarketing nie wymaga tabel. Uruchomić PO 0002_faza2.sql.

-- ===== servers: własna instancja n8n per serwer =====
alter table public.servers add column if not exists n8n_url text;
alter table public.servers add column if not exists n8n_api_key text;

-- ===== RLS: panel klienta =====
-- Rola 'klient' widzi WYŁĄCZNIE dane swojego contact_id
-- (contact_id trzymany w auth.users.raw_user_meta_data->>'contact_id').

create or replace function public.jwt_contact_id() returns uuid
language sql stable as $$
  select nullif(auth.jwt() -> 'user_metadata' ->> 'contact_id', '')::uuid
$$;

create policy "klient read own contact" on public.contacts
  for select to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and id = public.jwt_contact_id()
  );

create policy "klient read own automations" on public.client_automations
  for select to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and contact_id = public.jwt_contact_id()
  );

create policy "klient read own invoices" on public.invoices
  for select to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and contact_id = public.jwt_contact_id()
  );

create policy "klient read own contracts" on public.contracts
  for select to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and contact_id = public.jwt_contact_id()
  );

-- Katalog jest publiczny wewnątrz aplikacji (upsell w panelu klienta)
create policy "klient read catalog" on public.automations_catalog
  for select to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'klient');

-- "Skontaktuj się ze sprzedażą" / "Dodaj do pakietu": klient tworzy
-- WYŁĄCZNIE leada upsellowego (typ=lead, zrodlo=upsell)
create policy "klient insert upsell lead" on public.contacts
  for insert to authenticated
  with check (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and typ = 'lead' and zrodlo = 'upsell'
  );

create policy "klient insert upsell notification" on public.notifications
  for insert to authenticated
  with check (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and typ = 'biznes'
  );
