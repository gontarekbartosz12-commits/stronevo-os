export default function StatTile({
  label,
  value,
  hint,
  alert = false,
}: {
  label: string;
  value: string | number;
  hint?: string;
  alert?: boolean;
}) {
  return (
    <div className={`card p-5 ${alert ? 'border-bordo/70' : ''}`}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-stone-500">{label}</p>
      <p className={`mt-2 font-serif text-4xl font-bold ${alert ? 'text-bordo-glow' : 'text-gold'}`}>
        {value}
      </p>
      {hint && <p className="mt-1 truncate text-xs text-stone-500">{hint}</p>}
    </div>
  );
}
