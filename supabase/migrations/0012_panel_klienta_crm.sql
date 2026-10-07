-- STRONEVO OS — Panel klienta jako PODSTAWOWY CRM (multi-tenant leady).
-- Klient (rola 'klient') dostaje własny CRM: swoje leady, kalendarz, remarketing —
-- WSZYSTKO jak w CRM CEO, OPRÓCZ funkcji technicznych (agenci/serwery/SEO/dashboard).
-- Lead klienta = wiersz contacts z owner_contact_id = jego contact_id.
-- Lead STRONEVO (CEO) ma owner_contact_id IS NULL (bez zmian w istniejących danych).
-- Uruchomić PO 0011_kalendarz_handlowcy.sql.

alter table public.contacts
  add column if not exists owner_contact_id uuid references public.contacts(id) on delete cascade;

create index if not exists contacts_owner_contact_id_idx
  on public.contacts(owner_contact_id);

-- ===== RLS: leady klienta (addytywne OR do „klient read own contact"/„insert upsell") =====
-- Klient CRUD-uje WYŁĄCZNIE wiersze, których jest właścicielem (owner_contact_id = jego id).

drop policy if exists "klient read own leads" on public.contacts;
create policy "klient read own leads" on public.contacts
  for select to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and owner_contact_id = public.jwt_contact_id()
  );

drop policy if exists "klient insert own leads" on public.contacts;
create policy "klient insert own leads" on public.contacts
  for insert to authenticated
  with check (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and owner_contact_id = public.jwt_contact_id()
  );

drop policy if exists "klient update own leads" on public.contacts;
create policy "klient update own leads" on public.contacts
  for update to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and owner_contact_id = public.jwt_contact_id()
  )
  with check (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and owner_contact_id = public.jwt_contact_id()
  );

drop policy if exists "klient delete own leads" on public.contacts;
create policy "klient delete own leads" on public.contacts
  for delete to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and owner_contact_id = public.jwt_contact_id()
  );
