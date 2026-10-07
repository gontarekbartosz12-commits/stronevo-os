# Faza 4 — Commerce (wpięcie)

Płatności PL (P24/PayU/Stripe) + text-to-pay, subskrypcje z auto-obciążeniem,
membership/kursy. ⚠️ **PRAWDZIWE PIENIĄDZE**: kwoty dokładne (nie ~szacunek),
każdy webhook weryfikowany kryptograficznie, kwota webhooka musi zgadzać się
z linkiem (rozjazd = 400 + alert operatora), idempotencja (drugi webhook =
already_paid). ⛔ OPERATOR-FIRST: bramki/subskrypcje/struktura kursów =
operator; klient (użytkowo) wystawia linki text-to-pay i edytuje treść lekcji.

Migracje: `0020_faza4_platnosci.sql` + `0021_faza4_kursy.sql`.
(Sklep products/orders z briefu = celowo odłożony — DoD go nie wymaga.)

## ENV — bramki (provider wybierany automatycznie: P24 → Stripe → PayU → mock)

| Zmienna | Opis |
|---|---|
| `P24_MERCHANT_ID` `P24_POS_ID` `P24_CRC` `P24_API_KEY` (+`P24_SANDBOX=1`) | Przelewy24 (register + weryfikacja sign SHA-384) |
| `STRIPE_SECRET_KEY` `STRIPE_WEBHOOK_SECRET` | Stripe Checkout (karty) + podpis HMAC webhooka |
| `PAYU_POS_ID` `PAYU_CLIENT_ID` `PAYU_CLIENT_SECRET` `PAYU_SECOND_KEY` | PayU (OAuth + orders; notify: OpenPayU-Signature MD5) |
| `PAYMENTS_API_TOKEN` | Bearer crona /api/subscriptions/charge-due (fallback `NOTIFY_API_TOKEN`) |
| `MOCK_PAYMENTS_SECRET` | sekret HMAC symulacji demo (fallback `EVENTS_INGEST_KEY`; bez ENV stała demo) |

Webhook w panelu bramki: `https://crm.stronevo.pl/api/payments/webhook?provider=p24`
(analogicznie `stripe`/`payu`). Przy skonfigurowanej bramce endpoint symulacji
`/api/payments/mock-pay` zwraca 403.

## A. Text-to-pay

Panel `/commerce` → Płatności (operator) lub `/klient` → Płatności (klient dla
swojej firmy): kwota + opis + telefon → link `/pay/[token]` SMS-em. Opłata →
webhook → **faktura (Fakturownia) + rekord invoices + notyfikacja + alert**.
Link kursowy: `meta.course_id` → po opłacie enrollment + SMS/e-mail z dostępem.

## B. Subskrypcje

Operator tworzy w `/commerce` → Subskrypcje (plan, kwota, cykl, next_charge;
spięcie z client_automations przez `client_automation_id`). Cron dzienny:

```
0 7 * * * curl -s -X POST -H "Authorization: Bearer $PAYMENTS_API_TOKEN" https://crm.stronevo.pl/api/subscriptions/charge-due
```

Obciążenie: **Stripe off-session** (gdy `provider_ref` = customer z zapisaną
kartą) → payment + faktura + next_charge +1 cykl. Bez zapisanej karty
(P24/PayU nie mają prostego recurring bez tokenizacji): **smart dunning** —
automatyczny link text-to-pay SMS-em + notyfikacja. Nieudane obciążenie karty →
status `zalegla` + alert. **MRR**: aktywne subskrypcje liczą się w Panelu
Przychodów (uwaga: nie dublować abonamentu klienta w umowie i subskrypcji).

## C. Kursy / membership

Operator: `/commerce` → Kursy (kurs → lekcje; klient edytuje TREŚĆ lekcji —
hybryda). Dostęp kursanta: kapability `/kurs/[token]` — po zakupie (link
z `meta.course_id`) albo „+ Nadaj dostęp". Postęp: `/api/kurs/progress`
(auth = token). Forum-lite = opcja z briefu, odłożona świadomie.

## Weryfikacja

```
node scripts/verify-faza4-commerce.mjs   # podpisy/kwoty/idempotencja/kurs/subskrypcje + RLS (live)
```
