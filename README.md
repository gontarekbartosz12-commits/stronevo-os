# STRONEVO OS — AI operations platform + "Ada" Polish voice agent

**Author:** Bartosz Gontarek · STRONEVO.AI (Poland)
**Status:** in production for my own company (panel at `crm.stronevo.pl`, voice agent answering a real Polish phone line) · built July 2026
**Role:** sole designer and builder — architecture, prompts, integrations, deployment. Built AI-first with Claude Code as the main development tool.

> This repository is a **sanitised portfolio copy**. No API keys, tokens or customer data are included.
> Company identifiers in the contract templates are replaced with placeholders. The UI and business
> documents are in Polish because the product serves Polish small businesses.

---

## What it is in one paragraph

STRONEVO OS is the back office for a small AI-automation business: a CRM with a sales pipeline,
a CEO dashboard, a service catalogue with contracts and invoices, a client portal, marketing tools,
and a control plane for AI agents. Plugged into it is **Ada**, a Polish-speaking voice receptionist
(Vapi + Deepgram + GPT-4o-mini + ElevenLabs) that answers or places calls, checks a Google Calendar,
books a Google Meet consultation, sends an SMS confirmation and drops the lead into the CRM with
status "booked". The whole thing is glued together with self-hosted **n8n** workflows and
**Supabase** (Postgres + Auth + RLS), running in Docker on a VPS.

## End-to-end flow (what actually runs)

```
 Lead source                    Conversational layer                  Back office
 ───────────                    ────────────────────                  ───────────
 website form / chat ─┐
 Meta ad lead ────────┼──► n8n "lead-in" ──► Ada OUTBOUND call ──┐
 phone call ──────────┴──────────────────► Ada RECEPTION ────────┤
 website voice widget ───────────────────► Ada WIDGET ───────────┤
                                                                 ▼
                                        tool: check_slots ──► n8n ──► Google Calendar freeBusy
                                        tool: book_slot   ──► n8n ──► Calendar event + Meet link
                                                                 │
                                                                 ▼
                                           /api/leads/booked (Next.js) ──► Supabase: contact = BOOKED
                                                                 ├──► SMS confirmation (SMSAPI)
                                                                 ├──► e-mail (Resend)
                                                                 └──► Telegram alert to owner
                       n8n cron 08:00 ──► same-day SMS reminder · no-show follow-up
                       n8n error workflow ──► Telegram alert if any workflow fails
```

## Voice agent "Ada" — the conversational-AI part

Three Vapi assistants share one engine configuration and differ only in prompt:
**reception** (inbound phone number), **widget** (voice demo on the website), **outbound**
(calls a lead seconds after they leave a number).

What I had to solve to make it work well **in Polish over an 8 kHz phone line**:

| Problem | What I did | Result |
|---|---|---|
| Slow turns (3.4 s) | Measured real latency per component from Vapi `performanceMetrics` instead of trusting dashboard presets; switched STT from ElevenLabs Scribe v2 to clean Deepgram nova-2 | turn ≈ **2.0 s** (STT 281 ms, LLM 356 ms, TTS 438 ms) |
| Phone numbers mis-heard | Prompt collects the number in three groups of three digits with confirmation; `numerals` and keyword boosting turned off (they caused hallucinated digits/names) | reliable 9-digit capture |
| Interrupting / cutting the caller off | Tuned endpointing (0.55 s without punctuation, 1.5 s after digits) and barge-in (2 words, Polish acknowledgement phrases ignored) | natural turn-taking |
| Robotic read-out of times and acronyms | 74 text-to-speech replacements ("14:00" → "o czternastej", "SMS" → "esemes") | sounds like a person |
| Polish grammar (formal address, vocative, gender) | Name-first flow, vocative forms, gender inferred from first name, asks when unsure | polite "Pan/Pani" address |
| Hallucinated bookings | Ada may confirm only after the `book_slot` tool returns success; n8n guard blocks a "booked" status if Google rejects the event | no phantom appointments |
| Honesty / AI Act art. 50 | Ada discloses she is an AI at the start of every call | compliant by design |

Details, the full engine config and the outbound system prompt: [`voice-agent-ada/`](voice-agent-ada/).

## Platform modules (Next.js app)

| Area | What it does |
|---|---|
| **CRM pipeline** `/crm` | Kanban + list, stages New → Contacted → Booked → After demo → Offer → Client / Lost, next-action dates, notes, full contact card |
| **CEO dashboard** `/dashboard` | n8n workflow health, VPS metrics, healthchecks, revenue tiles — every integration has a mock fallback so the panel runs without keys |
| **Service catalogue + contracts** `/katalog`, `/umowa/[id]` | Assign a service → provisioning record + task + set-up invoice + recurring invoice; contract generated from a template, e-acceptance with timestamp + IP, termination form |
| **Client portal** `/klient` | Client sees only their own data (Supabase RLS): automations, invoices, upsell with bundle discounts, live call log with "after hours" flag |
| **Conversations** `/rozmowy` | One inbox for all channels (web chat, SMS, e-mail; WhatsApp/Messenger via n8n router), AI bot answering from the company knowledge base (**RAG on pgvector**, keyword fallback), embeddable web-chat widget |
| **Marketing** `/marketing`, `/audiencje` | E-mail campaigns with open/click tracking, CRM segments pushed to **Meta Custom Audiences** (SHA-256 hashed), social post scheduling, review requests |
| **Results / value panel** `/wyniki` | Calls answered, after-hours calls caught, conservative estimate of recovered revenue; "Voice of Customer" topics extracted by an LLM from call transcripts |
| **Agent control plane** `/agenci`, `/zadania` | Build queue for AI agents: task → agent run → human review → approve → deploy. **Agents never deploy on their own.** Technical alerts automatically open a repair task (self-healing loop) |
| **Pluggable LLM** `lib/llm/provider.ts` | One module for every AI call; `LLM_PROVIDER` = anthropic / openai / self-hosted (OpenAI-compatible vLLM/TGI) |
| **Booking, courses, payments** | Public booking page, mini course platform, payment flow (mock until P24/Stripe is switched on) |
| **Desktop app** `desktop/` | Tauri wrapper (.exe) with auto-update manifest served by the panel |

## Tech stack

- **Frontend/backend:** Next.js 15 (App Router, Server Actions), React 19, TypeScript, Tailwind CSS
- **Data:** Supabase — Postgres, Auth, Row-Level Security, 23 SQL migrations (`supabase/migrations/`)
- **Automation:** self-hosted n8n (Calendar check/book, SMS reminders, lead → call, lead → Telegram, forms/chatbot → CRM, usage metering, error/health workflow)
- **Voice:** Vapi (orchestration), Deepgram nova-2 (STT), OpenAI GPT-4o-mini (LLM), ElevenLabs Flash v2.5 (TTS), Polish phone number via SIP
- **Messaging:** SMSAPI, Resend (e-mail, verified domain), Telegram bot alerts, Brevo
- **Observability:** Sentry (env-gated), PostHog (EU), n8n error workflow → Telegram
- **Infra:** Docker on a VPS behind Traefik/Coolify, TLS, `rebuild.sh` + `run.sh` deploy
- **Size:** ~30 k lines of TypeScript, 31 pages, 35 API routes, 14 integration modules

## Engineering choices I'd point to in an interview

1. **Every integration degrades to a mock.** No key → the module returns realistic demo data and labels it `mock`. The panel always boots, and I can develop UI without production secrets.
2. **Human in the loop for anything irreversible.** Agents propose, a human approves deploys; cutting off a client's access needs confirmation.
3. **Measure, don't guess.** Voice latency decisions came from per-call metrics, which showed the vendor dashboard was off by ~5× for one STT model.
4. **Multi-tenant safety.** Clients only ever see their own rows (Supabase RLS + DB triggers); caller numbers are masked outside the owner's panel (GDPR). In the server version call attribution goes through a single function, so one client can never see another client's calls.
5. **One source of truth per concern.** All AI calls go through one provider module; all SMS sending goes through one function that normalises Polish numbers.

## Run it locally (demo mode, no keys needed)

```bash
npm install
npm run dev
```

Without a `.env` file the panel starts in **demo mode**: no login, in-memory sample data (fictional companies with `.example` domains). Production setup (Supabase migrations, roles, env variables) is described in [`docs/README-PL.md`](docs/README-PL.md) and `.env.example`.

## Repository map

```
app/                 Next.js routes — (panel)/ = internal panel, klient/ = client portal, api/ = 35 endpoints
components/          UI components (CRM, contracts, invoices, value panel…)
lib/                 business logic; lib/integrations/ = n8n, Meta, SMS, Vapi calls, VoC, Fakturownia…
lib/llm/provider.ts  pluggable LLM provider
supabase/migrations/ database schema + RLS policies
desktop/             Tauri desktop wrapper
docs/                build phases (FAZA1–5) and the original Polish README
scripts/             verification scripts per build phase
voice-agent-ada/     voice agent: engine config, system prompt, n8n workflows
```

## Note on this snapshot

This is the code as of **7 July 2026**. Later production changes on the server (Resend e-mail,
Sentry, PostHog, LLM-based Voice-of-Customer from real Vapi transcripts, handwritten contract signature, auth hardening) are
described above but are not all in this snapshot.

Related public repos: [portfolio](https://github.com/gontarekbartosz12-commits/portfolio) ·
[n8n-ai-automation-portfolio](https://github.com/gontarekbartosz12-commits/n8n-ai-automation-portfolio) ·
[copilot-studio-agents](https://github.com/gontarekbartosz12-commits/copilot-studio-agents)
