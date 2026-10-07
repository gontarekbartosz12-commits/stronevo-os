import { listAutomations } from '@/app/actions/automations';
import { AUTOMATION_TYPE_LABELS, POZYSKANIE_METODA_LABELS } from '@/lib/types';

export const metadata = { title: 'Katalog automatyzacji — STRONEVO OS' };
export const dynamic = 'force-dynamic';

const TYPE_BADGE: Record<string, string> = {
  recepcja: 'bg-bordo/25 text-bordo-glow',
  chatbot: 'bg-gold/15 text-gold-light',
  opinie: 'bg-emerald-900/40 text-emerald-300',
  n8n: 'bg-sky-900/40 text-sky-300',
  strona: 'bg-stone-700/40 text-stone-300',
  pakiet: 'bg-gold/25 text-gold-light',
};

export default async function KatalogPage() {
  const automations = await listAutomations();

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-stone-100">Katalog automatyzacji</h1>
        <p className="mt-1 text-sm text-stone-500">
          Usługi przypisywane klientom z karty kontaktu (zakładka Automatyzacje)
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {automations.map((a) => (
          <div
            key={a.id}
            className="card flex flex-col p-5 transition hover:border-gold-dim/60"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <h2 className="font-serif text-xl font-bold text-stone-100">{a.nazwa}</h2>
              <span
                className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-medium uppercase ${
                  TYPE_BADGE[a.typ] ?? TYPE_BADGE.strona
                }`}
              >
                {AUTOMATION_TYPE_LABELS[a.typ]}
              </span>
            </div>
            <p className="flex-1 text-sm leading-relaxed text-stone-400">{a.opis}</p>

            {a.wymagania_od_klienta?.length > 0 && (
              <details className="group mt-3">
                <summary className="cursor-pointer list-none text-[11px] font-medium text-gold-dim">
                  <span className="group-open:hidden">▸</span>
                  <span className="hidden group-open:inline">▾</span> Co uzyskać od klienta (
                  {a.wymagania_od_klienta.length})
                </summary>
                <ul className="mt-2 space-y-1.5 border-l border-ink-border pl-3">
                  {a.wymagania_od_klienta.map((w, i) => (
                    <li key={i} className="text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-stone-300">{w.pozycja}</span>
                        <span className="shrink-0 rounded bg-ink px-1.5 py-0.5 text-[9px] uppercase text-stone-400">
                          {POZYSKANIE_METODA_LABELS[w.metoda]}
                        </span>
                      </div>
                      {w.szczegoly && <p className="mt-0.5 text-[11px] text-stone-500">{w.szczegoly}</p>}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div className="mt-4 flex items-end justify-between border-t border-ink-border pt-4">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-stone-600">Wdrożenie</p>
                <p className="font-serif text-xl font-bold text-gold">
                  {a.cena_wdrozenie} <span className="text-sm font-normal">zł netto</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wider text-stone-600">Abonament</p>
                <p className="font-serif text-xl font-bold text-stone-200">
                  {a.cena_mc} <span className="text-sm font-normal">zł/mc netto</span>
                </p>
                <p className="text-[10px] text-emerald-400">1. miesiąc gratis</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
