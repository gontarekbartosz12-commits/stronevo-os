'use client';

import { ServerOverview, STATUS_LABELS, TYPE_LABELS } from '@/lib/types';
import SourceBadge from '@/components/dashboard/SourceBadge';
import ActivityChart from './ActivityChart';

const RUN_BADGE: Record<string, string> = {
  success: 'bg-emerald-950/50 text-emerald-300',
  error: 'bg-red-950/50 text-red-300',
  waiting: 'bg-gold/10 text-gold-light',
  unknown: 'bg-ink text-stone-500',
};

const INV_COLOR: Record<string, string> = {
  wystawiona: 'text-gold-dim',
  oplacona: 'text-emerald-300',
  zalegla: 'text-red-300',
};

// Kontekst pojedynczego serwera: workflowy jego n8n, przypięci
// prospekci/klienci ze statusem faktur, aktywność w czasie.
export default function ServerPanel({ overview }: { overview: ServerOverview }) {
  const { server, workflows, kontakty, faktury, aktywnosc } = overview;

  return (
    <div className="space-y-5">
      {/* Kontekst działania */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="font-serif text-lg font-bold text-stone-100">{server.nazwa}</p>
          <p className="text-sm text-stone-500">
            {server.host ?? 'brak hosta'}
            {server.port && <>:{server.port}</>}
            {server.n8n_url ? (
              <> · n8n: {server.n8n_url}</>
            ) : (
              <> · n8n: globalny (ENV)</>
            )}
          </p>
          {server.notatka && <p className="mt-1 text-sm text-stone-400">{server.notatka}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
              server.status === 'aktywny'
                ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
                : 'border-ink-border text-stone-500'
            }`}
          >
            {server.status ?? 'nieznany'}
          </span>
          <SourceBadge label="n8n" source={workflows.source} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Aktywność */}
        <div className="card p-5">
          <h3 className="mb-3 font-serif text-lg font-bold text-stone-200">
            Aktywność workflowów (14 dni)
          </h3>
          <ActivityChart points={aktywnosc} />
        </div>

        {/* Workflowy */}
        <div className="card p-5">
          <h3 className="mb-3 font-serif text-lg font-bold text-stone-200">
            Workflowy n8n ({workflows.data.length})
          </h3>
          <ul className="space-y-2">
            {workflows.data.map((wf) => (
              <li key={wf.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-stone-300">
                  {wf.nazwa}
                  {wf.klient && <span className="ml-1.5 text-xs text-stone-600">({wf.klient})</span>}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${wf.aktywny ? 'bg-emerald-400' : 'bg-stone-600'}`}
                  />
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${RUN_BADGE[wf.ostatniStatus]}`}>
                    {wf.ostatniStatus}
                  </span>
                </span>
              </li>
            ))}
            {workflows.data.length === 0 && (
              <li className="text-sm text-stone-600">Brak workflowów na tym serwerze.</li>
            )}
          </ul>
        </div>
      </div>

      {/* Prospekci / klienci serwera */}
      <div className="card overflow-x-auto">
        <div className="border-b border-ink-border px-5 py-4">
          <h3 className="font-serif text-lg font-bold text-stone-200">
            Prospekci i klienci na serwerze ({kontakty.length})
          </h3>
        </div>
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead>
            <tr className="border-b border-ink-border text-[11px] uppercase tracking-wider text-stone-500">
              <th className="px-5 py-3">Kontakt</th>
              <th className="px-5 py-3">Typ</th>
              <th className="px-5 py-3">Etap</th>
              <th className="px-5 py-3">Workflowy</th>
              <th className="px-5 py-3">Faktury</th>
            </tr>
          </thead>
          <tbody>
            {kontakty.map((k) => {
              const nazwa = k.firma ?? k.imie;
              const wfs = workflows.data.filter((wf) => wf.klient && nazwa.includes(wf.klient));
              const invs = faktury.filter((f) => f.contact_id === k.id);
              return (
                <tr key={k.id} className="border-b border-ink-border/60">
                  <td className="px-5 py-3">
                    <p className="font-medium text-stone-200">{k.imie}</p>
                    {k.firma && <p className="text-xs text-stone-500">{k.firma}</p>}
                  </td>
                  <td className="px-5 py-3 text-stone-400">{TYPE_LABELS[k.typ]}</td>
                  <td className="px-5 py-3 text-stone-400">{STATUS_LABELS[k.status_pipeline]}</td>
                  <td className="px-5 py-3 text-xs text-stone-400">
                    {wfs.length > 0 ? wfs.map((w) => w.nazwa).join(', ') : '—'}
                  </td>
                  <td className="px-5 py-3 text-xs">
                    {invs.length === 0
                      ? '—'
                      : invs.map((f) => (
                          <span key={f.id} className={`mr-2 ${INV_COLOR[f.status]}`}>
                            {f.kwota} zł ({f.status})
                          </span>
                        ))}
                  </td>
                </tr>
              );
            })}
            {kontakty.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-stone-600">
                  Brak kontaktów przypiętych do tego serwera (pole Serwer na karcie kontaktu).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
