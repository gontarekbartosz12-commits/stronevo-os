import { BusinessHours, IntegrationResult } from '@/lib/types';

// Auto-zaczyt godzin pracy z Google Business/Maps (Places API).
// STUB: bez GOOGLE_PLACES_API_KEY zwraca realistyczny mock — w UI zawsze
// z ręczną korektą przed zapisem. Podmiana na realne przy deployu (Claude).
export async function getGoogleHours(
  placeId: string
): Promise<IntegrationResult<BusinessHours>> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  const mock: BusinessHours = {
    dni: {
      pon: ['9:00', '18:00'],
      wt: ['9:00', '18:00'],
      sr: ['9:00', '18:00'],
      czw: ['9:00', '19:00'],
      pt: ['9:00', '18:00'],
      sob: ['9:00', '14:00'],
      nd: null,
    },
    wyjatki: [
      { data: '2026-08-15', opis: 'Wniebowzięcie NMP (święto)' },
      { data: '2026-11-11', opis: 'Święto Niepodległości' },
    ],
  };

  if (!apiKey || !placeId) {
    return { source: 'mock', data: mock };
  }

  try {
    // Places API (New): GET /v1/places/{place_id}?fields=regularOpeningHours
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?fields=regularOpeningHours&key=${apiKey}`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) throw new Error(`Places API: HTTP ${res.status}`);
    const json = await res.json();

    // Mapowanie periods → nasz format (Google: day 0=niedziela)
    const dayMap = ['nd', 'pon', 'wt', 'sr', 'czw', 'pt', 'sob'] as const;
    const dni: BusinessHours['dni'] = {
      pon: null, wt: null, sr: null, czw: null, pt: null, sob: null, nd: null,
    };
    for (const period of json.regularOpeningHours?.periods ?? []) {
      const key = dayMap[period.open?.day];
      if (!key || !period.open || !period.close) continue;
      dni[key] = [
        `${period.open.hour}:${String(period.open.minute ?? 0).padStart(2, '0')}`,
        `${period.close.hour}:${String(period.close.minute ?? 0).padStart(2, '0')}`,
      ];
    }
    return { source: 'live', data: { dni, wyjatki: [] } };
  } catch {
    return { source: 'mock', data: mock };
  }
}

export interface GoogleHoursLookup extends IntegrationResult<BusinessHours | null> {
  placeName?: string; // dopasowana nazwa firmy z Google (do weryfikacji przez CEO)
  placeAddress?: string;
}

// Zaczyt godzin po nazwie+adresie (przy tworzeniu prospekta nie znamy placeId).
// Text Search (New) → placeId + godziny w jednym zapytaniu.
// Bez GOOGLE_PLACES_API_KEY zwraca mock (source 'mock') — CEO i tak koryguje ręcznie.
export async function getGoogleHoursByQuery(query: string): Promise<GoogleHoursLookup> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const q = query.trim();

  if (!apiKey || q.length < 3) {
    const base = await getGoogleHours('');
    return { ...base, source: 'mock', placeName: q || undefined };
  }

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.formattedAddress,places.regularOpeningHours',
      },
      body: JSON.stringify({ textQuery: q, languageCode: 'pl', regionCode: 'PL', maxResultCount: 1 }),
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`Places searchText: HTTP ${res.status}`);
    const json = await res.json();
    const place = json.places?.[0];
    if (!place) return { source: 'live', data: null, placeName: undefined };

    const dayMap = ['nd', 'pon', 'wt', 'sr', 'czw', 'pt', 'sob'] as const;
    const dni: BusinessHours['dni'] = {
      pon: null, wt: null, sr: null, czw: null, pt: null, sob: null, nd: null,
    };
    for (const period of place.regularOpeningHours?.periods ?? []) {
      const key = dayMap[period.open?.day];
      if (!key || !period.open || !period.close) continue;
      dni[key] = [
        `${period.open.hour}:${String(period.open.minute ?? 0).padStart(2, '0')}`,
        `${period.close.hour}:${String(period.close.minute ?? 0).padStart(2, '0')}`,
      ];
    }
    const hasHours = Object.values(dni).some((d) => d !== null);
    return {
      source: 'live',
      data: hasHours ? { dni, wyjatki: [] } : null,
      placeName: place.displayName?.text,
      placeAddress: place.formattedAddress,
    };
  } catch {
    const base = await getGoogleHours('');
    return { ...base, source: 'mock', placeName: q };
  }
}
