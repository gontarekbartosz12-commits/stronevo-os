// Weryfikacja FAZY 5 „Produktyzacja + głębia CRM" na twardych danych.
// Uruchom przy działającym serwerze: node scripts/verify-faza5-produktyzacja.mjs
//
// DoD:
//  A. Snapshot klonuje DZIAŁAJĄCY setup (create+deploy = server actions →
//     przeklikiwane w przeglądarce; skrypt weryfikuje sekcję + efekt końcowy
//     osobnym testem bota po deployu — patrz sekcja przeglądarkowa).
//  B. Custom object + smart list działają (rekordy, filtry liczone na żywo).
//  C. Round-robin booking: rotacja członków + kolizje 409 + class z limitem.
//  D. Ad Manager: sync metryk (cron).
//  E. Multi-tenant + operator-first (+ RLS live).

const BASE = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

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

async function post(path, body) {
  const h = { 'Content-Type': 'application/json' };
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

// najbliższy dzień roboczy (pon-pt) ≥ jutro — cal-1 ma dostępność pon-pt+sob
function nextWorkday() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0) d.setDate(d.getDate() + 1); // pomiń niedzielę
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log(`\n=== Weryfikacja Fazy 5 (Produktyzacja + CRM+) @ ${BASE} ===\n`);

  // ---- A. Snapshots (sekcja + panel) ----
  console.log('[A] snapshoty — sekcja operatora');
  const agenci = await pageText('/agenci');
  check('/agenci ma sekcję Snapshoty', agenci.text.includes('snapshoty — produktyzacja'));
  check('snapshot: wybór klienta źródłowego i celu', agenci.text.includes('klient źródłowy'));
  console.log('  ℹ️  pełny cykl create→deploy→działający bot = przeklikiwany w przeglądarce (server actions)');

  // ---- B. Custom objects + smart lists ----
  console.log('\n[B] custom objects + smart listy');
  const baza = await pageText('/baza');
  check('/baza → 200', baza.status === 200);
  check('smart lista „Gorące leady" z wynikami', baza.text.includes('gorące leady'));
  check('filtr opisany po ludzku', baza.text.includes('ma telefon'));
  check('obiekt „Pojazd" (schema operatora)', baza.text.includes('pojazd'));
  check('rekordy obiektu (Toyota z seedu)', baza.text.includes('toyota'));
  check('obiekt powiązany z leadem CRM (budynek Hotel Panorama)', baza.text.includes('obiekt (budynek)'));

  // ---- C. Booking: round-robin + class ----
  console.log('\n[C] booking — round-robin, kolizje, class');
  const day = nextWorkday();
  const slots1 = await fetch(`${BASE}/api/booking/slots?slug=motomax-serwis&data=${day}`).then((r) => r.json());
  check('sloty round-robin → lista', (slots1.slots ?? []).length >= 2, JSON.stringify(slots1).slice(0, 120));

  const [sA, sB] = slots1.slots;
  const b1 = await post('/api/booking/book', { slug: 'motomax-serwis', start: sA.start, imie: 'Test RR Pierwszy', telefon: '+48 600 111 222' });
  check('rezerwacja 1 → przydzielony członek (RR)', b1.status === 200 && !!b1.json.przydzielono, JSON.stringify(b1.json));
  const b2 = await post('/api/booking/book', { slug: 'motomax-serwis', start: sB.start, imie: 'Test RR Drugi' });
  check('rezerwacja 2 → INNY członek (rotacja round-robin)', b2.status === 200 && b2.json.przydzielono !== b1.json.przydzielono, `${b1.json.przydzielono} vs ${b2.json.przydzielono}`);
  const kolizja = await post('/api/booking/book', { slug: 'motomax-serwis', start: sA.start, imie: 'Kolizja' });
  check('ten sam slot ponownie → 409 (zajęty)', kolizja.status === 409);

  // class: 2 rezerwacje na TEN SAM slot przechodzą (limit 10)
  const dClass = (() => {
    const d = new Date();
    for (let i = 1; i <= 7; i++) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() === 2 || d.getDay() === 4) return d.toISOString().slice(0, 10);
    }
    return day;
  })();
  const slotsC = await fetch(`${BASE}/api/booking/slots?slug=mercatura-szkolenie&data=${dClass}`).then((r) => r.json());
  check('class: sloty z liczbą wolnych miejsc', (slotsC.slots ?? []).length > 0 && slotsC.slots[0].wolne_miejsca === 10);
  const c1 = await post('/api/booking/book', { slug: 'mercatura-szkolenie', start: slotsC.slots[0].start, imie: 'Kursant 1' });
  const c2 = await post('/api/booking/book', { slug: 'mercatura-szkolenie', start: slotsC.slots[0].start, imie: 'Kursant 2' });
  check('class: 2 zapisy na ten sam slot (limit miejsc)', c1.status === 200 && c2.status === 200);
  const slotsC2 = await fetch(`${BASE}/api/booking/slots?slug=mercatura-szkolenie&data=${dClass}`).then((r) => r.json());
  check('class: wolne miejsca zmalały o 2', slotsC2.slots[0]?.wolne_miejsca === 8, JSON.stringify(slotsC2.slots?.[0]));

  check('widget publiczny → 200', (await pageText('/rezerwacja/motomax-serwis')).status === 200);
  check('zły slug widgetu → 404', (await pageText('/rezerwacja/nie-ma')).status === 404);
  check('notyfikacja 📅 o rezerwacji', (await pageText('/powiadomienia')).text.includes('nowa rezerwacja'));
  check('rezerwacje widoczne w panelu', (await pageText('/rezerwacje')).text.includes('test rr pierwszy'));

  // ---- D. Ad Manager ----
  console.log('\n[D] ad manager — sync metryk');
  const przedSync = await pageText('/marketing');
  check('/marketing ma zakładkę Reklamy + kampanię seed', przedSync.text.includes('reklamy') && przedSync.text.includes('leady ppoż'));
  const sync = await post('/api/ads/sync', {});
  check('ads/sync → zsynchronizowane ≥1', sync.status === 200 && (sync.json.zsynchronizowane ?? 0) >= 1, JSON.stringify(sync.json).slice(0, 150));
  const m = sync.json.results?.[0]?.metryki;
  check('metryki przyrastają (wydano > 312.45 z seedu)', Number(m?.wydano ?? 0) > 312.45, JSON.stringify(m));

  // ---- E. Multi-tenant + operator-first ----
  console.log('\n[E] multi-tenant + operator-first');
  const klient = await pageText('/klient');
  check('/klient BEZ snapshotów (operator-first)', !klient.text.includes('utwórz snapshot'));
  check('/klient BEZ tworzenia kalendarzy', !klient.text.includes('nowy kalendarz'));
  check('/klient BEZ kampanii reklamowych', !klient.text.includes('nowa kampania (operator)'));
  check('/klient NIE widzi obiektów innego klienta (Pojazd c-7)', !klient.text.includes('pk 12345'));

  // ---- RLS (live only) ----
  console.log('\n[F] RLS multi-tenant (Faza 5)');
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
      const { data: snaps } = await supa.from('snapshots').select('id');
      check('snapshots: klient nie widzi NIC', (snaps ?? []).length === 0);
      for (const table of ['custom_objects', 'custom_object_records', 'smart_lists', 'booking_calendars', 'bookings', 'ad_campaigns']) {
        const { data: rows } = await supa.from(table).select('owner_contact_id');
        const obce = (rows ?? []).filter((r) => r.owner_contact_id !== ownId);
        check(`${table}: 0 cudzych wierszy (widzi ${rows?.length ?? 0})`, obce.length === 0);
      }
      const { error: coErr } = await supa
        .from('custom_objects')
        .insert({ owner_contact_id: ownId, nazwa: 'rls', schema: [] });
      check('klient NIE tworzy schematów obiektów (operator-first)', coErr != null);
      const { error: calErr } = await supa
        .from('booking_calendars')
        .insert({ owner_contact_id: ownId, nazwa: 'rls', slug: `rls-${Date.now()}` });
      check('klient NIE tworzy kalendarzy (operator-first)', calErr != null);
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
