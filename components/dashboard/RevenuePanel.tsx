import { RevenueStats } from '@/app/actions/revenue';

const fmt = (n: number) => Math.round(n).toLocaleString('pl-PL');

// Panel przychodów na dashboardzie CEO: ile netto/mc od wszystkich klientów
// (MRR), ile przez rok (ARR), oraz rozbicie per klient (mies. i rok).
export default function RevenuePanel({ stats }: { stats: RevenueStats }) {
  return (
    <section className="mb-6 rounded-2xl border border-stone-800 bg-gradient-to-br from-stone-900 to-stone-950 p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-serif text-xl font-bold text-stone-100">Przychód od klientów</h2>
        <span className="text-xs text-stone-500">
          {stats.liczbaKlientow}{' '}
          {stats.liczbaKlientow === 1 ? 'aktywny klient' : 'aktywnych klientów'} · z umów
          zaakceptowanych · kwoty netto
        </span>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-stone-800 bg-stone-900/60 p-5">
          <p className="text-xs uppercase tracking-wide text-stone-500">Miesięcznie (MRR)</p>
          <p className="mt-1 font-serif text-4xl font-bold text-emerald-400">
            {fmt(stats.mrr)} zł<span className="text-lg font-normal text-stone-500"> /mc</span>
          </p>
          <p className="mt-1 text-xs text-stone-500">
            powtarzalny przychód netto od wszystkich klientów
          </p>
        </div>
        <div className="rounded-xl border border-stone-800 bg-stone-900/60 p-5">
          <p className="text-xs uppercase tracking-wide text-stone-500">Rocznie (ARR)</p>
          <p className="mt-1 font-serif text-4xl font-bold text-amber-300">
            {fmt(stats.arr)} zł<span className="text-lg font-normal text-stone-500"> /rok</span>
          </p>
          <p className="mt-1 text-xs text-stone-500">MRR × 12 — przy utrzymaniu obecnych klientów</p>
        </div>
      </div>

      {stats.perKlient.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-800 text-left text-xs uppercase tracking-wide text-stone-500">
                <th className="py-2 pr-4 font-medium">Klient</th>
                <th className="py-2 pr-4 font-medium">Pakiet</th>
                <th className="py-2 pr-4 text-right font-medium">Miesięcznie</th>
                <th className="py-2 text-right font-medium">Rocznie</th>
              </tr>
            </thead>
            <tbody>
              {stats.perKlient.map((k) => (
                <tr key={k.contactId} className="border-b border-stone-900/70">
                  <td className="py-2.5 pr-4 text-stone-200">{k.nazwa}</td>
                  <td className="py-2.5 pr-4 text-stone-500">{k.pakiet}</td>
                  <td className="py-2.5 pr-4 text-right font-medium text-emerald-400">
                    {fmt(k.miesiecznie)} zł
                  </td>
                  <td className="py-2.5 text-right text-amber-300/90">{fmt(k.rocznie)} zł</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-stone-800 p-4 text-center text-sm text-stone-500">
          Brak zaakceptowanych umów. Gdy klient zaakceptuje umowę, jego abonament pojawi się tutaj —
          miesięcznie i w skali roku.
        </p>
      )}
    </section>
  );
}
