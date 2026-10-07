// Weryfikacja FAZY 3 „Marketing" na twardych danych.
// Uruchom przy działającym serwerze: node scripts/verify-faza3-marketing.mjs
//
// Testy (DoD):
//  A. Strona publikuje się pod slug (/s/mercatura + podstrona; 404 dla obcych).
//  B. Formularz tworzy lead (RODO twarde: bez zgody = 400).
//  C. Kampania wychodzi (Brevo/mock) z trackingiem open/click + RODO 1-klik wypis
//     (opt-out pomijany przy wysyłce; statystyki na twardych danych).
//  D. Post planuje się i publikuje (cron publish-due; drugi run = 0).
//  E. Prośba o opinię + ingest opinii (dedupe) + notyfikacja.
//  F. Multi-tenant + operator-first (klient: tylko swoje posty/opinie, bez buildera).
//  G. RLS (live) — nowe tabele.

const BASE = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const KEY = process.env.MARKETING_API_KEY || process.env.EVENTS_INGEST_KEY || '';

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

async function post(path, body, opts = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (opts.key !== false && KEY) h['x-ingest-key'] = KEY;
  const token = process.env.MARKETING_API_TOKEN || process.env.NOTIFY_API_TOKEN;
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
  const text = (await res.text()).replace(/<!--.*?-->/g, '').toLowerCase();
  return { status: res.status, text };
}

const stamp = Math.floor(Date.now() / 1000);

async function main() {
  console.log(`\n=== Weryfikacja Fazy 3 (Marketing) @ ${BASE} ===\n`);

  // ---- A. Strona publiczna ----
  console.log('[A] builder → publiczna strona /s/[slug]');
  const home = await pageText('/s/mercatura');
  check('/s/mercatura → 200', home.status === 200);
  check('hero renderuje się', home.text.includes('przeglądy ppoż bez przypominania'));
  check('features + testimonials + pricing/cta', home.text.includes('co robimy') && home.text.includes('zaufali nam'));
  check('formularz osadzony + zgoda RODO pod nim', home.text.includes('zamów bezpłatną wycenę') && home.text.includes('rodo'));
  check('podstrona /s/mercatura/kontakt → 200', (await pageText('/s/mercatura/kontakt')).status === 200);
  check('nieistniejący slug → 404', (await pageText('/s/nie-ma-takiej')).status === 404);

  // ---- B. Formularz → lead ----
  console.log('\n[B] formularz → lead w CRM (RODO twarde)');
  const bezZgody = await post('/api/forms/submit', {
    form_id: 'form-1',
    dane: { imie: 'Bez Zgody', telefon: '111' },
    zgoda_rodo: false,
  }, { key: false });
  check('bez zgody RODO → 400', bezZgody.status === 400);

  const leadName = `Lead Formularz ${stamp}`;
  const sub = await post('/api/forms/submit', {
    form_id: 'form-1',
    dane: { imie: leadName, telefon: '+48 700 800 900', wiadomosc: 'Proszę o wycenę 30 gaśnic.' },
    zgoda_rodo: true,
  }, { key: false });
  check('submit ze zgodą → 200 + lead_id', sub.status === 200 && !!sub.json.lead_id, JSON.stringify(sub.json));
  const klientPage = await pageText('/klient');
  check('lead widoczny w CRM klienta (właściciela formularza)', klientPage.text.includes(leadName.toLowerCase()));
  check('notyfikacja o zgłoszeniu', (await pageText('/powiadomienia')).text.includes('nowe zgłoszenie z formularza'));

  // ---- C. Kampania e-mail + tracking + RODO ----
  console.log('\n[C] e-mail: wysyłka + tracking + 1-klik wypis');
  const send = await post('/api/email/send', { campaign_id: 'camp-2' });
  check('wysyłka camp-2 → ok', send.status === 200 && send.json.ok === true, JSON.stringify(send.json));
  check('RODO: opt-out pominięty (2 odbiorców, 1 pominięty)', send.json.odbiorcy === 2 && send.json.pominiete_rodo === 1, JSON.stringify(send.json));
  check('ponowna wysyłka → 409 (już wysłana)', (await post('/api/email/send', { campaign_id: 'camp-2' })).status === 409);

  const token1 = send.json.sends?.[0]?.token;
  const open = await fetch(`${BASE}/api/email/track/open?send=${token1}`);
  check('pixel open → 200 image/gif', open.status === 200 && (open.headers.get('content-type') ?? '').includes('gif'));
  const click = await fetch(`${BASE}/api/email/track/click?send=${token1}&url=${encodeURIComponent(BASE + '/s/mercatura')}`, { redirect: 'manual' });
  check('click → 302 redirect na cel', click.status === 302);

  // twarde statystyki: camp-2 po open+click ma otwarcia=1 (camp-1 seed ma 2)
  // — sprawdzamy w danych RSC strony /marketing (props kampanii)
  const marketing = await pageText('/marketing');
  check(
    'tracking zapisany: camp-2 otwarcia=1 w danych panelu',
    /otwarcia\\{0,2}":1/.test(marketing.text),
    'brak "otwarcia":1 we flight data'
  );

  // 1-klik wypis
  const unsub1 = await fetch(`${BASE}/api/email/unsub?c=ec-1`);
  check('wypis 1-klik → potwierdzenie', unsub1.status === 200 && (await unsub1.text()).includes('Wypisano'));
  const unsub2 = await fetch(`${BASE}/api/email/unsub?c=ec-1`);
  check('drugi klik → „już wypisano" (idempotentne)', (await unsub2.text()).includes('Już wypisano'));

  // ---- D. Social ----
  console.log('\n[D] social: planowanie + publikacja (cron)');
  const pub = await post('/api/social/publish-due', {});
  check('publish-due → opublikował zaległy post', pub.status === 200 && (pub.json.opublikowane ?? 0) >= 1, JSON.stringify(pub.json));
  const pub2 = await post('/api/social/publish-due', {});
  check('drugi run → 0 (nic zaległego)', pub2.json.opublikowane === 0);

  // ---- E. Opinie ----
  console.log('\n[E] reputacja: ingest opinii + dedupe + notyfikacja');
  const extId = `g-test-${stamp}`;
  const rev = await post('/api/reviews/ingest', {
    contact_id: 'c-1',
    zrodlo: 'google',
    autor: 'Test Recenzent',
    ocena: 2,
    tresc: 'Testowa krytyczna opinia do weryfikacji.',
    external_id: extId,
  });
  check('ingest opinii → 200 + review_id', rev.status === 200 && !!rev.json.review_id, JSON.stringify(rev.json));
  const rev2 = await post('/api/reviews/ingest', { contact_id: 'c-1', zrodlo: 'google', external_id: extId, ocena: 2 });
  check('dedupe po external_id', rev2.json.duplikat === true);
  check('notyfikacja o nowej opinii', (await pageText('/powiadomienia')).text.includes('nowa opinia google'));
  check('zły zrodlo → 400', (await post('/api/reviews/ingest', { contact_id: 'c-1', zrodlo: 'yelp' })).status === 400);

  // ---- F. Multi-tenant + operator-first ----
  console.log('\n[F] multi-tenant + operator-first');
  // zakładka Social jest domyślna (SSR); Opinie renderują się po kliknięciu —
  // ich dane (autor opinii c-1) są w RSC props strony
  check(
    '/klient: sekcja Marketing (planner + dane opinii)',
    klientPage.text.includes('zaplanuj post') && klientPage.text.includes('anna k.')
  );
  check('/klient: NIE widzi postów innego klienta (MotoMax)', !klientPage.text.includes('ekspresowa wymiana oleju'));
  check('/klient: NIE widzi opinii innego klienta (Marek P.)', !klientPage.text.includes('marek p.'));
  check('/klient: BEZ buildera stron (operator-first)', !klientPage.text.includes('nowa strona (szablon)') && !klientPage.text.includes('dodaj sekcję'));
  check('/klient: „Chcę więcej" → alert operatora', klientPage.text.includes('chcę więcej'));
  check('/marketing (operator): builder + wszystkie firmy', marketing.text.includes('nowa strona') && marketing.text.includes('marek p.'));

  // ---- G. RLS (live only) ----
  console.log('\n[G] RLS multi-tenant (Faza 3)');
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
      for (const table of ['sites', 'forms', 'form_submissions', 'email_campaigns', 'social_posts', 'reviews']) {
        const { data: rows } = await supa.from(table).select('contact_id');
        const obce = (rows ?? []).filter((r) => r.contact_id !== ownId);
        check(`${table}: 0 cudzych wierszy (widzi ${rows?.length ?? 0})`, obce.length === 0);
      }
      const { error: siteErr } = await supa
        .from('sites')
        .insert({ contact_id: ownId, nazwa: 'rls', slug: `rls-${Date.now()}` });
      check('klient NIE tworzy stron (operator-first)', siteErr != null);
      const { error: subErr } = await supa
        .from('form_submissions')
        .insert({ form_id: '00000000-0000-0000-0000-000000000000', contact_id: ownId, dane: {} });
      check('klient NIE insertuje submisji (tylko service role)', subErr != null);
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
