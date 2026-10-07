-- STRONEVO OS — Panel Wartości (Ekran Kasy, Auto-follow-up SMS).
-- Uruchomić PO 0006_faza5.sql.
--
-- srednia_wartosc_wizyty — baza wyceny Ekranu Kasy (ustawia CEO na karcie
-- klienta); wszystkie kwoty w UI mnożone przez współczynnik konserwatywny
-- 0.6-0.7 (ENV VALUE_CONSERVATIVE_FACTOR, domyślnie 0.65).
-- auto_followup_sms — zasada "każdy stracony lead dostaje SMS" (przełącznik
-- klienta w Panelu Wartości; realną pętlę wysyłki spina n8n przy deployu).

alter table public.contacts add column if not exists srednia_wartosc_wizyty numeric(10,2);
alter table public.contacts add column if not exists auto_followup_sms boolean not null default false;

-- Klient może przełączać własny auto-follow-up (jedyna kolumna, którą
-- edytuje u siebie — update ograniczony politykami do własnego rekordu)
create policy "klient update own followup" on public.contacts
  for update to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and id = public.jwt_contact_id()
  )
  with check (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and id = public.jwt_contact_id()
  );
