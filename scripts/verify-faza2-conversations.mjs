// Weryfikacja FAZY 2 „Conversations" na twardych danych.
// Uruchom przy działającym serwerze: node scripts/verify-faza2-conversations.mjs
//
// Testy:
//  A. Ingest z KAŻDEGO kanału → wątek w inboxie /rozmowy (+ upsert po external).
//  B. Conversation AI: odpowiedź z wiedzy firmy (cennik) + eskalacja przy
//     prośbie o kontakt → lead w CRM klienta + notyfikacja + alert.
//  C. Webchat: widget.js, /message (bot odpowiada od razu), /poll (capability
//     session_id; zły session = 404).
//  D. OPERATOR-FIRST: klient nie widzi konfiguracji bota (toggle/szkic AI
//     tylko w panelu operatora), skrzynka klienta nie zawiera cudzych rozmów.
//  E. RLS (live + TEST_KLIENT_EMAIL/PASSWORD): klient widzi tylko swoje
//     conversations/messages/knowledge_docs; nie insertuje przychodzących,
//     nie zmienia ai_auto (trigger), nie pisze do knowledge_docs.
//
// ENV: BASE_URL (default http://localhost:3000), CONVERSATIONS_INGEST_KEY/EVENTS_INGEST_KEY.

const BASE = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const KEY = process.env.CONVERSATIONS_INGEST_KEY || process.env.EVENTS_INGEST_KEY || '';

let failures = 0;
let passed = 0;

function check(name, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failures++;
    console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function post(path, body, withKey = true) {
  const h = { 'Content-Type': 'application/json' };
  if (withKey && KEY) h['x-ingest-key'] = KEY;
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: h, body: JSON.stringify(body ?? {}) });
  let json = {};
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

async function pageText(path) {
  const res = await fetch(`${BASE}${path}`);
  const text = (await res.text()).replace(/<!--.*?-->/g, '').toLowerCase();
  return { status: res.status, text };
}

const stamp = Math.floor(Date.now() / 1000);

async function main() {
  console.log(`\n=== Weryfikacja Fazy 2 (Conversations) @ ${BASE} ===\n`);

  // ---- A. Ingest z każdego kanału ----
  console.log('[A] ingest per kanał → inbox');
  const kanaly = [
    { channel: 'sms', external: { imie: `Test SMS ${stamp}`, telefon: `+48 700 ${stamp % 1000} 111` } },
    { channel: 'email', external: { imie: `Test Email ${stamp}`, email: `t${stamp}@example.com` } },
    { channel: 'whatsapp', external: { imie: `Test WA ${stamp}`, telefon: `+48 701 ${stamp % 1000} 222` } },
    { channel: 'fb', external: { imie: `Test FB ${stamp}`, session_id: `fb-${stamp}` } },
    { channel: 'gbp', external: { imie: `Test GBP ${stamp}`, session_id: `gbp-${stamp}` } },
  ];
  let firstConvId = null;
  for (const k of kanaly) {
    const r = await post('/api/conversations/ingest', {
      owner_contact_id: 'c-1',
      channel: k.channel,
      external: k.external,
      body: `Wiadomość testowa (${k.channel}) ${stamp}`,
    });
    check(`ingest ${k.channel} → 200 + conversation_id`, r.status === 200 && !!r.json.conversation_id, JSON.stringify(r.json));
    if (k.channel === 'sms') firstConvId = r.json.conversation_id;
  }
  // upsert: ten sam telefon → TEN SAM wątek
  const again = await post('/api/conversations/ingest', {
    owner_contact_id: 'c-1',
    channel: 'sms',
    external: kanaly[0].external,
    body: 'Druga wiadomość w tym samym wątku',
  });
  check('upsert po external (ten sam wątek)', again.json.conversation_id === firstConvId);

  const rozmowy = await pageText('/rozmowy');
  check('/rozmowy → 200', rozmowy.status === 200);
  for (const k of kanaly) {
    check(`wątek ${k.channel} widoczny w inboxie`, rozmowy.text.includes(k.external.imie.toLowerCase()));
  }

  // ---- B. Conversation AI ----
  console.log('\n[B] Conversation AI — wiedza firmy + eskalacja + lead');
  // conv-1 (Mercatura, ai_auto=true): pytanie z cennika → auto-odpowiedź z wiedzy
  const aiAsk = await post('/api/conversations/ingest', {
    owner_contact_id: 'c-1',
    channel: 'sms',
    conversation_id: 'conv-1',
    external: {},
    body: 'Ile kosztuje przegląd hydrantu i gaśnicy?',
  });
  // sent=true wymaga żywej bramy SMS (live); w demo dostarczenie = honest-mock,
  // ale wiadomość AI JEST zapisana w wątku — sprawdzamy twardo w inboxie.
  check('ai_auto: bot odpowiedział (action=odpowiedz)', aiAsk.json.ai?.action === 'odpowiedz', JSON.stringify(aiAsk.json.ai));
  check('odpowiedź ma źródła z bazy wiedzy', (aiAsk.json.ai?.zrodla ?? []).length > 0, JSON.stringify(aiAsk.json.ai?.zrodla));
  const rozmowyPoAi = await pageText('/rozmowy');
  check(
    'odpowiedź AI z cennika widoczna w inboxie (twarde dane)',
    rozmowyPoAi.text.includes('hydrantu wewnętrznego') || rozmowyPoAi.text.includes('25 zł')
  );

  // ai-reply (szkic, bez wysyłki) — decyzja zwracana operatorowi
  const draft = await post('/api/conversations/ai-reply', { conversation_id: 'conv-4', send: false });
  check('ai-reply send:false → decyzja bez wysyłki', draft.status === 200 && ['odpowiedz', 'eskalacja'].includes(draft.json.action) && draft.json.message_id === null, JSON.stringify(draft.json));

  // Eskalacja + lead: webchat z prośbą o kontakt
  const sess = `verify-sess-${stamp}`;
  const esc1 = await post('/api/webchat/message', { owner: 'c-1', session_id: sess, body: 'Proszę o kontakt w sprawie dużego zlecenia, mój numer 605 123 456.' }, false);
  check('webchat/message → 200 + odpowiedź bota', esc1.status === 200 && (esc1.json.replies ?? []).length > 0, JSON.stringify(esc1.json));
  const przekazuje = (esc1.json.replies ?? []).some((r) => r.body.toLowerCase().includes('przekazuj'));
  check('bot eskaluje (przekazuje do zespołu)', przekazuje);

  const powiadomienia = await pageText('/powiadomienia');
  check('notyfikacja „rozmowa czeka na człowieka"', powiadomienia.text.includes('rozmowa czeka na człowieka'));
  const klientPage = await pageText('/klient');
  check(`lead z rozmowy w CRM klienta (Gość ${sess.slice(-4)})`, klientPage.text.includes(`gość ${sess.slice(-4)}`));

  // ---- C. Webchat widget + poll ----
  console.log('\n[C] webchat — widget + realtime polling');
  const widget = await fetch(`${BASE}/api/webchat/widget`);
  const widgetJs = await widget.text();
  check('widget.js → 200 (application/javascript)', widget.status === 200 && (widget.headers.get('content-type') ?? '').includes('javascript'));
  check('widget zawiera UI czatu', widgetJs.includes('svo-chat-btn') && widgetJs.includes('/api/webchat/poll'));
  check('/webchat-demo → 200', (await pageText('/webchat-demo')).status === 200);

  const convId = esc1.json.conversation_id;
  const poll = await fetch(`${BASE}/api/webchat/poll?conversation=${convId}&session=${sess}`);
  const pollJson = await poll.json();
  check('poll z poprawnym session → wiadomości out', poll.status === 200 && (pollJson.messages ?? []).length > 0);
  const pollBad = await fetch(`${BASE}/api/webchat/poll?conversation=${convId}&session=zly-token-123`);
  check('poll ze złym session → 404 (capability)', pollBad.status === 404);

  // ---- D. OPERATOR-FIRST + izolacja demo ----
  console.log('\n[D] operator-first + izolacja skrzynek');
  check('/rozmowy (operator) MA toggle bota', rozmowy.text.includes('bot ai:'));
  check('/rozmowy (operator) MA szkic AI', rozmowy.text.includes('zaproponuj odpowiedź'));
  check('/klient NIE ma szkicu AI (operator-first)', !klientPage.text.includes('zaproponuj odpowiedź'));
  check('/klient pokazuje bota jako „obsługa stronevo"', klientPage.text.includes('obsługa stronevo'));
  check('/klient NIE widzi rozmów innego klienta (MotoMax)', !klientPage.text.includes('klient motomax'));
  check('/klient NIE widzi skrzynki STRONEVO (prospekt webchat)', !klientPage.text.includes('prospekt (webchat stronevo.pl)'));

  // ---- walidacje ----
  console.log('\n[walidacje]');
  check('zły kanał → 400', (await post('/api/conversations/ingest', { owner_contact_id: 'c-1', channel: 'telegram', external: { telefon: '1' }, body: 'x' })).status === 400);
  check('brak klucza external → 400', (await post('/api/conversations/ingest', { owner_contact_id: 'c-1', channel: 'sms', external: {}, body: 'x' })).status === 400);
  check('send bez body → 400', (await post('/api/conversations/send', { conversation_id: 'conv-1' })).status === 400);
  check('ai-reply nieistniejąca rozmowa → 404', (await post('/api/conversations/ai-reply', { conversation_id: 'conv-nie-ma' })).status === 404);

  // ---- E. RLS (live only) ----
  console.log('\n[E] RLS multi-tenant (Faza 2)');
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supaAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = process.env.TEST_KLIENT_EMAIL;
  const password = process.env.TEST_KLIENT_PASSWORD;
  if (supaUrl && supaAnon && email && password) {
    const { createClient } = await import('@supabase/supabase-js');
    const supa = createClient(supaUrl, supaAnon);
    const { data: auth, error: authErr } = await supa.auth.signInWithPassword({ email, password });
    check('logowanie klienta testowego', !authErr, authErr?.message);
    if (!authErr) {
      const ownId = auth.user?.user_metadata?.contact_id;
      for (const table of ['conversations', 'messages', 'knowledge_docs']) {
        const { data: rows } = await supa.from(table).select('owner_contact_id, contact_id');
        const obce = (rows ?? []).filter((r) => (r.owner_contact_id ?? r.contact_id) !== ownId);
        check(`${table}: 0 cudzych wierszy (widzi ${rows?.length ?? 0})`, obce.length === 0);
      }
      const { error: inErr } = await supa.from('messages').insert({
        conversation_id: '00000000-0000-0000-0000-000000000000',
        owner_contact_id: ownId,
        direction: 'in',
        channel: 'sms',
        body: 'rls-test',
        author: 'koncowy',
      });
      check('klient NIE insertuje przychodzących (tylko out/human)', inErr != null);
      const { data: ownConvs } = await supa.from('conversations').select('id, ai_auto').limit(1);
      if ((ownConvs ?? []).length > 0) {
        const c = ownConvs[0];
        const { error: aiErr } = await supa
          .from('conversations')
          .update({ ai_auto: !c.ai_auto })
          .eq('id', c.id);
        check('klient NIE zmienia ai_auto (trigger operator-first)', aiErr != null);
      }
      const { error: kdErr } = await supa
        .from('knowledge_docs')
        .insert({ contact_id: ownId, tytul: 'rls', tresc: 'test' });
      check('klient NIE pisze do bazy wiedzy (operator-first)', kdErr != null);
      await supa.auth.signOut();
    }
  } else {
    console.log('  ⏭️  SKIP (tryb demo / brak ENV Supabase + TEST_KLIENT_EMAIL/PASSWORD) — potwierdź po deployu.');
  }

  console.log(`\n=== Wynik: ${passed} OK, ${failures} FAIL ===\n`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(`\n💥 Weryfikacja przerwana: ${e.message}\n`);
  process.exit(1);
});
