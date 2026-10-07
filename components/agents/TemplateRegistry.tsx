import { TemplateRegistryData } from '@/app/actions/templates';

// Rejestr wersji szablonów (Faza 1 zaufania) — „która wersja u którego klienta".
// Wdrożenia na starszej wersji niż najnowsza w rejestrze = „do aktualizacji".
export default function TemplateRegistry({ data }: { data: TemplateRegistryData }) {
  return (
    <section className="mt-8">
      <h2 className="mb-1 font-serif text-xl font-bold text-stone-100">
        Wersje szablonów u klientów
      </h2>
      <p className="mb-4 text-sm text-stone-500">
        Golden-templates n8n i ich wdrożenia — aktualizacja = zadanie build z nowym JSON-em
        z rejestru (n8n_json_ref).
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {data.groups.map((g) => (
          <div key={g.nazwa} className="card p-5">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-mono text-sm font-semibold text-stone-100">
                {g.nazwa}
                <span className="ml-2 rounded bg-gold/15 px-2 py-0.5 text-[11px] font-medium text-gold-light">
                  najnowsza {g.najnowsza.wersja}
                </span>
              </p>
              {g.doAktualizacji > 0 && (
                <span className="rounded bg-bordo/25 px-2 py-0.5 text-[11px] font-semibold text-bordo-glow">
                  {g.doAktualizacji} do aktualizacji
                </span>
              )}
            </div>
            {g.najnowsza.opis && (
              <p className="mb-3 text-xs text-stone-500">{g.najnowsza.opis}</p>
            )}

            {g.deployments.length === 0 ? (
              <p className="text-xs text-stone-600">Brak wdrożeń tego szablonu.</p>
            ) : (
              <ul className="divide-y divide-ink-border/60">
                {g.deployments.map((d) => (
                  <li key={d.caId} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate text-sm text-stone-300">
                      {d.klient}
                      <span className="ml-2 text-xs text-stone-500">{d.automatyzacja}</span>
                    </span>
                    <span
                      className={`shrink-0 rounded px-2 py-0.5 font-mono text-[11px] ${
                        d.aktualna
                          ? 'bg-emerald-900/40 text-emerald-300'
                          : 'bg-bordo/20 text-bordo-glow'
                      }`}
                      title={d.aktualna ? 'wersja aktualna' : `do aktualizacji → ${g.najnowsza.wersja}`}
                    >
                      {d.wersja ?? '—'} {d.aktualna ? '✓' : '↑'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {g.starsze > 0 && (
              <p className="mt-2 text-[11px] text-stone-600">
                {g.starsze} {g.starsze === 1 ? 'starsza wersja' : 'starsze wersje'} w rejestrze
              </p>
            )}
          </div>
        ))}
      </div>

      {data.bezWersji.length > 0 && (
        <div className="card mt-4 p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-stone-500">
            Wdrożenia bez przypisanej wersji szablonu
          </p>
          <p className="text-xs text-stone-500">
            {data.bezWersji.map((d) => `${d.automatyzacja} (${d.klient})`).join(' · ')} — uzupełnij
            client_automations.template_version przy najbliższym deployu.
          </p>
        </div>
      )}
    </section>
  );
}
