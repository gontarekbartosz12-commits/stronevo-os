// Weryfikacja FAZY 4 „Commerce" na twardych danych. ⚠️ Prawdziwe pieniądze:
// testujemy PODPISY webhooków, TWARDĄ zgodność kwot i idempotencję.
// Uruchom przy działającym serwerze: node scripts/verify-faza4-commerce.mjs
//
// DoD:
//  A. Link płatniczy → opłata → faktura + notyfikacja (webhook: zły podpis=401,
//     zła kwota=400+alert, drugi webhook=already_paid).
//  B. Kurs dostępny po zakupie (enrollment token → /kurs/[token] + postęp).
//  C. Subskrypcja auto-obciąża (cron charge-due → payment+faktura+next_charge;
//     MRR w Panelu Przychodów obejmuje subskrypcje).
//  D. Multi-tenant + operator-first (+ RLS live).

import { createHmac } from 'node:crypto';

const BASE = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const MOCK_SECRET =
  process.env.MOCK_PAYMENTS_SECRET || process.env.EVENTS_INGEST_KEY || 'stronevo-demo-mock';

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
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body ?? {}),
  });
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

const sign = (token, groszy) =>
  createHmac('sha256', MOCK_SECRET).update(`${token}|${groszy}`).digest('hex');

async function main() {
  console.log(`\n=== Weryfikacja Fazy 4 (Commerce) @ ${BASE} ===\n`);

  // ---- A. Link płatniczy → opłata → faktura ----
  console.log('[A] link płatniczy + webhook (podpis, kwota, idempotencja)');
  const pay1 = await pageText('/pay/pay-demo-1');
  check('/pay/[token] → 200 + kwota DOKŁADNA', pay1.status === 200 && pay1.text.includes('250.00'));
  check('strona pokazuje firmę i opis', pay1.text.includes('mercatura') && pay1.text.includes('przegląd gaśnic'));

  const start = await post('/api/payments/start', { token: 'pay-demo-1' });
  check('start płatności → mock bez redirectu (demo)', start.status === 200 && start.json.provider === 'mock' && start.json.redirect_url === null, JSON.stringify(start.json));

  check('webhook bez ?provider → 400', (await post('/api/payments/webhook', {})).status === 400);
  const badSig = await post('/api/payments/webhook?provider=mock', {
    token: 'pay-demo-1',
    groszy: 25000,
    signature: 'zly-podpis-123',
  });
  check('webhook ze ZŁYM podpisem → 401 (nic nie zapisano)', badSig.status === 401);

  const badAmount = await post('/api/payments/webhook?provider=mock', {
    token: 'pay-demo-1',
    groszy: 100, // podpis poprawny, kwota NIE zgadza się z linkiem (25000 gr)
    signature: sign('pay-demo-1', 100),
  });
  check('poprawny podpis + ZŁA kwota → 400 (twarda weryfikacja kwoty)', badAmount.status === 400, JSON.stringify(badAmount.json));

  const ok1 = await post('/api/payments/webhook?provider=mock', {
    token: 'pay-demo-1',
    groszy: 25000,
    signature: sign('pay-demo-1', 25000),
  });
  check('poprawny webhook → opłacona + faktura', ok1.status === 200 && !!ok1.json.payment_id && !!ok1.json.invoice_id, JSON.stringify(ok1.json));

  const again = await post('/api/payments/webhook?provider=mock', {
    token: 'pay-demo-1',
    groszy: 25000,
    signature: sign('pay-demo-1', 25000),
  });
  check('drugi webhook → already_paid (idempotencja)', again.json.already_paid === true);

  check('strona /pay pokazuje „Opłacono"', (await pageText('/pay/pay-demo-1')).text.includes('opłacono'));
  const powiadomienia = await pageText('/powiadomienia');
  check('notyfikacja 💰 o płatności', powiadomienia.text.includes('opłacono: przegląd gaśnic'));

  // ---- B. Kurs po zakupie ----
  console.log('\n[B] kurs: dostęp po opłacie + postęp');
  const kursPay = await post('/api/payments/mock-pay', { token: 'pay-demo-kurs' });
  check('mock-pay kursu → enrollment_token (odblokowanie)', kursPay.status === 200 && !!kursPay.json.enrollment_token, JSON.stringify(kursPay.json));
  const kursPage = await pageText(`/kurs/${kursPay.json.enrollment_token}`);
  check('/kurs/[token] → 200 + lekcje', kursPage.status === 200 && kursPage.text.includes('podstawy: ogień'));
  check('zły token kursu → 404', (await pageText('/kurs/nie-ma-takiego')).status === 404);

  const progress = await post('/api/kurs/progress', { token: 'kurs-demo-1', lesson_id: 'les-2', ukonczona: true });
  check('zapis postępu (kapability token) → ok', progress.status === 200 && progress.json.ok === true);
  check('postęp bez tokenu → 400', (await post('/api/kurs/progress', { lesson_id: 'les-1' })).status === 400);
  check('seedowy kursant widzi kurs (pasek postępu)', (await pageText('/kurs/kurs-demo-1')).text.includes('twój postęp'));

  // ---- C. Subskrypcje ----
  console.log('\n[C] subskrypcje: auto-obciążenie + MRR');
  const charge = await post('/api/subscriptions/charge-due', {});
  check('charge-due → obciążył zaległą (sub-1)', charge.status === 200 && (charge.json.obciazone ?? 0) >= 1, JSON.stringify(charge.json));
  const charge2 = await post('/api/subscriptions/charge-due', {});
  check('drugi run → 0 (next_charge przesunięty o cykl)', charge2.json.przetworzone === 0, JSON.stringify(charge2.json));
  check('notyfikacja 💳 o obciążeniu', (await pageText('/powiadomienia')).text.includes('subskrypcja obciążona'));
  const dashboard = await pageText('/dashboard');
  check('MRR w Panelu Przychodów obejmuje subskrypcje', dashboard.text.includes('subskrypcja'));

  // ---- D. Multi-tenant + operator-first ----
  console.log('\n[D] multi-tenant + operator-first');
  const klient = await pageText('/klient');
  check('/klient: text-to-pay (funkcja użytkowa)', klient.text.includes('wyślij klientowi link do płatności'));
  check('/klient: BEZ konfiguracji subskrypcji (operator-first)', !klient.text.includes('nowa subskrypcja'));
  check('/klient: BEZ tworzenia kursów (operator-first)', !klient.text.includes('nowy kurs'));
  check('/klient: NIE widzi subskrypcji innego klienta', !klient.text.includes('abonament: recepcja ai'));
  const commerce = await pageText('/commerce');
  check('/commerce (operator): pełny hub', commerce.text.includes('nowy link płatniczy') && commerce.text.includes('abonament: recepcja ai'));

  // ---- RLS (live only) ----
  console.log('\n[E] RLS multi-tenant (Faza 4)');
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
      for (const table of ['payments', 'payment_links', 'subscriptions', 'courses', 'enrollments']) {
        const { data: rows } = await supa.from(table).select('contact_id');
        const obce = (rows ?? []).filter((r) => r.contact_id !== ownId);
        check(`${table}: 0 cudzych wierszy (widzi ${rows?.length ?? 0})`, obce.length === 0);
      }
      const { error: payErr } = await supa
        .from('payments')
        .insert({ contact_id: ownId, kwota: 1, provider: 'mock' });
      check('klient NIE insertuje płatności (tylko webhook/service)', payErr != null);
      const { data: ownSubs } = await supa.from('subscriptions').select('id, status').limit(1);
      if ((ownSubs ?? []).length > 0) {
        const { error: subErr } = await supa
          .from('subscriptions')
          .update({ status: 'anulowana' })
          .eq('id', ownSubs[0].id);
        check('klient NIE zmienia subskrypcji (operator-first)', subErr != null);
      }
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
