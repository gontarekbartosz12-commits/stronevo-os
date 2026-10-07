import { UptimeCheck, UptimePing } from './types';

// UPTIME — logika dostępności (Faza 1 zaufania).
// „Dostępność 99,x% w tym miesiącu" = odsetek udanych pingów z uptime_pings
// w bieżącym miesiącu. Prosto i jawnie — bez ważenia, bez interpolacji.

export interface UptimeStat {
  check: UptimeCheck;
  pingiMiesiac: number;
  okMiesiac: number;
  dostepnoscProc: number | null; // null = brak pingów w tym miesiącu
  ostatniaAwaria: string | null;
}

export function computeUptimeStat(
  check: UptimeCheck,
  pings: UptimePing[], // pingi TEGO checka
  now = new Date()
): UptimeStat {
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const month = pings.filter((p) => new Date(p.checked_at) >= from);
  const ok = month.filter((p) => p.ok).length;
  const ostatniaAwaria = pings
    .filter((p) => !p.ok)
    .reduce<string | null>((acc, p) => (!acc || p.checked_at > acc ? p.checked_at : acc), null);

  return {
    check,
    pingiMiesiac: month.length,
    okMiesiac: ok,
    dostepnoscProc:
      month.length === 0 ? null : Math.round((ok / month.length) * 1000) / 10,
    ostatniaAwaria,
  };
}

export function formatDostepnosc(proc: number | null): string {
  if (proc === null) return '—';
  return `${proc.toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

// Czy check jest „wymagalny" (cron woła /api/uptime/run co minutę/kilka —
// pingujemy tylko te, którym minął interval)
export function isDue(check: UptimeCheck, now = new Date()): boolean {
  if (!check.aktywny) return false;
  if (!check.last_check_at) return true;
  const ageMin = (now.getTime() - new Date(check.last_check_at).getTime()) / 60_000;
  return ageMin >= check.interval_min;
}

// Realny ping endpointu (tryb live). Timeout 8 s; błąd sieci = fail.
export async function pingUrl(
  check: Pick<UptimeCheck, 'url' | 'method' | 'expected_status'>
): Promise<{ ok: boolean; status: number | null; ms: number }> {
  const started = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(check.url, {
      method: check.method,
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);
    return {
      ok: res.status === check.expected_status,
      status: res.status,
      ms: Date.now() - started,
    };
  } catch {
    return { ok: false, status: null, ms: Date.now() - started };
  }
}

// Symulacja pingu w trybie demo — deterministyczna per (check, godzina),
// żeby wynik nie skakał między odświeżeniami. ~99% ok.
export function simulatePing(checkId: string, now = new Date()): {
  ok: boolean;
  status: number;
  ms: number;
} {
  const hourKey = `${checkId}-${now.toISOString().slice(0, 13)}`;
  const seed = [...hourKey].reduce((s, c) => (s * 31 + c.charCodeAt(0)) % 233280, 7);
  const ok = seed % 100 !== 13; // ~1% awarii
  return { ok, status: ok ? 200 : 503, ms: 120 + (seed % 400) };
}
