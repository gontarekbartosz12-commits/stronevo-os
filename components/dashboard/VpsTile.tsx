import { VpsStatus } from '@/lib/types';

function Bar({ label, used, total, unit }: { label: string; used: number; total: number; unit: string }) {
  const pct = Math.min(100, Math.round((used / total) * 100));
  const color = pct > 85 ? 'bg-bordo-glow' : pct > 65 ? 'bg-gold-dim' : 'bg-emerald-600';
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-stone-400">{label}</span>
        <span className="text-stone-500">
          {used} / {total} {unit} ({pct}%)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-ink">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function VpsTile({ vps }: { vps: VpsStatus }) {
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-serif text-lg font-bold text-stone-200">Status VPS</h2>
        <span className="text-xs text-stone-500">
          {vps.host} · uptime {vps.uptime}
        </span>
      </div>
      <div className="space-y-4">
        <Bar label="RAM" used={vps.ramUsedGb} total={vps.ramTotalGb} unit="GB" />
        <Bar label="Dysk" used={vps.diskUsedGb} total={vps.diskTotalGb} unit="GB" />
        <div>
          <p className="mb-1 text-xs text-stone-400">Load average</p>
          <div className="flex gap-4 font-mono text-sm text-stone-300">
            <span>
              <span className="text-stone-600">1m</span> {vps.load1.toFixed(2)}
            </span>
            <span>
              <span className="text-stone-600">5m</span> {vps.load5.toFixed(2)}
            </span>
            <span>
              <span className="text-stone-600">15m</span> {vps.load15.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
