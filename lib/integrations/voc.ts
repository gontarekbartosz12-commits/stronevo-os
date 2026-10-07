import { IntegrationResult, VocInsight } from '@/lib/types';

// VoC (Voice of Customer) — o co pytają i czego potrzebują dzwoniący.
// Stub: deterministyczny mock. Docelowo: transkrypcje rozmów z Vapi
// agregowane przez pluggable LLM (lib/llm/provider.ts) — wpięcie przy deployu.
const MOCK_INSIGHTS: VocInsight[] = [
  {
    temat: 'Ceny i cennik usług',
    wystapienia: 14,
    cytat: 'Ile kosztuje pierwsza wizyta i czy jest coś do tego doliczane?',
  },
  {
    temat: 'Wolne terminy w tym tygodniu',
    wystapienia: 11,
    cytat: 'Czy da się jeszcze w czwartek po siedemnastej?',
  },
  {
    temat: 'Przełożenie / odwołanie wizyty',
    wystapienia: 7,
    cytat: 'Muszę przesunąć jutrzejszą godzinę, coś mi wypadło.',
  },
  {
    temat: 'Zakres usługi — pytania szczegółowe',
    wystapienia: 5,
    cytat: 'Czy przy okazji da się też zrobić przegląd?',
  },
  {
    temat: 'Parking / dojazd',
    wystapienia: 3,
    cytat: 'Gdzie najlepiej zaparkować, jak przyjadę autem?',
  },
];

export async function getVocInsights(
  clientId: string
): Promise<IntegrationResult<VocInsight[]>> {
  // Live path (Vapi transcripts + LLM) — celowo dopiero przy deployu:
  // wymaga realnych nagrań; do tego czasu klient widzi przykładową strukturę.
  void clientId;
  return { source: 'mock', data: MOCK_INSIGHTS };
}
