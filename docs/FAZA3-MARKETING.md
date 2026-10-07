# Faza 3 — Marketing (wpięcie)

Builder stron/funneli + formularze→leady + e-mail (Brevo/tracking/RODO) +
social planner + reputacja. ⛔ OPERATOR-FIRST: struktury, wysyłki, publikacje,
AI-szkice i integracje = operator; klient (hybryda w /klient) planuje posty,
odpowiada na opinie i edytuje treść — automatyzacji nie widzi i nie zmienia
(RLS: klient bez insertu do sites/forms/campaigns/submissions).

Migracje: `0018_faza3_strony_formularze.sql` + `0019_faza3_email_social_opinie.sql`.

## ENV

| Zmienna | Opis |
|---|---|
| `MARKETING_API_KEY` | sekret /api/email/send i /api/reviews/ingest (fallback `EVENTS_INGEST_KEY`) |
| `MARKETING_API_TOKEN` | Bearer /api/social/publish-due (fallback `NOTIFY_API_TOKEN`) |
| `BREVO_API_KEY` (+`BREVO_SENDER_NAME`) | wysyłka kampanii; bez tego fallback EMAIL_WEBHOOK_URL → SMTP LH; bez obu = honest-mock |
| `SOCIAL_PUBLISH_WEBHOOK_URL/_KEY` | router n8n → API FB/IG/GBP/LinkedIn (kredencjały w n8n) |
| `REVIEWS_REPLY_WEBHOOK_URL` | n8n → publikacja odpowiedzi na opinię w GBP |

## A. Strony

- Panel: `/marketing` → Strony (szablony: lokalna-usluga, promo-landing; sekcje
  hero/features/form/cta/testimonials/text/image/pricing; ↑↓/edytuj/usuń).
- Publiczny render: `https://crm.stronevo.pl/s/[slug]` (+ `/s/[slug]/[podstrona]`),
  tylko status „opublikowana", SEO z site_pages.seo, akcent z sites.theme.
- Własna domena klienta: rekord `sites.domena` + host w Traefiku (zadanie deployowe).

## B. Formularze

Blok `form` na stronie → publiczny `POST /api/forms/submit` → twarda zgoda RODO
→ lead w CRM właściciela (owner_contact_id) + notyfikacja + trigger operatora
(`forms.webhook_url` = webhook n8n on-submit, np. SMS-podziękowanie/sekwencja).

## C. E-mail marketing

- Kampania = bloki (hero/text/cta/image) → `POST /api/email/send {campaign_id}`
  (panel: „Wyślij teraz"; cron zaplanowanych: n8n → ten endpoint).
- RODO twarde: wysyłka WYŁĄCZNIE zgoda=true i opt_out=false; stopka każdego
  maila: informacja o zgodzie + **1-klik wypis** (`/api/email/unsub?c=<id>`).
- Tracking: pixel `/api/email/track/open`, kliki `/api/email/track/click`
  (302 na cel) → statystyki w panelu (otwarcia/kliknięcia %).

## D. Social planner

Klient/operator planuje posty (treść+kanały+termin). Cron co ~5 min:

```
*/5 * * * * curl -s -X POST -H "Authorization: Bearer $MARKETING_API_TOKEN" https://crm.stronevo.pl/api/social/publish-due
```

Publikacja przez router n8n (`SOCIAL_PUBLISH_WEBHOOK_URL`; body: post_id,
contact_id, kanaly, tresc, media) → Graph API/GBP/LinkedIn. Bez ENV = mock.

## E. Reputacja

- Prośba o opinię po usłudze (panel/klient): SMS/e-mail z linkiem (brama SMS / SMTP).
- Monitoring: workflow n8n (GBP API) → `POST /api/reviews/ingest`
  `{contact_id, zrodlo, autor, ocena, tresc, external_id}` (dedupe) → notyfikacja
  (ocena ≤3 = warn).
- Odpowiedź: AI-szkic (Claude przez lib/llm; fallback szablonowy) = operator;
  „Opublikuj odpowiedź" → zapis + `REVIEWS_REPLY_WEBHOOK_URL` (n8n → GBP).

## Weryfikacja

```
node scripts/verify-faza3-marketing.mjs   # strona/lead/kampania/tracking/social/opinie + RLS (live)
```
