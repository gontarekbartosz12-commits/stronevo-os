-- STRONEVO OS — Kompendium wiedzy + bramka opłacenia automatyzacji.
-- Uruchomić PO 0008 (katalog pakietów). Idempotentne.

-- ===== 1. Kompendium: co uzyskać od klienta + jak (metoda) =====
alter table public.automations_catalog
  add column if not exists wymagania_od_klienta jsonb not null default '[]'::jsonb;

-- Wypełnij wymagania wg TYPU usługi (działa dla katalogu komponentów i pakietów).
-- metoda ∈ wideo | poradnik | przeslij | sami

update public.automations_catalog set wymagania_od_klienta = '[
  {"pozycja":"Numer telefonu klientów + zgoda na przekierowanie u operatora","metoda":"przeslij","szczegoly":"Numer, na który dzwonią klienci; ustawienie przekierowania po stronie operatora."},
  {"pozycja":"Dostęp do kalendarza rezerwacji (Google Calendar / Cal.com)","metoda":"wideo","szczegoly":"Podpinamy kalendarz wspólnie na 20-min spotkaniu."},
  {"pozycja":"Zakres usług, czasy trwania i ceny do umawiania","metoda":"przeslij","szczegoly":"Lista usług + ile trwają + cennik."},
  {"pozycja":"Zasady umawiania, godziny, wyjątki, FAQ","metoda":"poradnik","szczegoly":"Wypełnij szablon rozmowy (wyślemy formularz)."},
  {"pozycja":"Zgoda na nagrywanie rozmów (RODO)","metoda":"poradnik","szczegoly":"Akceptacja komunikatu o nagrywaniu na wstępie połączenia."}
]'::jsonb where typ = 'recepcja';

update public.automations_catalog set wymagania_od_klienta = '[
  {"pozycja":"Materiały do bazy wiedzy: cennik, oferta, FAQ, regulaminy","metoda":"przeslij","szczegoly":"Dokumenty/linki, z których bot ma odpowiadać (im więcej, tym lepiej)."},
  {"pozycja":"Dostęp do strony WWW (wpięcie widgetu)","metoda":"wideo","szczegoly":"Na spotkaniu wpinamy skrypt lub prosimy o dostęp do CMS."},
  {"pozycja":"Adres e-mail na leady zebrane po godzinach","metoda":"przeslij"},
  {"pozycja":"Ton komunikacji i tematy, których bot ma unikać","metoda":"poradnik","szczegoly":"Krótka checklista: jak się zwracać, czego nie obiecywać."}
]'::jsonb where typ = 'chatbot';

update public.automations_catalog set wymagania_od_klienta = '[
  {"pozycja":"Dostęp menedżera do Google Business Profile","metoda":"wideo","szczegoly":"Nadanie dostępu lub konfiguracja wspólnie na spotkaniu."},
  {"pozycja":"Baza kontaktów klientów (telefon/e-mail) do prośby o opinię","metoda":"przeslij","szczegoly":"Zgodnie z RODO — tylko klienci, którzy skorzystali z usługi."},
  {"pozycja":"Preferowany szablon prośby o opinię i moment wysyłki","metoda":"poradnik","szczegoly":"Np. SMS 2h po wizycie — wyślemy propozycje do zatwierdzenia."}
]'::jsonb where typ = 'opinie';

update public.automations_catalog set wymagania_od_klienta = '[
  {"pozycja":"Opis procesu do zautomatyzowania (krok po kroku)","metoda":"wideo","szczegoly":"Na spotkaniu mapujemy proces i punkty integracji."},
  {"pozycja":"Dostępy do systemów w integracji (klucze API / logowania)","metoda":"przeslij","szczegoly":"Przekazywane bezpiecznym kanałem; minimalne uprawnienia."},
  {"pozycja":"Przykładowe dane wejściowe i oczekiwany wynik","metoda":"przeslij"}
]'::jsonb where typ = 'n8n';

update public.automations_catalog set wymagania_od_klienta = '[
  {"pozycja":"Treści: teksty, logo, zdjęcia","metoda":"przeslij","szczegoly":"Materiały firmowe; jeśli brak — pomagamy wygenerować."},
  {"pozycja":"Domena i dostęp do DNS","metoda":"wideo","szczegoly":"Podpinamy domenę wspólnie."},
  {"pozycja":"Przykłady stron, które się podobają","metoda":"poradnik"}
]'::jsonb where typ = 'strona';

-- Pakiety (typ 'pakiet', jeśli istnieje w 0008): zestaw zbiorczy
update public.automations_catalog set wymagania_od_klienta = '[
  {"pozycja":"Dane firmy do umowy/faktury (NIP, adres)","metoda":"sami","szczegoly":"Uzupełniane w CRM / pobierane z GUS przy prospektowaniu."},
  {"pozycja":"Dostęp do kanałów w zakresie pakietu (kalendarz, Google Business, strona)","metoda":"wideo","szczegoly":"Jedno spotkanie wdrożeniowe obejmuje wszystkie podpięcia."},
  {"pozycja":"Materiały: cennik, oferta, FAQ, logo, zdjęcia","metoda":"przeslij"},
  {"pozycja":"Zgody RODO (nagrywanie, kontakt marketingowy)","metoda":"poradnik"}
]'::jsonb where typ = 'pakiet' and wymagania_od_klienta = '[]'::jsonb;

-- ===== 2. Bramka opłacenia: nowy status client_automations =====
-- Automatyzacja czeka na opłatę wdrożeniową, zanim ruszy budowa.
alter table public.client_automations drop constraint if exists client_automations_status_check;
alter table public.client_automations
  add constraint client_automations_status_check
  check (status in ('oczekuje_oplaty', 'provisioning', 'active', 'paused'));
