# Faza 5 — Produktyzacja + głębia CRM (wpięcie)

Snapshots (klonowanie setupów) + custom objects/smart lists + kalendarze
bookingu (round-robin/collective/class) + Ad Manager. BEZ rebilling/SaaS-mode.
⛔ OPERATOR-FIRST: snapshoty, schematy obiektów, kalendarze i kampanie =
operator; rekordy obiektów i smart listy = funkcje użytkowe.

Migracje: `0022_faza5_snapshoty_crm.sql` + `0023_faza5_kalendarze_ads.sql`.

## A. Snapshots (`/agenci` → Snapshoty)

- „📸 Utwórz snapshot" z klienta X = zrzut: automatyzacje (z wersjami szablonów),
  szablony wiadomości, **wiedza bota (Conversation AI)**, monitoring uptime.
- „🚀 Wdroż" u klienta Y (1-klik): client_automations (provisioning) + **taski
  build w control-plane agentów** (/zadania, /agenci) + klon golden-template
  n8n (resolveGoldenTemplate→cloneN8nWorkflow→tag `klient:`; bez N8N_* agent
  sklonuje przy buildzie) + szablony + wiedza (bot odpowiada od razu) +
  monitory uptime (nieaktywne do podmiany URL). Rozliczenie (faktury/subskrypcja)
  spina operator osobno — snapshot nie dotyka pieniędzy.

## B. Custom objects + smart lists (`/baza`)

- Typ obiektu (schemat pól text/number/date) tworzy operator; rekordy = dane
  robocze (RLS: klient CRUD own records, read own schematy).
- Smart listy = zapisane filtry kontaktów (etapy pipeline, miasto, ma
  telefon/e-mail...) liczone na żywo; klient może zapisywać własne (RLS own).

## C. Kalendarze bookingu (`/rezerwacje` + widget `/rezerwacja/[slug]`)

- Typy: osobisty · **round-robin** (rotacja: członek z najmniejszą liczbą
  rezerwacji) · collective (cały zespół) · class (limit miejsc na slot).
- Widget publiczny: 7 dni → wolne sloty (serwer liczy kolizje/capacity) → dane
  → rezerwacja tworzy **lead w CRM właściciela** (status UMOWIONY, przypisany
  członek) + notyfikację + webhook operatora:

| ENV | Opis |
|---|---|
| `BOOKING_WEBHOOK_URL` | n8n po rezerwacji (sync Google Calendar/Cal.com, SMS potwierdzenie, przypomnienia — buduje operator) |

## D. Ad Manager (`/marketing` → Reklamy)

- Kampanie Meta/Google per firma, spięte z segmentami `/audiencje`.
- `ADS_LAUNCH_WEBHOOK_URL` — uruchomienie przez n8n (Marketing API / Google Ads
  API; kredencjały w n8n); `ADS_SYNC_WEBHOOK_URL` — metryki. Cron:

```
0 */6 * * * curl -s -X POST -H "Authorization: Bearer $MARKETING_API_TOKEN" https://crm.stronevo.pl/api/ads/sync
```

Bez ENV: metryki = jawna symulacja (demo pokazuje żywy raport).

## Weryfikacja

```
node scripts/verify-faza5-produktyzacja.mjs   # RR-rotacja/kolizje/class, obiekty, listy, ads + RLS (live)
```

Snapshot E2E (create→deploy→bot działa u nowego klienta) — przeklikiwane
w przeglądarce (server actions), patrz raport fazy.
