# Faza 1 — Warstwa zaufania operacyjnego (wpięcie)

Warstwa aplikacji: błędy floty, uptime, portal dostępów, rejestr wersji.
Self-host narzędzi (Langfuse/Grafana/Uptime-Kuma/Infisical) = osobne zadanie deployowe.

## ENV

| Zmienna | Opis |
|---|---|
| `ERRORS_INGEST_KEY` | sekret `/api/errors/ingest` (fallback: `EVENTS_INGEST_KEY` — może być jeden wspólny) |
| `UPTIME_API_TOKEN` | Bearer dla `/api/uptime/run` (fallback: `NOTIFY_API_TOKEN`) |
| `REMINDERS_API_TOKEN` | Bearer dla `/api/credentials/remind` (fallback: `NOTIFY_API_TOKEN`) |
| `ALERT_SMS_TO` | numer operatora na alerty SMS (darmowa brama / Zadarma wg sms.ts); brak = tylko Telegram |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | kanał alertów (już istnieje) |

Migracja: `supabase/migrations/0016_faza1_zaufanie.sql` (psql jak poprzednie).

## A. Zdrowie floty — globalny Error-Workflow n8n

W n8n: **Settings → Error Workflow** każdego workflowa klienta (albo domyślny
globalny) ustaw na workflow: `Error Trigger` → `HTTP Request`:

```
POST {APP_URL}/api/errors/ingest
Headers: x-ingest-key: <ERRORS_INGEST_KEY>
Body (JSON):
{
  "client_automation_id": "WSTAW-UUID-WDROZENIA",   // lub pomiń i podaj contact_id
  "workflow_id": "={{ $json.workflow.id }}",
  "node": "={{ $json.execution.lastNodeExecuted }}",
  "message": "={{ $json.execution.error.message }}",
  "severity": "warn",                                 // info | warn | krytyczne
  "meta": { "execution_id": "={{ $json.execution.id }}" }
}
```

Efekt: wpis w `workflow_errors` + powiadomienie (self-healing) + alert
Telegram/SMS + czerwony wiersz w `/wyniki` → „Zdrowie wdrożeń" (przycisk
„Utwórz zadanie remediacji" i „Rozwiązany ✓").

## B. Uptime — cron

```
* * * * * curl -s -X POST -H "Authorization: Bearer $UPTIME_API_TOKEN" https://crm.stronevo.pl/api/uptime/run
```

Cron może iść co minutę — endpoint pinguje tylko checki, którym minął
`interval_min`. Monitory dodaje się wierszami w `uptime_checks` przy deployu
wdrożenia (nazwa, url healthchecka webhooka, contact_id, client_automation_id).
Przejście ok→fail = powiadomienie + alert; fail→ok = powiadomienie info.
Widżety: `/wyniki` (pełne) i `/klient` („Dostępność Twoich usług", 99,x% w tym miesiącu).

## C. Portal dostępów

- Checklistę sieje `assignAutomation` (z `automations_catalog.wymagania_od_klienta`).
- Klient uzupełnia KROKOWO w `/klient` (wartości maskowane; plaintext tylko server-side).
- **Brama**: po opłacie provisioning startuje TYLKO przy komplecie dostępów;
  bez kompletu → powiadomienie „Opłacone, ale czekamy na dostępy", a po
  uzupełnieniu ostatniego kroku promocja do budowy dzieje się automatycznie.
- Follow-up SMS+e-mail aż do kompletu — cron dzienny:

```
0 10 * * * curl -s -X POST -H "Authorization: Bearer $REMINDERS_API_TOKEN" https://crm.stronevo.pl/api/credentials/remind
```

## D. Rejestr wersji

- `template_versions` (nazwa, wersja, opis, n8n_json_ref) — nowa wersja = nowy wiersz.
- Przy deployu/aktualizacji ustaw `client_automations.template_version = 'nazwa@wersja'`.
- Widok „która wersja u którego klienta" + „do aktualizacji": `/agenci` (dół strony).

## Weryfikacja

```
node scripts/verify-faza1-zaufanie.mjs      # A/B/C/D + RLS (live)
node scripts/verify-panel-wynikow.mjs       # regresja Panelu Wyników
```
