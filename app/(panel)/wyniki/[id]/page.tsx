import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getWynikiClient } from '@/app/actions/wyniki';
import StatTile from '@/components/dashboard/StatTile';
import HealthDot from '@/components/wyniki/HealthDot';
import TrendChart from '@/components/wyniki/TrendChart';
import { formatPln, okresLabel } from '@/lib/wyniki';

export const metadata = { title: 'Wyniki klienta — STRONEVO OS' };
export const dynamic = 'force-dynamic';

// Szczegół klienta (CEO): rozbicie wyników per automatyzacja + wykres + raporty.
export default async function WynikiKlientaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getWynikiClient(id);
  if (!data) notFound();

  const kpi = data.kpiMiesiac;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/wyniki" className="text-sm text-stone-500 transition hover:text-gold-light">
          &larr; Panel Wyników
        </Link>
        <h1 className="mt-2 font-serif text-3xl font-bold text-stone-100">
          {data.contact.firma ?? data.contact.imie}
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Wyniki w {data.miesiacLabel} · stawka {data.stawka} zł/h
          {data.contact.stawka_pln_h ? ' (indywidualna)' : ' (globalna)'} ·{' '}
          <Link
            href={`/klient?contact_id=${data.contact.id}`}
            className="text-gold-dim underline transition hover:text-gold-light"
          >
            podgląd panelu klienta
          </Link>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6" title={data.metoda}>
        <StatTile label="Rozmowy" value={kpi.rozmowy} />
        <StatTile
          label="Leady"
          value={kpi.leady}
          hint={kpi.leadyPoGodzinach > 0 ? `${kpi.leadyPoGodzinach} po godzinach` : undefined}
        />
        <StatTile label="Rezerwacje" value={kpi.rezerwacje} />
        <StatTile label="Opinie" value={kpi.opinie} />
        <StatTile label="Godziny" value={`~${kpi.godziny}`} />
        <StatTile label="Wartość" value={`~${formatPln(kpi.wartoscPln)} zł`} />
      </div>

      <TrendChart points={data.trend30} windows={[30]} tytul="Trend 30 dni" />

      {/* ===== Rozbicie per automatyzacja ===== */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-border text-left text-[11px] uppercase tracking-wider text-stone-500">
              <th className="px-5 py-3">Automatyzacja</th>
              <th className="px-5 py-3">Zdrowie</th>
              <th className="px-5 py-3">Zdarzenia (30 dni)</th>
              <th className="px-5 py-3">Minuty oszczędzone</th>
              <th className="px-5 py-3 text-right" title={data.metoda}>
                ~Wartość (30 dni)
              </th>
            </tr>
          </thead>
          <tbody>
            {data.automatyzacje.map((r) => (
              <tr key={r.ca.id} className="border-b border-ink-border/50">
                <td className="px-5 py-3 font-medium text-stone-200">{r.nazwa}</td>
                <td className="px-5 py-3">
                  <HealthDot status={r.health} withLabel />
                </td>
                <td className="px-5 py-3 text-stone-300">{r.zdarzenia30d}</td>
                <td className="px-5 py-3 text-stone-300">{r.minuty30d}</td>
                <td className="px-5 py-3 text-right font-serif font-bold text-gold">
                  ~{formatPln(r.wartosc30dPln)} zł
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ===== Raporty miesięczne ===== */}
      <div className="card p-5">
        <h3 className="mb-3 font-serif text-lg font-bold text-stone-200">Raporty miesięczne</h3>
        {data.raporty.length === 0 ? (
          <p className="text-sm text-stone-600">
            Jeszcze brak — raport generuje się automatycznie 1. dnia miesiąca.
          </p>
        ) : (
          <ul className="divide-y divide-ink-border/60">
            {data.raporty.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-sm capitalize text-stone-200">
                  {okresLabel(new Date(r.okres))}
                </span>
                <span className="flex items-center gap-3 text-xs text-stone-500">
                  {r.wyslany_at ? `wysłany ${new Date(r.wyslany_at).toLocaleDateString('pl-PL')}` : 'nie wysłany'}
                  <Link
                    href={`/raport/${r.id}`}
                    className="rounded border border-gold-dim/40 px-2.5 py-1 text-gold-light transition hover:bg-gold/10"
                  >
                    Otwórz raport
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[11px] text-stone-600">{data.metoda}</p>
    </div>
  );
}
