# STRONEVO OS

Wewnętrzny panel operacyjny STRONEVO.AI — Fazy 1-2.

**Stack:** Next.js (App Router) + React + Tailwind CSS, Supabase (Postgres + Auth, EU-Frankfurt), Docker/Coolify.

## Moduły

**Faza 1:**
- **CRM Pipeline** (`/crm`): kanban z drag&drop + widok listy. Etapy: Nowy, Próba kontaktu, Umówiony, Po demo, Oferta, Klient, Stracony, Piec. Karta kontaktu z pełną edycją, notatkami i "następną akcją" z datą (przeterminowane podświetlone na czerwono).
- **Dashboard CEO** (`/dashboard`, read-only): kafelki (workflowy n8n, klienci, martwe workflowy, VPS RAM/dysk/load, healthchecks) + tabela workflowów. Integracje w `lib/integrations/` czytają ENV i mają fallback-mock — panel działa bez żadnych kluczy.

**Faza 2:**
- **Katalog automatyzacji** (`/katalog`): siatka usług (Recepcja AI, Chatbot RAG, Opinie AI, Automatyzacja n8n) z cenami wdrożenia i abonamentu. Przypisanie do klienta z karty kontaktu (zakładka Automatyzacje) tworzy: rekord provisioning + zadanie + fakturę wdrożeniową (płatną od razu) + fakturę cykliczną od 2. miesiąca (**1. miesiąc abonamentu gratis**).
- **Fakturowanie** (`lib/integrations/fakturownia.ts`): createInvoice / getInvoiceStatus / createRecurring — live przez API Fakturowni albo mock. Faktury na karcie kontaktu (zakładka Faktury) ze statusami wystawiona/opłacona/zaległa.
- **Umowy** (zakładka Umowa na karcie + `/umowa/[id]`): generowanie z szablonu (`lib/contract-template.ts` — pola `{{...}}` do podmiany na treść od prawnika), eksport PDF przez druk, wysyłka mailem (stub), **e-akceptacja** z zapisem timestampu + IP.
- **Dostęp po opłacie**: opłacona faktura (API Fakturowni lub ręczne oznaczenie) automatycznie tworzy konto klienta (rola `klient` + hasło tymczasowe + mail z loginem + wymuszona zmiana hasła na `/zmiana-hasla`). Bez opłaty klient nie ma dostępu; "Wyłącz dostęp" banuje konto.
- **Zadania** (`/zadania`): kanban do_zrobienia → w_budowie → do_zatwierdzenia → gotowe. Pracownik oznacza postęp i wysyła do review; CEO akceptuje/odrzuca. Rola `pracownik` widzi tylko ten moduł.
- **Centrum powiadomień** (`/powiadomienia` + dzwonek w topbarze): typy techniczne/biznes/agent, severity, akcje przy powiadomieniu. Zaległa faktura (>`INVOICE_OVERDUE_DAYS` dni) auto-generuje powiadomienie z akcjami [Wyłącz dostęp — za potwierdzeniem] [Wyślij przypomnienie] [Daj 7 dni] + opcjonalny push na Telegram. Zewnętrzne źródła dorzucają powiadomienia przez `POST /api/notifications` (Bearer `NOTIFY_API_TOKEN`).

**Faza 3:**
- **Panel klienta** (`/klient`, rola `klient` — widzi wyłącznie swój `contact_id`, RLS w 0003): Moje automatyzacje, Moje faktury (+PDF: `/faktura/[id]` lub oryginał z Fakturowni), katalog upsell z rabatem pakietowym (10/15/20% wg liczby posiadanych automatyzacji), Promocje (`lib/promotions.ts`), „Skontaktuj się z działem sprzedaży" / „Dodaj do pakietu" → nowy lead (`zrodlo=upsell`) w CRM + powiadomienie biznesowe. CEO podgląda panel dowolnego klienta przez `/klient?contact_id=...`.
- **Multi-VPS** (`/serwery`): zakładki per serwer, dodawanie serwera (nazwa/host/port/URL n8n), per serwer: workflowy jego instancji n8n (`getN8nWorkflows(server)` — kolumny `n8n_url`/`n8n_api_key`, fallback globalny ENV → mock), przypięci prospekci/klienci ze statusem faktur, wykres aktywności 14 dni (mock — do podpięcia pod n8n `/executions`).
- **Remarketing** (`/audiencje`): segmenty CRM (Próba kontaktu, Piec, Klienci-upsell) → „Wyślij do Meta Custom Audiences" (`lib/integrations/meta.ts`, ENV `META_TOKEN`+`META_AD_ACCOUNT_ID`, rekordy hashowane SHA-256; bez tokena mock).
**Faza 5 — aplikacja desktop (Tauri):**
- Wrapper w `desktop/` — lekki .exe (NSIS) ładujący produkcyjny panel (crm.stronevo.pl); ten sam frontend, web działa równolegle. Link „Pobierz aplikację na Windows" na stronie logowania (`DESKTOP_DOWNLOAD_URL`). **Auto-update**: `tauri-plugin-updater` → `GET /api/desktop/latest` (manifest z ENV `DESKTOP_VERSION/UPDATE_URL/SIGNATURE`; bez ENV 204 = brak aktualizacji). Bramka „login tylko z opłaconą fakturą" wzmocniona w middleware (`client_accounts.active`, RLS w 0006). **Instrukcja budowania: `desktop/BUILD.md`.**

**Faza 4 — control plane agentów:**
- **Kolejka build** (`/zadania`): zadania z kategorią (zwykłe/build/naprawa), pełny cykl: Nowe → W budowie (agent) → Do review → Zatwierdzone → Wdrożone. „Uruchom agenta" na karcie zadania. **Agent nie wdraża sam** — deploy zawsze za zatwierdzeniem.
- **CRM techniczny** (`/agenci`, rola ceo): kafelki (agenci pracują / do review / wdrożone / koszt) + oś czasu runów. Widok runa: log kroków, output/diff, przyciski [Wyślij do Claude do weryfikacji] [Zatwierdź → deploy] [Odrzuć] [Oznacz wdrożone] [Dorzuć agenta].
- **Pluggable LLM** (`lib/llm/provider.ts`): wszystkie wywołania AI przez jeden moduł, ENV `LLM_PROVIDER` (anthropic/openai/selfhost) + `LLM_BASE_URL`/`LLM_KEY`/`LLM_MODEL` — selfhost = własny model z Hugging Face (vLLM/TGI, endpoint OpenAI-compatible). Bez konfiguracji mock.
- **Stuby do podłączenia na serwerze**: `POST /api/agent/run` (uruchomienie agenta/Hermesa; kontrakt I/O w pliku route) i `POST /api/server/provision` (provisioning serwera + świeże agenty z template). Bearer `AGENT_API_TOKEN`. Mock symuluje pracę agenta (~45 s, lazy completion).
- **Self-healing**: `POST /api/notifications` z `typ=techniczne` automatycznie tworzy task naprawczy i uruchamia agenta. Powiadomienie pokazuje live „Agenci pracują (N)" + akcje [Wyślij dodatkowych agentów] [Eskaluj do Claude] [Rozwiąż ręcznie] [Zignoruj]. Po naprawie → rozwiązane + podsumowanie. Powiadomienia typu agent: „Agent zbudował [X] — do review" → [Otwórz review] [Zatwierdź → deploy].
- **Dokumenty prawne**: umowa w wersji z 14-dniowym prawem odstąpienia (§ 5 ust. 2) + **wzór wypowiedzenia** (`/wypowiedzenie/[id]` z umowy zaakceptowanej; kierunek Zamawiający/Wykonawca, Dzień Zakończenia = 30 dni → koniec miesiąca).

- **Godziny pracy + połączenia na żywo** (dodatek — fundament „Ekranu Kasy"): `contacts.business_hours` (jsonb: dni tygodnia + wyjątki/święta), formularz na karcie klienta (zakładka Godziny) z auto-zaczytem z Google Business (`getGoogleHours`, stub bez `GOOGLE_PLACES_API_KEY`). Live dashboard połączeń (zakładka Połączenia + panel klienta): numer / czas / wynik / źródło (Ada/chatbot) + jawna flaga **„po godzinach"** liczona z godzin pracy, nagłówek kontekstowy („Firma zamyka dziś o 18:00 — dziś po godzinach: ..."), filtr „tylko po godzinach", polling co 20 s. Dane z `getCalls()` (`lib/integrations/calls.ts` — stub, docelowo Vapi/n8n; połączeń nie przechowujemy w bazie). RODO: pełne numery dzwoniących tylko w panelu właściciela firmy; w CRM STRONEVO maskowane.

## Uruchomienie lokalne

```bash
npm install
npm run dev
```

Bez pliku `.env` panel startuje w **trybie demo**: bez logowania, z przykładowymi danymi w pamięci. To celowe — pozwala rozwijać UI bez kluczy.

## Podpięcie Supabase (tryb produkcyjny)

1. Utwórz projekt Supabase (region **EU-Frankfurt**).
2. Wykonaj kolejno `supabase/migrations/0001_init.sql` → `0002_faza2.sql` → `0003_faza3.sql` → `0004_dodatek_f3.sql` → `0005_faza4.sql` → `0006_faza5.sql` w SQL Editor.
3. Załóż konto CEO (Authentication > Users) i nadaj rolę wg komentarza na końcu migracji 0001 (analogicznie `pracownik` — patrz koniec 0002).
4. Skopiuj `.env.example` do `.env.local` i uzupełnij `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (+ `SUPABASE_SERVICE_ROLE_KEY` — wymagany przez automat kont klientów i `POST /api/notifications`).

Role: `ceo` — pełny panel · `pracownik` — tylko `/zadania` · `klient` — tworzony automatem po opłacie, na razie tylko zmiana hasła (panel klienta w Fazie 3).

## Integracje dashboardu (opcjonalne ENV)

| Integracja | Zmienne | Bez kluczy |
|---|---|---|
| n8n | `N8N_BASE_URL`, `N8N_API_KEY` | mock |
| VPS | `VPS_HOST`, `VPS_METRICS_URL`, `VPS_METRICS_TOKEN` | mock |
| Healthchecks.io | `HC_API_KEY` (+ `HC_PING` dla workflowów) | mock |

Badge "live/mock" przy nagłówku dashboardu pokazuje źródło danych każdej integracji. Przypisanie workflowu n8n do klienta: tag `klient:Nazwa` w n8n.

## Deploy (Coolify)

Repo zawiera `Dockerfile` (Next standalone). W Coolify ustaw zmienne z `.env.example`; `NEXT_PUBLIC_*` podaj też jako **build args** (wypiekane w bundlu podczas builda).

```bash
docker build -t stronevo-os \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=... \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... .
docker run -p 3000:3000 --env-file .env stronevo-os
```

## Struktura

```
app/
  login/            # logowanie (Supabase Auth) / wejście demo
  (panel)/crm/      # Moduł A — pipeline
  (panel)/dashboard/# Moduł B — dashboard CEO
  actions/          # server actions (kontakty, auth)
components/         # crm/, dashboard/, ui/
lib/
  supabase/         # klienci SSR/browser + detekcja konfiguracji
  integrations/     # n8n, VPS, healthchecks (ENV + fallback-mock)
  demo-store.ts     # dane trybu demo (in-memory)
supabase/migrations # SQL: tabele, seed, RLS
```
