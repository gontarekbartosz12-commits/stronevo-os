# Ada — Polish AI voice receptionist

Ada answers the phone, calls back new leads and runs the voice demo on the STRONEVO website.
Her only job is to book a 30-minute Google Meet consultation, confirm it by SMS and put the lead into the CRM.

## Three assistants, one engine

| Assistant | Channel | Difference |
|---|---|---|
| Reception | inbound calls to a Polish phone number | answers questions, books, takes a message after hours |
| Widget | "talk to Ada" button on the website | collects the caller's number (3 × 3 digits with confirmation), no prices |
| Outbound | calls a lead seconds after a web form is submitted | opens with the reason for the call, max 2 objection attempts |

All three share the same STT / LLM / TTS / endpointing settings; only the prompts differ.
Every change to the engine is rolled out to all three.

## Engine configuration (production, July 2026)

```jsonc
{
  "transcriber": {
    "provider": "deepgram", "model": "nova-2", "language": "pl",
    // deliberately NO keywords and NO numerals — both caused hallucinated names/digits
    "fallbackPlan": { "transcribers": [
      { "provider": "speechmatics", "model": "default", "language": "pl" },
      { "provider": "11labs", "model": "scribe_v1", "language": "pl" }
    ]}
  },
  "model": { "provider": "openai", "model": "gpt-4o-mini", "temperature": 0.4, "maxTokens": 300 },
  "voice": {
    "provider": "11labs", "model": "eleven_flash_v2_5",
    "chunkPlan": { "formatPlan": { "replacements": "74 rules, e.g. '14:00' -> 'o czternastej', 'SMS' -> 'esemes'" } }
  },
  "startSpeakingPlan": {
    "waitSeconds": 0.2,
    "transcriptionEndpointingPlan": {
      "onPunctuationSeconds": 0.1, "onNoPunctuationSeconds": 0.55, "onNumberSeconds": 1.5
    }
  },
  "stopSpeakingPlan": { "numWords": 2, "acknowledgementPhrases": ["tak", "aha", "okej", "mhm", "rozumiem"] },
  "firstMessageMode": "assistant-speaks-first",
  "backgroundSound": "off"
}
```

## Measured latency (Vapi `call.artifact.performanceMetrics`, Polish, 8 kHz phone audio)

| Component | Before | After |
|---|---|---|
| STT | 2117 ms (ElevenLabs Scribe v2 — the dashboard preset claimed 430 ms) | **281 ms** (Deepgram nova-2, clean config) |
| LLM | 680 ms (GPT-4o) | **356 ms** (GPT-4o-mini) |
| TTS | — | 438 ms (ElevenLabs Flash v2.5) |
| **Full turn** | 3434 ms | **≈ 2052 ms** |

Lesson: vendor dashboards and marketing numbers were off by up to 5×; every decision was made on per-call metrics.

## Prompt techniques that mattered for Polish

1. **Unclear or empty input → "Sorry, I didn't catch that, could you repeat?"**, never "I can't help with that" (off-topic refusal on noisy audio was the worst failure mode).
2. **Phone numbers in three groups of three digits**, each confirmed, then read back digit by digit.
3. **Name first, then vocative + formal address** ("Pani Aniu", "Panie Marku"); names ending in -a are treated as female; if the name is garbled, ask instead of guessing.
4. **Specific time requested → always re-check it with `check_slots(time_hint)`** — the tool returns only 2–3 example slots, so "I don't have 11:00" without checking was a bug.
5. **Offer a choice of two slots**, never an open question.
6. **Confirm only after `book_slot` returns success**, then one closing sentence and end the call (no "anything else?" loops).
7. **Discloses being an AI** at the start of every call (honesty + EU AI Act art. 50).

The full outbound prompt (Polish) is in [`system-prompt-outbound-pl.txt`](system-prompt-outbound-pl.txt).

## Tools → n8n → Google Calendar / CRM

| Tool | n8n workflow | What happens |
|---|---|---|
| `check_slots` | `ada-wf-B-kalendarz.json` | Google Calendar freeBusy across the main + dedicated consultations calendar, returns 2–3 slots spread over the day |
| `book_slot` | `ada-wf-B-kalendarz.json` | creates the event with a Google Meet link, stores phone/name in event properties, calls the CRM (`/api/leads/booked`) → contact = BOOKED, SMS + e-mail + Telegram |
| lead in | `ada-wf-A-lead.json` | validates the web lead (empty name + phone = stop), triggers the outbound Vapi call |
| end of call | `ada-wf-C-eoc.json` | parses the end-of-call report, Telegram summary, SMS when a booking was made |

Separate workflows (not exported here) send same-day SMS reminders at 08:00, follow up no-shows,
meter call minutes per client and alert on Telegram when any workflow errors.
IDs, credentials and chat IDs in the exported JSON are replaced with `<PLACEHOLDERS>`.

## Business numbers (honest)

- Cost of one conversation minute: **≈ 0.47 PLN** (Vapi + telephony + STT + LLM; ElevenLabs is billed on a separate plan).
- Used in production for my own company's lead handling. I'm not claiming paying-client deployments of Ada.
