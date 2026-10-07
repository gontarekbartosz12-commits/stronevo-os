# Panel Wyników — wpięcie źródeł zdarzeń (ingest)

Każde wdrożenie (Ada, chatbot, opinie, n8n, brama SMS) po zdarzeniu wysyła
`POST /api/events/ingest`. Panel sam dolicza minuty i ~zł (event_values × stawka),
aktualizuje zdrowie wdrożenia i — przy błędzie — tworzy powiadomienie (self-healing).

## Endpoint

```
POST {APP_URL}/api/events/ingest
Headers:
  Content-Type: application/json
  x-ingest-key: <EVENTS_INGEST_KEY>        # ustaw w ENV aplikacji (Coolify) i w n8n
Body:
  {
    "client_automation_id": "<uuid z client_automations>",  // preferowane (aktualizuje zdrowie)
    // albo: "contact_id": "<uuid klienta>",
    "typ": "rozmowa_odebrana | lead_zlapany | rezerwacja | sms_wyslany | opinia_zebrana | workflow_run | blad",
    "zrodlo": "ada | chatbot | opinie | n8n | sms",
    "meta": { "po_godzinach": true }        // opcjonalne; przy typ=blad: { "blad": "opis" }
  }
```

Odpowiedź: `{ ok, event_id, minuty_oszczedzone, wartosc_pln }`.

## ENV (aplikacja)

| Zmienna | Opis |
|---|---|
| `EVENTS_INGEST_KEY` | sekret ingestu i `/api/wyniki/summary` (bez niego endpoint otwarty — tylko dev/demo) |
| `REPORTS_API_TOKEN` | Bearer dla crona raportów `/api/reports/run` (fallback: `NOTIFY_API_TOKEN`) |
| `WYNIKI_STAWKA_PLN_H` | globalna stawka zł/h (domyślnie 60; per klient: `contacts.stawka_pln_h`) |
| `WYNIKI_HEALTH_OK_H` / `WYNIKI_HEALTH_BLAD_D` | progi zdrowia (domyślnie 48 h / 7 dni) |

## Gotowy node n8n (HTTP Request)

Wklej do dowolnego workflow (Ctrl+V na canvasie), podmień `client_automation_id` i `typ`:

```json
{
  "nodes": [
    {
      "parameters": {
        "method": "POST",
        "url": "={{ $env.STRONEVO_APP_URL }}/api/events/ingest",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "x-ingest-key", "value": "={{ $env.STRONEVO_INGEST_KEY }}" }
          ]
        },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ client_automation_id: 'WSTAW-UUID-WDROZENIA', typ: 'lead_zlapany', zrodlo: 'chatbot', meta: { po_godzinach: $now.hour >= 17 || $now.hour < 8 } }) }}",
        "options": {}
      },
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [0, 0],
      "name": "STRONEVO — zdarzenie wyniku"
    }
  ],
  "connections": {},
  "pinData": {}
}
```

W n8n ustaw zmienne środowiskowe: `STRONEVO_APP_URL=https://crm.stronevo.pl`,
`STRONEVO_INGEST_KEY=<EVENTS_INGEST_KEY>`.

## Gdzie wpiąć per źródło

| Źródło | Moment | typ / zrodlo |
|---|---|---|
| **Ada (Vapi + n8n booking)** | po zakończonej rozmowie | `rozmowa_odebrana` / `ada` |
| | po umówieniu wizyty (booking OK) | `rezerwacja` / `ada` |
| **Brama SMS** (darmowa, na numerach) | po każdej wysyłce | `sms_wyslany` / `sms` |
| **Chatbot (n8n)** | po zebraniu leada (mail/telefon) | `lead_zlapany` / `chatbot` + `meta.po_godzinach` |
| **Opinie (n8n)** | po wykryciu nowej opinii Google | `opinia_zebrana` / `opinie` |
| **Dowolny workflow n8n** | na końcu udanego przebiegu | `workflow_run` / `n8n` |
| **Error Trigger (n8n)** | w workflow błędów | `blad` / `n8n` + `meta.blad` |

Tip: w każdym workflow klienta dodaj na końcu node `workflow_run` — nawet gdy nic
"biznesowego" się nie dzieje, Panel widzi, że wdrożenie żyje (zdrowie = OK).

## Cron raportu miesięcznego

n8n Schedule Trigger (`0 6 1 * *`, 1. dzień miesiąca 06:00) → HTTP Request:

```
POST {APP_URL}/api/reports/run
Authorization: Bearer <REPORTS_API_TOKEN>
```

Alternatywnie cron na VPS (Coolify/crontab):

```
0 6 1 * * curl -s -X POST -H "Authorization: Bearer $REPORTS_API_TOKEN" https://crm.stronevo.pl/api/reports/run
```

Raport agreguje poprzedni miesiąc per klient, zapisuje `monthly_reports`
(ponowne uruchomienie nadpisuje, nie dubluje) i wysyła mail (kanał n8n → SMTP LH,
`kontakt@stronevo.pl`) z linkiem do brandowanej strony `/raport/[id]`.

## Podgląd twardych danych (weryfikacja / integracje)

```
GET {APP_URL}/api/wyniki/summary?contact_id=<uuid>&days=30
GET {APP_URL}/api/wyniki/summary?contact_id=<uuid>&okres=2026-06
Headers: x-ingest-key: <EVENTS_INGEST_KEY>
```

Pełny test end-to-end: `node scripts/verify-panel-wynikow.mjs` (dev server musi działać).
