import LossCalculator from '@/components/calc/LossCalculator';

export const metadata = { title: 'Kalkulator strat klienta — STRONEVO OS' };

export default function KalkulatorStratPage() {
  return (
    <div>
      <header className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-stone-100">Kalkulator strat klienta</h1>
        <p className="mt-1 text-sm text-stone-500">
          Policz na żywo przy kliencie, ile traci na nieodebranych telefonach i nieprzyjściach — i ile
          zyska ze STRONEVO. Suwaki na dane klienta, wynik liczy się od razu.
        </p>
      </header>

      <LossCalculator />
    </div>
  );
}
