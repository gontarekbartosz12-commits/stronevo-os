// Pasek „Status uruchomienia" (na Pulpicie) — konsoliduje rozproszone
// „napisz do opiekuna" w jeden świadomy plan wdrożenia: co już działa (✓)
// a co opiekun STRONEVO jeszcze kończy (⏳). Zamienia wrażenie „połowa nie
// działa" na „trwa uruchamianie". Komponent prezentacyjny (bez stanu).

export interface SetupItem {
  label: string;
  ready: boolean;
}

export default function ClientStatusBar({ items }: { items: SetupItem[] }) {
  const done = items.filter((i) => i.ready).length;
  const wszystko = done === items.length;

  return (
    <div className="card border-gold-dim/30 p-4">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-stone-200">Status uruchomienia</p>
        <span className="text-xs text-stone-500">
          {wszystko
            ? 'Wszystko uruchomione ✓'
            : `${done}/${items.length} gotowe · resztę kończy opiekun STRONEVO`}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((i) => (
          <span
            key={i.label}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
              i.ready
                ? 'border-emerald-800/60 bg-emerald-950/30 text-emerald-300'
                : 'border-ink-border text-stone-400'
            }`}
          >
            <span>{i.ready ? '✓' : '⏳'}</span>
            {i.label}
          </span>
        ))}
      </div>
    </div>
  );
}
