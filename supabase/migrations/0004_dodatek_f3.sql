-- STRONEVO OS — dodatek do Fazy 3: godziny pracy klienta (fundament
-- "Ekranu Kasy"). Uruchomić PO 0003_faza3.sql.
--
-- Struktura business_hours (jsonb):
-- {
--   "dni": { "pon": ["9:00","18:00"], ..., "nd": null },   -- null = zamknięte
--   "wyjatki": [ { "data": "2026-12-25", "opis": "Boże Narodzenie" } ]
-- }
-- Połączenie poza tymi godzinami = "byś nie odebrał" w Ekranie Kasy.
-- Dane połączeń NIE mają tabeli — płyną na żywo z Vapi/n8n przez
-- lib/integrations/calls.ts (minimalizacja danych: nie przechowujemy
-- numerów dzwoniących klientów końcowych w naszej bazie).

alter table public.contacts add column if not exists business_hours jsonb;
