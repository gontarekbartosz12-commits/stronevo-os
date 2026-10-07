import { N8nWorkflow } from '@/lib/types';

const RUN_STATUS: Record<N8nWorkflow['ostatniStatus'], { label: string; cls: string }> = {
  success: { label: 'sukces', cls: 'bg-emerald-950/50 text-emerald-300 border-emerald-800' },
  error: { label: 'błąd', cls: 'bg-red-950/50 text-red-300 border-red-800' },
  waiting: { label: 'oczekuje', cls: 'bg-gold/10 text-gold-light border-gold-dim/40' },
  unknown: { label: 'brak danych', cls: 'bg-ink text-stone-500 border-ink-border' },
};

function formatRun(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function WorkflowTable({ workflows }: { workflows: N8nWorkflow[] }) {
  return (
    <div className="card overflow-x-auto">
      <div className="border-b border-ink-border px-5 py-4">
        <h2 className="font-serif text-lg font-bold text-stone-200">Workflowy n8n</h2>
      </div>
      <table className="w-full min-w-[700px] text-left text-sm">
        <thead>
          <tr className="border-b border-ink-border text-[11px] uppercase tracking-wider text-stone-500">
            <th className="px-5 py-3">Nazwa</th>
            <th className="px-5 py-3">Klient</th>
            <th className="px-5 py-3">Aktywny</th>
            <th className="px-5 py-3">Ostatni status</th>
            <th className="px-5 py-3">Ostatnie uruchomienie</th>
          </tr>
        </thead>
        <tbody>
          {workflows.map((wf) => {
            const rs = RUN_STATUS[wf.ostatniStatus];
            return (
              <tr key={wf.id} className="border-b border-ink-border/60">
                <td className="px-5 py-3 font-medium text-stone-200">{wf.nazwa}</td>
                <td className="px-5 py-3 text-stone-400">{wf.klient ?? '—'}</td>
                <td className="px-5 py-3">
                  {wf.aktywny ? (
                    <span className="inline-flex items-center gap-1.5 text-emerald-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> tak
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-stone-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-stone-600" /> nie
                    </span>
                  )}
                </td>
                <td className="px-5 py-3">
                  <span className={`rounded-full border px-2.5 py-0.5 text-[11px] ${rs.cls}`}>
                    {rs.label}
                  </span>
                </td>
                <td className="px-5 py-3 text-xs text-stone-500">
                  {formatRun(wf.ostatnieUruchomienie)}
                </td>
              </tr>
            );
          })}
          {workflows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-5 py-10 text-center text-stone-600">
                Brak workflowów.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
