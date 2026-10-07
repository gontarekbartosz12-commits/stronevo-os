import { NextRequest, NextResponse } from 'next/server';
import { sendOpsAlert } from '@/lib/alerts';
import { demoStore } from '@/lib/demo-store';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';
import { UptimeCheck } from '@/lib/types';
import { isDue, pingUrl, simulatePing } from '@/lib/uptime';

// POST /api/uptime/run — cron uptime (Faza 1 zaufania).
// Cron VPS/n8n woła co minutę-pięć; pingujemy TYLKO checki, którym minął
// interval_min. Wynik → uptime_pings (historia do % dostępności) + update
// uptime_checks. Przejście ok→fail = powiadomienie + alert Telegram/SMS;
// fail→ok = powiadomienie info „wróciło".
// Autoryzacja: Bearer <UPTIME_API_TOKEN | NOTIFY_API_TOKEN>; bez ENV — otwarte (dev/demo).
// Tryb demo: ping symulowany deterministycznie (bez ruchu sieciowego).

export async function POST(request: NextRequest) {
  const token = process.env.UPTIME_API_TOKEN || process.env.NOTIFY_API_TOKEN;
  if (token) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${token}`) {
      return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 });
    }
  }

  try {
    const demo = !isSupabaseConfigured();
    if (!demo && !isAdminConfigured()) {
      return NextResponse.json(
        { error: 'Brak SUPABASE_SERVICE_ROLE_KEY — cron uptime wymaga service role' },
        { status: 503 }
      );
    }

    const now = new Date();
    let checks: UptimeCheck[];
    if (demo) {
      checks = demoStore.listUptimeChecks();
    } else {
      const supabase = createAdminClient();
      const { data } = await supabase.from('uptime_checks').select('*').eq('aktywny', true);
      checks = (data ?? []) as UptimeCheck[];
    }

    const due = checks.filter((c) => isDue(c, now));
    const results: {
      check_id: string;
      nazwa: string;
      ok: boolean;
      status: number | null;
      ms: number;
      transition: 'ok->fail' | 'fail->ok' | null;
    }[] = [];

    for (const check of due) {
      const ping = demo ? simulatePing(check.id, now) : await pingUrl(check);
      const prevOk = check.ok; // null = pierwszy pomiar, bez alertu
      const transition =
        prevOk === true && !ping.ok
          ? ('ok->fail' as const)
          : prevOk === false && ping.ok
            ? ('fail->ok' as const)
            : null;

      if (demo) {
        demoStore.createUptimePing({
          check_id: check.id,
          contact_id: check.contact_id,
          ok: ping.ok,
          status: ping.status,
          ms: ping.ms,
          checked_at: now.toISOString(),
        });
        demoStore.updateUptimeCheck(check.id, {
          last_check_at: now.toISOString(),
          last_status: ping.status,
          ok: ping.ok,
        });
      } else {
        const supabase = createAdminClient();
        await supabase.from('uptime_pings').insert({
          check_id: check.id,
          contact_id: check.contact_id,
          ok: ping.ok,
          status: ping.status,
          ms: ping.ms,
          checked_at: now.toISOString(),
        });
        await supabase
          .from('uptime_checks')
          .update({ last_check_at: now.toISOString(), last_status: ping.status, ok: ping.ok })
          .eq('id', check.id);
      }

      if (transition === 'ok->fail') {
        await notifyTransition(
          demo,
          'warn',
          `Endpoint padł: ${check.nazwa}`,
          `${check.url} zwraca ${ping.status ?? 'brak odpowiedzi'} (oczekiwano ${check.expected_status}). Klient może nie mieć działającej usługi — sprawdź w /wyniki.`,
          check
        );
        await sendOpsAlert(`Endpoint padł: ${check.nazwa} → ${ping.status ?? 'timeout'} (${check.url})`);
      } else if (transition === 'fail->ok') {
        await notifyTransition(
          demo,
          'info',
          `Endpoint wrócił: ${check.nazwa}`,
          `${check.url} znów odpowiada ${ping.status}.`,
          check
        );
      }

      results.push({
        check_id: check.id,
        nazwa: check.nazwa,
        ok: ping.ok,
        status: ping.status,
        ms: ping.ms,
        transition,
      });
    }

    return NextResponse.json({
      ok: true,
      sprawdzone: results.length,
      pominiete: checks.length - due.length,
      results,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Błąd crona uptime' },
      { status: 500 }
    );
  }
}

async function notifyTransition(
  demo: boolean,
  severity: 'info' | 'warn',
  tytul: string,
  opis: string,
  check: UptimeCheck
) {
  const row = {
    typ: 'techniczne' as const,
    severity,
    tytul,
    opis,
    related_typ: 'uptime_check',
    related_id: check.id,
    status: 'nowe' as const,
    akcje: [],
  };
  if (demo) {
    demoStore.createNotification(row);
  } else {
    await createAdminClient().from('notifications').insert(row);
  }
}
