# Faza 2 — Conversations (wpięcie)

Jedna skrzynka na wszystkie kanały + bot AI z wiedzy firmy (RAG).
⛔ MODEL OPERATOR-FIRST: kanały, bota i bazę wiedzy wpina/konfiguruje WYŁĄCZNIE
operator (STRONEVO). Klient w /klient obsługuje codzienny ruch (czyta, odpowiada,
zamyka wątki, szablony) — konfiguracji automatyzacji nie widzi i nie zmienia
(w DB pilnuje tego trigger `conversations_guard_klient` + brak polityk insert).

## ENV

| Zmienna | Opis |
|---|---|
| `CONVERSATIONS_INGEST_KEY` | sekret ingest/send/ai-reply/knowledge (fallback: `EVENTS_INGEST_KEY`) |
| `CONVERSATIONS_SEND_WEBHOOK_URL/_KEY` | router n8n wysyłki WhatsApp/FB/IG/GBP (SMS/e-mail idą istniejącymi kanałami) |
| `LLM_PROVIDER/LLM_KEY/LLM_MODEL` | Claude do odpowiedzi (bez tego: deterministyczny fallback keyword — bot dalej odpowiada z wiedzy) |
| `EMBEDDINGS_BASE_URL/_KEY/_MODEL` | embeddingi RAG (OpenAI-compatible, 1536 dim); bez tego: keyword search |

Migracja: `0017_faza2_conversations.sql` (wymaga rozszerzenia `vector` — Supabase EU ma).

## Wpinanie kanałów (n8n → ingest)

Każdy kanał = webhook n8n, który POST-uje przychodzącą wiadomość:

```
POST {APP_URL}/api/conversations/ingest
Headers: x-ingest-key: <CONVERSATIONS_INGEST_KEY>
Body: {
  "owner_contact_id": "<uuid firmy-klienta>",   // brak/null = skrzynka STRONEVO
  "channel": "sms|email|whatsapp|webchat|fb|ig|gbp",
  "external": { "imie": "...", "telefon": "+48...", "email": "...", "session_id": "..." },
  "body": "treść wiadomości"
}
```

Upsert wątku po (owner, channel, session_id→telefon→email). Jeśli wątek ma
`ai_auto=true` — bot odpowiada od razu (odpowiedź w response.ai).

Źródła per kanał: SMS = webhook bramy (TextBee/SMSGate „on receive") · e-mail =
Brevo inbound parse / IMAP node · WhatsApp = Cloud API webhook · FB/IG = Messenger
webhook · GBP = Google Business messages. Wszystko mapuje n8n → jeden ingest.

## Wysyłka

UI panelu wysyła przez server action (sendReply). Integracje zewnętrzne:

```
POST {APP_URL}/api/conversations/send   (x-ingest-key)
Body: { "conversation_id": "...", "body": "...", "author": "human|ai" }
```

Routing: sms→brama/Zadarma · email→webhook n8n (SMTP LH/Brevo) · webchat→polling
widgetu · whatsapp/fb/ig/gbp→`CONVERSATIONS_SEND_WEBHOOK_URL` (router n8n).

## Bot AI (Conversation AI)

- Toggle „Bot AI" per rozmowa — TYLKO w panelu operatora (/rozmowy).
- Przychodząca → RAG (pgvector `match_knowledge_docs`, fallback keyword) → Claude
  → JSON-decyzja `odpowiedz` / `eskalacja`. Bot NIGDY nie zmyśla: brak wiedzy lub
  prośba o kontakt = eskalacja → **lead w CRM właściciela skrzynki + notyfikacja
  + alert Telegram/SMS do operatora**.
- Na żądanie: `POST /api/conversations/ai-reply {conversation_id, send:false}` = szkic.

Baza wiedzy (zasila operator, np. przy wdrożeniu):

```
POST {APP_URL}/api/knowledge/ingest   (x-ingest-key)
Body: { "contact_id": "<uuid firmy>", "docs": [{ "tytul": "Cennik", "tresc": "..." }] }
```

Endpoint sam liczy embeddingi (gdy `EMBEDDINGS_*` ustawione).

## Widget czatu WWW

Operator wkleja na stronę klienta jedną linijkę:

```html
<script src="https://crm.stronevo.pl/api/webchat/widget"
        data-owner="<uuid firmy>" data-name="Nazwa firmy" defer></script>
```

Webchat: nowy wątek dostaje `ai_auto=true` (bot wita i odpowiada z wiedzy firmy),
realtime przez polling `/api/webchat/poll` (capability = session_id widgetu).
Podgląd: `/webchat-demo`.

## Weryfikacja

```
node scripts/verify-faza2-conversations.mjs   # kanały/AI/webchat/operator-first + RLS (live)
```
