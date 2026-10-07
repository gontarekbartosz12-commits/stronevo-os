import Link from 'next/link';
import { WynikiClientData } from '@/app/actions/wyniki';
import TrendChart from '@/components/wyniki/TrendChart';
import { formatPln, okresLabel } from '@/lib/wyniki';

// „Twoje wyniki" (panel klienta) — KPI bieżącego miesiąca + zdanie ROI po
// ludzku + trend + historia raportów. Ton STRONEVO: usprawnienie, wynik,
// nowoczesność — NIGDY „bo sobie nie radzisz". Kwoty = jawny szacunek („~”).
export default function ClientResults({ data }: { data: WynikiClientData }) {
  const kpi = data.kpiMiesiac;
  const najnowszyRaport = data.raporty[0] ?? null;

  const tiles = [
    { label: 'Rozmowy odebrane', value: kpi.rozmowy },
    { label: 'Leady złapane', value: kpi.leady },
    { label: 'Rezerwacje', value: kpi.rezerwacje },
    { label: 'Opinie zebrane', value: kpi.opinie },
    { label: 'SMS wysłane', value: kpi.smsy },
  ].filter((t) => t.value > 0);

  return (
    <div className="space-y-5">
      {/* Zdanie ROI po ludzku */}
      <div className="card border-gold-dim/40 p-6" title={data.metoda}>
        <p className="text-[11px] font-medium uppercase tracking-wider text-stone-500">
          Twoje wyniki · {data.miesiacLabel}
        </p>
        <p className="mt-2 font-serif text-2xl font-bold leading-snug text-stone-100">
          {data.roiZdanie}
        </p>
        <div className="mt-4 flex flex-wrap items-baseline gap-x-8 gap-y-2">
          <span className="font-serif text-4xl font-bold text-gold">
            ~{kpi.godziny} <span className="text-xl">h czasu</span>
          </span>
          <span className="font-serif text-4xl font-bold text-gold">
            ~{formatPln(kpi.wartoscPln)} <span className="text-xl">zł</span>
          </span>
        </div>
        <p className="mt-3 inline-flex cursor-help items-center gap-1.5 rounded-full border border-ink-border px-2.5 py-1 text-[11px] text-stone-500" title={data.metoda}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8h.01M11 12h1v4h1" />
          </svg>
          jawny szacunek · {data.stawka} zł/h
        </p>
      </div>

      {/* KPI miesiąca */}
      {tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {tiles.map((t) => (
            <div key={t.label} className="card p-4">
              <p className="text-[11px] uppercase tracking-wider text-stone-500">{t.label}</p>
              <p className="mt-1 font-serif text-3xl font-bold text-stone-200">{t.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Mały wykres 30 dni */}
      <TrendChart points={data.trend30} windows={[30]} tytul="Ostatnie 30 dni" />

      {/* Historia miesięcy + PDF */}
      <div className="card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-serif text-lg font-bold text-stone-200">Historia miesięcy</h3>
          {najnowszyRaport && (
            <Link
              href={`/raport/${najnowszyRaport.id}`}
              target="_blank"
              className="btn-ghost !py-1.5 text-xs"
            >
              Pobierz raport (PDF)
            </Link>
          )}
        </div>
        {data.raporty.length === 0 ? (
          <p className="text-sm text-stone-600">
            Pierwszy raport miesięczny pojawi się tu automatycznie 1. dnia kolejnego miesiąca —
            dostaniesz go też mailem.
          </p>
        ) : (
          <ul className="divide-y divide-ink-border/60">
            {data.raporty.map((r) => {
              const p = r.payload as { kpi?: { godziny?: number; wartoscPln?: number } };
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="text-sm capitalize text-stone-200">
                    {okresLabel(new Date(r.okres))}
                  </span>
                  <span className="flex items-center gap-4">
                    {p.kpi && (
                      <span className="text-xs text-stone-500">
                        ~{p.kpi.godziny ?? 0} h · ~{formatPln(p.kpi.wartoscPln ?? 0)} zł
                      </span>
                    )}
                    <Link
                      href={`/raport/${r.id}`}
                      target="_blank"
                      className="rounded border border-gold-dim/40 px-2.5 py-1 text-[11px] text-gold-light transition hover:bg-gold/10"
                    >
                      Zobacz raport
                    </Link>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
