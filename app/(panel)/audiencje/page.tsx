import { getSegments } from '@/app/actions/audiences';
import AudiencesView from '@/components/audiences/AudiencesView';

export const metadata = { title: 'Audiencje — STRONEVO OS' };
export const dynamic = 'force-dynamic';

export default async function AudiencjePage() {
  const segments = await getSegments();

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-stone-100">Audiencje (remarketing)</h1>
        <p className="mt-1 text-sm text-stone-500">
          Segmenty kontaktów z CRM wysyłane do Meta Custom Audiences — dane hashowane SHA-256
        </p>
      </header>
      <AudiencesView segments={segments} />
    </div>
  );
}
