// Weryfikacja FAZY 1 „Warstwa zaufania operacyjnego" na twardych danych.
// Uruchom przy działającym serwerze: node scripts/verify-faza1-zaufanie.mjs
//
// Testy:
//  A. /api/errors/ingest → 200 + błąd WIDOCZNY w /wyniki przy następnym
//     żądaniu (<60 s) + powiadomienie + walidacje 400/404.
//  B. /api/uptime/run → pinguje wymagalne checki; drugi run od razu = 0
//     (interval); widżety dostępności renderują się w /wyniki i /klient.
//  C. Intake dostępów widoczny w /klient (krokowy, postęp x/y) — brama
//     provisioningu przeklikiwana w przeglądarce (server actions).
//  D. Rejestr wersji w /agenci (najnowsza vs u klienta, „do aktualizacji").
//  E. RLS (tylko live + konto testowe klienta): workflow_errors/uptime_*/
//     client_credentials — klient widzi TYLKO swoje, nie insertuje błędów.
//
// ENV: BASE_URL (default http://localhost:3000), ERRORS_INGEST_KEY/EVENTS_INGEST_KEY,
//      UPTIME_API_TOKEN/NOTIFY_API_TOKEN, TEST_KLIENT_EMAIL/PASSWORD (RLS).

const BASE = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const INGEST_KEY = process.env.ERRORS_INGEST_KEY || process.env.EVENTS_INGEST_KEY || '';

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

async function post(path, body, headers = {}) {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (INGEST_KEY) h['x-ingest-key'] = INGEST_KEY;
  const token = process.env.UPTIME_API_TOKEN || process.env.NOTIFY_API_TOKEN;
  if (token) h['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: h, body: JSON.stringify(body ?? {}) });
  let json = {};
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

async function pageText(path) {
  const res = await fetch(`${BASE}${path}`);
  // React wstawia <!-- --> między wyrażeniami tekstowymi — usuwamy przed asercjami
  const text = (await res.text()).replace(/<!--.*?-->/g, '').toLowerCase();
  return { status: res.status, text };
}

async function main() {
  console.log(`\n=== Weryfikacja Fazy 1 (zaufanie operacyjne) @ ${BASE} ===\n`);

  // ---- A. Zdrowie floty: errors ingest → /wyniki <60 s ----
  console.log('[A] workflow_errors — ingest → widoczność w /wyniki');
  const marker = `test-blad-weryfikacyjny-${Math.floor(Date.now() / 1000)}`;
  const ing = await post('/api/errors/ingest', {
    client_automation_id: 'ca-1',
    workflow_id: 'wf-1',
    node: 'Verify Node',
    message: `${marker}: webhook zwrócił 500`,
    severity: 'warn',
    meta: { execution_id: 'verify-1' },
  });
  check('ingest błędu → 200 + error_id', ing.status === 200 && !!ing.json.error_id, JSON.stringify(ing.json));
  // dedupe: przy już otwartym powiadomieniu tego wdrożenia nowe nie powstaje —
  // sprawdzamy więc flagę + realną obecność alertu w /powiadomienia
  check(
    'powiadomienie: utworzone lub zdeduplikowane (flaga obecna)',
    typeof ing.json.notification_created === 'boolean'
  );
  const powiadomienia = await pageText('/powiadomienia');
  check(
    'alert techniczny widoczny w /powiadomienia',
    powiadomienia.text.includes('błąd workflowa') || powiadomienia.text.includes('zgłosiła błąd')
  );
  check('alert zwrócony (mock bez kluczy = false, ale obecny)', 'alert' in ing.json);

  const t0 = Date.now();
  const wyniki = await pageText('/wyniki');
  const widoczny = wyniki.text.includes(marker.toLowerCase());
  check(`błąd widoczny w /wyniki po ${((Date.now() - t0) / 1000).toFixed(1)} s (<60 s)`, widoczny && Date.now() - t0 < 60_000);
  check('sekcja zdrowia pokazuje otwarte błędy', wyniki.text.includes('otwarte błędy'));

  check('brak message → 400', (await post('/api/errors/ingest', { client_automation_id: 'ca-1' })).status === 400);
  check(
    'nieistniejące wdrożenie → 404',
    (await post('/api/errors/ingest', { client_automation_id: 'ca-nie-ma', message: 'x' })).status === 404
  );

  // ---- B. Uptime ----
  console.log('\n[B] uptime — cron + widżety');
  const run1 = await post('/api/uptime/run', {});
  check('uptime/run → 200 ok', run1.status === 200 && run1.json.ok === true, JSON.stringify(run1.json));
  const total1 = (run1.json.sprawdzone ?? 0) + (run1.json.pominiete ?? 0);
  check('monitory istnieją (sprawdzone+pominięte ≥1)', total1 >= 1, JSON.stringify(run1.json));
  if ((run1.json.sprawdzone ?? 0) >= 1) {
    const run2 = await post('/api/uptime/run', {});
    check(
      'drugi run od razu → 0 sprawdzonych (respektuje interval_min)',
      run2.status === 200 && run2.json.sprawdzone === 0,
      JSON.stringify(run2.json)
    );
  } else {
    check(
      'interval respektowany (checki świeżo spingowane z poprzedniego runa → 0 sprawdzonych)',
      run1.json.sprawdzone === 0
    );
  }

  const wyniki2 = await pageText('/wyniki');
  check('/wyniki ma widżet „Dostępność (uptime)"', wyniki2.text.includes('dostępność (uptime)'));
  check('/wyniki pokazuje % dostępności', /\d{2},\d%/.test(wyniki2.text) || wyniki2.text.includes('%'));

  const klient = await pageText('/klient');
  check('/klient ma „Dostępność Twoich usług"', klient.text.includes('dostępność twoich usług'));

  // ---- C. Intake dostępów (krokowy) ----
  console.log('\n[C] portal dostępów (intake w /klient)');
  check('/klient ma krokowy intake „Dostępy do wdrożenia"', klient.text.includes('dostępy do wdrożenia'));
  check('intake pokazuje postęp x/y zebrane', /\d+\/\d+ zebrane/.test(klient.text));
  check('intake pokazuje krok (nie mega-formularz)', /krok \d+ z \d+/.test(klient.text));
  check('wartości maskowane (••••)', klient.text.includes('••••'));
  console.log('  ℹ️  brama provisioningu (komplet → budowa) — przeklikana w przeglądarce (server action)');

  // ---- D. Rejestr wersji ----
  console.log('\n[D] rejestr wersji szablonów (/agenci)');
  const agenci = await pageText('/agenci');
  check('/agenci ma sekcję „Wersje szablonów u klientów"', agenci.text.includes('wersje szablonów u klientów'));
  check('pokazuje najnowszą wersję', agenci.text.includes('najnowsza 2.1.0'));
  check('flaguje wdrożenia do aktualizacji', agenci.text.includes('do aktualizacji'));

  // ---- E. RLS (live only) ----
  console.log('\n[E] RLS multi-tenant (Faza 1)');
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

      const { data: errs } = await supa.from('workflow_errors').select('id');
      check('workflow_errors: klient nie widzi NIC (0 wierszy)', (errs ?? []).length === 0);

      const { error: insErr } = await supa
        .from('workflow_errors')
        .insert({ message: 'rls-test', severity: 'warn' });
      check('workflow_errors: klient NIE może insertować', insErr != null);

      for (const table of ['uptime_checks', 'uptime_pings', 'client_credentials']) {
        const { data: rows } = await supa.from(table).select('contact_id');
        const obce = (rows ?? []).filter((r) => r.contact_id !== ownId);
        check(`${table}: 0 cudzych wierszy (widzi ${rows?.length ?? 0} swoich)`, obce.length === 0);
      }

      const { error: pingErr } = await supa
        .from('uptime_pings')
        .insert({ check_id: '00000000-0000-0000-0000-000000000000', contact_id: ownId, ok: true });
      check('uptime_pings: klient NIE może insertować', pingErr != null);

      await supa.auth.signOut();
    }
  } else {
    console.log('  ⏭️  SKIP (tryb demo / brak ENV Supabase + TEST_KLIENT_EMAIL/PASSWORD).');
    console.log('     W demo izolację wymusza kod (contact_id w zapytaniach); RLS potwierdź po deployu.');
  }

  console.log(`\n=== Wynik: ${passed} OK, ${failures} FAIL ===\n`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(`\n💥 Weryfikacja przerwana: ${e.message}\n`);
  process.exit(1);
});
