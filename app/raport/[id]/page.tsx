import { notFound } from 'next/navigation';
import { demoStore } from '@/lib/demo-store';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';
import { MonthlyReport } from '@/lib/types';
import { MonthlyReportPayload, formatPln } from '@/lib/wyniki';
import PrintButton from './PrintButton';

// Raport miesięczny — publiczna brandowana strona STRONEVO (jak /umowa/[id]):
// dostęp przez nieodgadywalny UUID (capability URL), noindex/nofollow,
// nadaje się do druku/PDF (Ctrl+P). Ton: usprawnienie/wynik/nowoczesność.
export const metadata = {
  title: 'Raport wyników — STRONEVO',
  robots: { index: false, follow: false, nocache: true },
};
export const dynamic = 'force-dynamic';

async function getReport(id: string): Promise<MonthlyReport | null> {
  if (!isSupabaseConfigured()) return demoStore.getMonthlyReport(id);
  // Service role: UUID raportu pełni rolę tokenu (link z maila, brak sesji).
  const supabase = isAdminConfigured() ? createAdminClient() : await createClient();
  const { data } = await supabase.from('monthly_reports').select('*').eq('id', id).maybeSingle();
  return data as MonthlyReport | null;
}

export default async function RaportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await getReport(id);
  if (!report) notFound();

  const p = report.payload as unknown as MonthlyReportPayload;
  const kpi = p.kpi;

  const tiles = [
    { label: 'Rozmowy odebrane', value: kpi.rozmowy },
    {
      label: 'Leady złapane',
      value: kpi.leady,
      hint: kpi.leadyPoGodzinach > 0 ? `w tym ${kpi.leadyPoGodzinach} po godzinach` : undefined,
    },
    { label: 'Rezerwacje', value: kpi.rezerwacje },
    { label: 'Opinie zebrane', value: kpi.opinie },
    { label: 'SMS wysłane', value: kpi.smsy },
    { label: 'Uruchomienia workflow', value: kpi.workflowRuns },
  ].filter((t) => t.value > 0);

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      {/* Nagłówek brandu */}
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-ink-border pb-6 print:border-stone-300">
        <div>
          <p className="font-serif text-3xl font-bold tracking-wide text-gold print:text-stone-900">
            STRONEVO
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.25em] text-bordo-glow">
            Raport wyników
          </p>
        </div>
        <div className="text-right">
          <p className="font-serif text-xl font-bold capitalize text-stone-100 print:text-stone-900">
            {p.okres_label}
          </p>
          <p className="text-sm text-stone-500">{p.firma}</p>
        </div>
      </header>

      {/* Zdanie ROI */}
      <section className="mb-8">
        <p className="font-serif text-2xl font-bold leading-snug text-stone-100 print:text-stone-900">
          {p.roi_zdanie}
        </p>
      </section>

      {/* Sedno: czas + wartość */}
      <section className="mb-8 grid grid-cols-2 gap-4">
        <div className="card border-gold-dim/40 p-6 text-center print:border-stone-300">
          <p className="text-[11px] uppercase tracking-wider text-stone-500">
            Zaoszczędzony czas
          </p>
          <p className="mt-2 font-serif text-5xl font-bold text-gold print:text-stone-900">
            ~{kpi.godziny} <span className="text-2xl">h</span>
          </p>
        </div>
        <div className="card border-gold-dim/40 p-6 text-center print:border-stone-300">
          <p className="text-[11px] uppercase tracking-wider text-stone-500">Wartość</p>
          <p className="mt-2 font-serif text-5xl font-bold text-gold print:text-stone-900">
            ~{formatPln(kpi.wartoscPln)} <span className="text-2xl">zł</span>
          </p>
        </div>
      </section>

      {/* KPI */}
      {tiles.length > 0 && (
        <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {tiles.map((t) => (
            <div key={t.label} className="card p-4 print:border-stone-300">
              <p className="text-[11px] uppercase tracking-wider text-stone-500">{t.label}</p>
              <p className="mt-1 font-serif text-3xl font-bold text-stone-200 print:text-stone-900">
                {t.value}
              </p>
              {t.hint && <p className="text-xs text-stone-500">{t.hint}</p>}
            </div>
          ))}
        </section>
      )}

      {/* Rozbicie per automatyzacja */}
      {p.automatyzacje.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 font-serif text-lg font-bold text-stone-200 print:text-stone-900">
            Co pracowało dla Ciebie
          </h2>
          <div className="card overflow-hidden print:border-stone-300">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-border text-left text-[11px] uppercase tracking-wider text-stone-500 print:border-stone-300">
                  <th className="px-4 py-2.5">Automatyzacja</th>
                  <th className="px-4 py-2.5 text-right">Zdarzenia</th>
                  <th className="px-4 py-2.5 text-right">Minuty</th>
                  <th className="px-4 py-2.5 text-right">~Wartość</th>
                </tr>
              </thead>
              <tbody>
                {p.automatyzacje.map((a) => (
                  <tr key={a.nazwa} className="border-b border-ink-border/50 last:border-0 print:border-stone-200">
                    <td className="px-4 py-2.5 font-medium text-stone-200 print:text-stone-900">
                      {a.nazwa}
                    </td>
                    <td className="px-4 py-2.5 text-right text-stone-300 print:text-stone-700">
                      {a.zdarzenia}
                    </td>
                    <td className="px-4 py-2.5 text-right text-stone-300 print:text-stone-700">
                      {a.minuty}
                    </td>
                    <td className="px-4 py-2.5 text-right font-serif font-bold text-gold print:text-stone-900">
                      ~{formatPln(a.wartosc_pln)} zł
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Metoda liczenia — jawność szacunku */}
      <section className="mb-8 rounded-lg border border-ink-border bg-ink-soft/60 p-4 print:border-stone-300 print:bg-stone-50">
        <p className="text-[11px] uppercase tracking-wider text-stone-500">Jak to liczymy</p>
        <p className="mt-1.5 text-xs leading-relaxed text-stone-400 print:text-stone-600">{p.metoda}</p>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-border pt-5 print:border-stone-300">
        <p className="text-xs text-stone-500">
          STRONEVO · kontakt@stronevo.pl · stronevo.pl
        </p>
        <PrintButton />
      </footer>
    </main>
  );
}
