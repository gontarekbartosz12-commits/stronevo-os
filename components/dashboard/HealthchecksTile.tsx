import { Healthcheck } from '@/lib/types';

const STATUS_STYLE: Record<Healthcheck['status'], { dot: string; text: string; label: string }> = {
  up: { dot: 'bg-emerald-400', text: 'text-emerald-300', label: 'OK' },
  down: { dot: 'bg-red-500', text: 'text-red-400', label: 'DOWN' },
  late: { dot: 'bg-gold', text: 'text-gold-light', label: 'SPÓŹNIONY' },
  paused: { dot: 'bg-stone-600', text: 'text-stone-500', label: 'PAUZA' },
};

function formatPing(iso: string | null): string {
  if (!iso) return 'nigdy';
  return new Date(iso).toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function HealthchecksTile({ checks }: { checks: Healthcheck[] }) {
  return (
    <div className="card p-5">
      <h2 className="mb-4 font-serif text-lg font-bold text-stone-200">Healthchecks</h2>
      <ul className="space-y-2.5">
        {checks.map((hc) => {
          const s = STATUS_STYLE[hc.status];
          return (
            <li key={hc.nazwa} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2.5 text-stone-300">
                <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
                {hc.nazwa}
              </span>
              <span className="flex items-center gap-3">
                <span className="text-xs text-stone-600">{formatPing(hc.ostatniPing)}</span>
                <span className={`text-[11px] font-semibold ${s.text}`}>{s.label}</span>
              </span>
            </li>
          );
        })}
        {checks.length === 0 && <li className="text-sm text-stone-600">Brak checków.</li>}
      </ul>
    </div>
  );
}
