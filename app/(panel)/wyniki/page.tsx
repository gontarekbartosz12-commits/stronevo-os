import Link from 'next/link';
import { getUptimeStats } from '@/app/actions/uptime';
import { getWynikiOverview } from '@/app/actions/wyniki';
import StatTile from '@/components/dashboard/StatTile';
import HealthDot from '@/components/wyniki/HealthDot';
import HealthSection from '@/components/wyniki/HealthSection';
import TrendChart from '@/components/wyniki/TrendChart';
import UptimeWidget from '@/components/wyniki/UptimeWidget';
import { formatPln } from '@/lib/wyniki';

export const metadata = { title: 'Panel Wyników — STRONEVO OS' };
export const dynamic = 'force-dynamic';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// PANEL WYNIKÓW (CEO): zdrowie i wyniki WSZYSTKICH wdrożeń + ~ROI.
// Comiesięczny dowód wartości abonamentu — argument anty-churn i sprzedażowy.
export default async function WynikiPage() {
  const [data, uptime] = await Promise.all([getWynikiOverview(), getUptimeStats()]);
  const kpi = data.kpiMiesiac;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold text-stone-100">Panel Wyników</h1>
        <p className="mt-1 text-sm text-stone-500">
          Wyniki wszystkich wdrożeń w {data.miesiacLabel} — twarde zdarzenia z Ady, chatbotów,
          opinii, SMS-ów i n8n. Kwoty „~” = jawny szacunek.
        </p>
      </div>

      {/* ===== KPI bieżącego miesiąca (wszyscy klienci) ===== */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-7" title={data.metoda}>
        <StatTile label="Rozmowy odebrane" value={kpi.rozmowy} />
        <StatTile
          label="Leady złapane"
          value={kpi.leady}
          hint={kpi.leadyPoGodzinach > 0 ? `w tym ${kpi.leadyPoGodzinach} po godzinach` : undefined}
        />
        <StatTile label="Rezerwacje" value={kpi.rezerwacje} />
        <StatTile label="SMS wysłane" value={kpi.smsy} />
        <StatTile label="Opinie zebrane" value={kpi.opinie} />
        <StatTile label="Godziny oszczędzone" value={`~${kpi.godziny}`} hint="suma, wszyscy klienci" />
        <StatTile
          label="Wartość łącznie"
          value={`~${formatPln(kpi.wartoscPln)} zł`}
          hint={`stawka bazowa ${data.stawkaGlobal} zł/h`}
        />
      </div>

      {/* ===== Trend 30/90 dni ===== */}
      <TrendChart points={data.trend90} tytul="Trend wyników (wszystkie wdrożenia)" />

      {/* ===== Tabela klientów ===== */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-border text-left text-[11px] uppercase tracking-wider text-stone-500">
              <th className="px-5 py-3">Klient</th>
              <th className="px-5 py-3">Aktywne automatyzacje</th>
              <th className="px-5 py-3">Zdarzenia (30 dni)</th>
              <th className="px-5 py-3">Ostatnia aktywność</th>
              <th className="px-5 py-3">Zdrowie</th>
              <th className="px-5 py-3 text-right" title={data.metoda}>
                ~ROI (30 dni)
              </th>
            </tr>
          </thead>
          <tbody>
            {data.clients.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-stone-600">
                  Brak klientów z wdrożeniami — wyniki pojawią się po pierwszym evencie z ingestu.
                </td>
              </tr>
            )}
            {data.clients.map((c) => (
              <tr key={c.contact.id} className="border-b border-ink-border/50 transition hover:bg-ink-hover">
                <td className="px-5 py-3">
                  <Link
                    href={`/wyniki/${c.contact.id}`}
                    className="font-medium text-stone-200 transition hover:text-gold-light"
                  >
                    {c.contact.firma ?? c.contact.imie}
                  </Link>
                  <p className="text-xs text-stone-600">{c.contact.branza ?? ''}</p>
                </td>
                <td className="px-5 py-3 text-stone-300">{c.aktywneAutomatyzacje}</td>
                <td className="px-5 py-3 text-stone-300">{c.zdarzenia30d}</td>
                <td className="px-5 py-3 text-stone-400">{fmtDate(c.ostatniaAktywnosc)}</td>
                <td className="px-5 py-3">
                  <HealthDot status={c.health} withLabel />
                </td>
                <td className="px-5 py-3 text-right font-serif font-bold text-gold">
                  ~{formatPln(c.roi30dPln)} zł
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ===== Zdrowie wdrożeń (czerwone na górze) + realne błędy + remediacja ===== */}
      <HealthSection rollups={data.automationHealth} errors={data.errors} />

      {/* ===== Uptime (dostępność endpointów wdrożeń) ===== */}
      <UptimeWidget stats={uptime} variant="ceo" />

      <p className="text-[11px] text-stone-600">{data.metoda}</p>
    </div>
  );
}
