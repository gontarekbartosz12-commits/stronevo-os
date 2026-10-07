import { UptimeStatWithClient } from '@/app/actions/uptime';
import { formatDostepnosc } from '@/lib/uptime';

function dot(ok: boolean | null): { color: string; label: string } {
  if (ok === null) return { color: '#78716c', label: 'nie sprawdzono' };
  return ok ? { color: '#5e9c6f', label: 'działa' } : { color: '#c43159', label: 'nie odpowiada' };
}

// Widżet dostępności (Faza 1 zaufania).
// variant 'ceo' (/wyniki): pełne dane techniczne (URL, ostatni status).
// variant 'klient' (/klient): tylko nazwa + „dostępność 99,x% w tym miesiącu" —
// klient dostaje wynik, nie stacktrace.
export default function UptimeWidget({
  stats,
  variant = 'ceo',
}: {
  stats: UptimeStatWithClient[];
  variant?: 'ceo' | 'klient';
}) {
  if (stats.length === 0) {
    return variant === 'ceo' ? (
      <div className="card p-5">
        <h3 className="font-serif text-lg font-bold text-stone-200">Dostępność (uptime)</h3>
        <p className="mt-2 text-sm text-stone-600">
          Brak monitorów — dodaj wpisy w uptime_checks przy deployu wdrożenia.
        </p>
      </div>
    ) : null;
  }

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="font-serif text-lg font-bold text-stone-200">
          {variant === 'klient' ? 'Dostępność Twoich usług' : 'Dostępność (uptime)'}
        </h3>
        <span className="text-[11px] text-stone-600">bieżący miesiąc</span>
      </div>
      <ul className="divide-y divide-ink-border/60">
        {stats.map((s) => {
          const d = dot(s.check.ok);
          return (
            <li key={s.check.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: d.color, boxShadow: s.check.ok === false ? `0 0 6px ${d.color}` : undefined }}
                  title={d.label}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm text-stone-200">
                    {s.check.nazwa}
                    {variant === 'ceo' && s.klient && (
                      <span className="ml-2 text-xs text-stone-500">{s.klient}</span>
                    )}
                  </p>
                  {variant === 'ceo' && (
                    <p className="truncate text-[11px] text-stone-600">
                      {s.check.url} · co {s.check.interval_min} min
                      {s.check.last_status != null && <> · ostatnio HTTP {s.check.last_status}</>}
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p
                  className={`font-serif text-lg font-bold ${
                    s.dostepnoscProc !== null && s.dostepnoscProc < 99
                      ? 'text-bordo-glow'
                      : 'text-gold'
                  }`}
                >
                  {formatDostepnosc(s.dostepnoscProc)}
                </p>
                <p className="text-[10px] text-stone-600">
                  {s.pingiMiesiac > 0 ? `${s.okMiesiac}/${s.pingiMiesiac} pomiarów OK` : 'brak pomiarów'}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
