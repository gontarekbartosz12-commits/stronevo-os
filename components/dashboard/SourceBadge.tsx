import { DataSource } from '@/lib/types';

export default function SourceBadge({ label, source }: { label: string; source: DataSource }) {
  const live = source === 'live';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${
        live
          ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
          : 'border-gold-dim/40 bg-gold/5 text-gold-dim'
      }`}
      title={live ? 'Dane z API' : 'Brak kluczy w ENV — dane przykładowe'}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-emerald-400' : 'bg-gold-dim'}`} />
      {label}: {live ? 'live' : 'mock'}
    </span>
  );
}
