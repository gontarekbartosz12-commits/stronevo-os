// Weryfikacja Panelu Wyników na TWARDYCH DANYCH (nie tylko UI).
// Uruchom przy działającym serwerze: node scripts/verify-panel-wynikow.mjs
//
// Testy:
//  1. summary PRZED → ingest 3 znanych zdarzeń → summary PO: KPI/minuty/~zł
//     rosną DOKŁADNIE o to, co wstrzelono (wycena minuty/60 × stawka).
//  2. typ='blad' przyjęty (0 min, 0 zł) — spina self-healing.
//  3. /api/reports/run generuje raport za poprzedni miesiąc, /raport/[id]
//     renderuje się z nazwą firmy.
//  4. RLS (tylko live): klient A zalogowany przez anon key widzi WYŁĄCZNIE
//     swoje automation_events i monthly_reports. Wymaga ENV:
//     NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
//     TEST_KLIENT_EMAIL, TEST_KLIENT_PASSWORD — bez nich test = SKIP (demo).
//
// ENV: BASE_URL (default http://localhost:3000), EVENTS_INGEST_KEY,
//      CONTACT_ID (default 'c-1' — klient demo Mercatura),
//      CLIENT_AUTOMATION_ID (default 'ca-1').

const BASE = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const KEY = process.env.EVENTS_INGEST_KEY ?? '';
const CONTACT_ID = process.env.CONTACT_ID ?? 'c-1';
const CA_ID = process.env.CLIENT_AUTOMATION_ID ?? 'ca-1';

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

function headers(extra = {}) {
  const h = { 'Content-Type': 'application/json', ...extra };
  if (KEY) h['x-ingest-key'] = KEY;
  return h;
}

async function getSummary(params = `contact_id=${CONTACT_ID}&days=30`) {
  const res = await fetch(`${BASE}/api/wyniki/summary?${params}`, { headers: headers() });
  const json = await res.json();
  if (!res.ok) throw new Error(`summary HTTP ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function ingest(body) {
  const res = await fetch(`${BASE}/api/events/ingest`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, json };
}

const near = (a, b, eps = 0.02) => Math.abs(a - b) <= eps;

async function main() {
  console.log(`\n=== Weryfikacja Panelu Wyników @ ${BASE} ===\n`);

  // ---- 1. Ingest → KPI rosną dokładnie o wstrzelone zdarzenia ----
  console.log('[1] Ingest → twarde KPI');
  const before = await getSummary();
  const stawka = before.stawka_pln_h;
  check('summary zwraca stawkę i KPI', Number.isFinite(stawka) && before.kpi != null);

  const shots = [
    { typ: 'lead_zlapany', zrodlo: 'chatbot', minuty: 10, meta: { po_godzinach: true } },
    { typ: 'rezerwacja', zrodlo: 'ada', minuty: 8 },
    { typ: 'sms_wyslany', zrodlo: 'sms', minuty: 2 },
  ];
  let expectedPln = 0;
  for (const s of shots) {
    const { status, json } = await ingest({
      client_automation_id: CA_ID,
      typ: s.typ,
      zrodlo: s.zrodlo,
      meta: s.meta,
    });
    const expectedVal = Math.round((s.minuty / 60) * stawka * 100) / 100;
    expectedPln += json.wartosc_pln ?? 0;
    check(`ingest ${s.typ} → 200 + minuty=${s.minuty}`, status === 200 && json.minuty_oszczedzone === s.minuty, JSON.stringify(json));
    check(
      `wycena ${s.typ} = ${expectedVal} zł (minuty/60 × ${stawka} zł/h)`,
      near(json.wartosc_pln ?? -1, expectedVal)
    );
  }

  const after = await getSummary();
  check('leady +1', after.kpi.leady === before.kpi.leady + 1, `${before.kpi.leady} → ${after.kpi.leady}`);
  check(
    'leady po godzinach +1',
    after.kpi.leadyPoGodzinach === before.kpi.leadyPoGodzinach + 1,
    `${before.kpi.leadyPoGodzinach} → ${after.kpi.leadyPoGodzinach}`
  );
  check('rezerwacje +1', after.kpi.rezerwacje === before.kpi.rezerwacje + 1);
  check('SMS +1', after.kpi.smsy === before.kpi.smsy + 1);
  check('minuty +20', after.kpi.minuty === before.kpi.minuty + 20, `${before.kpi.minuty} → ${after.kpi.minuty}`);
  check(
    `~zł +${expectedPln.toFixed(2)}`,
    near(after.kpi.wartoscPln, before.kpi.wartoscPln + expectedPln, 0.05),
    `${before.kpi.wartoscPln} → ${after.kpi.wartoscPln}`
  );

  // ---- 2. Błąd: przyjęty, 0 min / 0 zł ----
  console.log('\n[2] Zdarzenie typu blad (self-healing)');
  const blad = await ingest({
    client_automation_id: CA_ID,
    typ: 'blad',
    zrodlo: 'n8n',
    meta: { blad: 'test weryfikacyjny — można rozwiązać' },
  });
  check('blad → 200, 0 min, 0 zł', blad.status === 200 && blad.json.minuty_oszczedzone === 0 && blad.json.wartosc_pln === 0);
  const afterBlad = await getSummary();
  check('KPI bledy +1', afterBlad.kpi.bledy === after.kpi.bledy + 1);
  check('blad NIE dolicza wartości', near(afterBlad.kpi.wartoscPln, after.kpi.wartoscPln));

  // ---- 3. Walidacja wejścia ----
  console.log('\n[3] Walidacja ingest');
  check('nieznany typ → 400', (await ingest({ contact_id: CONTACT_ID, typ: 'xxx', zrodlo: 'n8n' })).status === 400);
  check('brak id → 400', (await ingest({ typ: 'rezerwacja', zrodlo: 'ada' })).status === 400);
  check(
    'nieistniejące wdrożenie → 404',
    (await ingest({ client_automation_id: 'ca-nie-ma', typ: 'rezerwacja', zrodlo: 'ada' })).status === 404
  );
  if (KEY) {
    const res = await fetch(`${BASE}/api/events/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ingest-key': 'zly-klucz' },
      body: JSON.stringify({ contact_id: CONTACT_ID, typ: 'rezerwacja', zrodlo: 'ada' }),
    });
    check('zły x-ingest-key → 401', res.status === 401);
  } else {
    console.log('  ⏭️  test klucza pominięty (brak EVENTS_INGEST_KEY — tryb dev/demo)');
  }

  // ---- 4. Raport miesięczny + strona /raport/[id] ----
  console.log('\n[4] Auto-raport miesięczny');
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const okres = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
  const repHeaders = { 'Content-Type': 'application/json' };
  const repToken = process.env.REPORTS_API_TOKEN || process.env.NOTIFY_API_TOKEN;
  if (repToken) repHeaders['Authorization'] = `Bearer ${repToken}`;
  const repRes = await fetch(`${BASE}/api/reports/run`, {
    method: 'POST',
    headers: repHeaders,
    body: JSON.stringify({ okres }),
  });
  const rep = await repRes.json();
  check(`reports/run (${okres}) → ok`, repRes.status === 200 && rep.ok === true, JSON.stringify(rep));
  check('wygenerowano ≥1 raport', (rep.wygenerowane ?? 0) >= 1);

  const mine = (rep.raporty ?? []).find((r) => r.contact_id === CONTACT_ID) ?? rep.raporty?.[0];
  if (mine) {
    const page = await fetch(`${BASE}/raport/${mine.report_id}`);
    const html = await page.text();
    check('/raport/[id] → 200', page.status === 200);
    check('raport zawiera nazwę firmy', html.includes(mine.firma), mine.firma);
    check('raport oznacza szacunek („~”)', html.includes('~'));
    check('raport ma sekcję metody', html.includes('Jak to liczymy'));
  } else {
    check('raport dla klienta testowego istnieje', false, 'brak raportu w odpowiedzi');
  }

  // ---- 5. RLS: klient widzi TYLKO swoje (wymaga live Supabase + konta testowego) ----
  console.log('\n[5] RLS multi-tenant');
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
      const { data: events } = await supa.from('automation_events').select('contact_id');
      const obce = (events ?? []).filter((e) => e.contact_id !== ownId);
      check(`automation_events: 0 cudzych wierszy (widzi ${events?.length ?? 0} swoich)`, obce.length === 0);
      const { data: reports } = await supa.from('monthly_reports').select('contact_id');
      const obceR = (reports ?? []).filter((r) => r.contact_id !== ownId);
      check(`monthly_reports: 0 cudzych wierszy (widzi ${reports?.length ?? 0} swoich)`, obceR.length === 0);
      const { error: insErr } = await supa.from('automation_events').insert({
        contact_id: ownId,
        typ: 'rezerwacja',
        zrodlo: 'ada',
      });
      check('klient NIE może insertować zdarzeń (tylko service role)', insErr != null);
      await supa.auth.signOut();
    }
  } else {
    console.log(
      '  ⏭️  SKIP (tryb demo / brak ENV: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, TEST_KLIENT_EMAIL, TEST_KLIENT_PASSWORD).'
    );
    console.log('     W demo izolację wymusza kod (contact_id w każdym zapytaniu); RLS potwierdź po deployu na Supabase EU.');
  }

  console.log(`\n=== Wynik: ${passed} OK, ${failures} FAIL ===\n`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(`\n💥 Weryfikacja przerwana: ${e.message}\n`);
  process.exit(1);
});
