import { HEALTH_LABELS, HealthStatus } from '@/lib/types';

const COLORS: Record<HealthStatus, string> = {
  ok: '#5e9c6f',
  uwaga: '#d8b677',
  blad: '#c43159',
  nowa: '#78716c',
};

// Kropka zdrowia wdrożenia (zielony/żółty/czerwony/szary)
export default function HealthDot({
  status,
  withLabel = false,
}: {
  status: HealthStatus;
  withLabel?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5" title={HEALTH_LABELS[status]}>
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{
          backgroundColor: COLORS[status],
          boxShadow: status === 'blad' ? `0 0 6px ${COLORS.blad}` : undefined,
        }}
      />
      {withLabel && <span className="text-xs text-stone-400">{HEALTH_LABELS[status]}</span>}
    </span>
  );
}
