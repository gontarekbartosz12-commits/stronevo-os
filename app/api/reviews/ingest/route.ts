import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/demo-store';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';

// POST /api/reviews/ingest — monitoring opinii (Faza 3).
// Woła to workflow n8n (GBP API / scraper opinii) po wykryciu nowej opinii.
// Dedupe po (zrodlo, external_id). Nowa opinia → notyfikacja (niska ocena = warn).
// Autoryzacja: x-ingest-key = MARKETING_API_KEY (fallback EVENTS_INGEST_KEY).
// Body: { contact_id, zrodlo: google|fb, autor?, ocena?, tresc?, external_id? }

export async function POST(request: NextRequest) {
  const key = process.env.MARKETING_API_KEY || process.env.EVENTS_INGEST_KEY;
  if (key && request.headers.get('x-ingest-key') !== key) {
    return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 });
  }

  let body: {
    contact_id?: string;
    zrodlo?: string;
    autor?: string;
    ocena?: number;
    tresc?: string;
    external_id?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body musi być JSON-em' }, { status: 400 });
  }

  const zrodlo: 'google' | 'fb' | null =
    body.zrodlo === 'fb' ? 'fb' : body.zrodlo === 'google' ? 'google' : null;
  if (!body.contact_id || !zrodlo) {
    return NextResponse.json({ error: 'Podaj contact_id i zrodlo (google|fb)' }, { status: 400 });
  }
  const ocena =
    Number.isInteger(body.ocena) && body.ocena! >= 1 && body.ocena! <= 5 ? body.ocena! : null;

  try {
    const demo = !isSupabaseConfigured();
    if (!demo && !isAdminConfigured()) {
      return NextResponse.json({ error: 'Brak service role' }, { status: 503 });
    }

    // dedupe po external_id
    if (body.external_id) {
      const existing = demo
        ? demoStore.findReviewByExternal(zrodlo, body.external_id)
        : (
            await createAdminClient()
              .from('reviews')
              .select('id')
              .eq('zrodlo', zrodlo)
              .eq('external_id', body.external_id)
              .maybeSingle()
          ).data;
      if (existing) {
        return NextResponse.json({ ok: true, review_id: existing.id, duplikat: true });
      }
    }

    const row = {
      contact_id: body.contact_id,
      zrodlo,
      autor: body.autor?.slice(0, 120) ?? null,
      ocena,
      tresc: body.tresc?.slice(0, 2000) ?? null,
      odpowiedz: null,
      status: 'nowa' as const,
      external_id: body.external_id ?? null,
    };

    let reviewId: string;
    let firma = 'klient';
    if (demo) {
      reviewId = demoStore.createReview(row).id;
      const c = demoStore.getContact(body.contact_id);
      firma = c?.firma ?? c?.imie ?? firma;
    } else {
      const supabase = createAdminClient();
      const { data, error } = await supabase.from('reviews').insert(row).select('id').single();
      if (error) throw new Error(error.message);
      reviewId = data.id;
      const { data: c } = await supabase
        .from('contacts')
        .select('firma, imie')
        .eq('id', body.contact_id)
        .maybeSingle();
      firma = c?.firma ?? c?.imie ?? firma;
    }

    const niska = ocena !== null && ocena <= 3;
    const notif = {
      typ: 'biznes' as const,
      severity: niska ? ('warn' as const) : ('info' as const),
      tytul: `Nowa opinia ${zrodlo === 'google' ? 'Google' : 'Facebook'} (${firma}): ${ocena ?? '?'}★`,
      opis: `${row.autor ?? 'Anonim'}: "${(row.tresc ?? '').slice(0, 160)}" — odpowiedz w Marketing → Opinie (AI podpowie szkic).`,
      related_typ: 'review',
      related_id: reviewId,
      status: 'nowe' as const,
      akcje: [],
    };
    if (demo) {
      demoStore.createNotification(notif);
    } else {
      await createAdminClient().from('notifications').insert(notif);
    }

    return NextResponse.json({ ok: true, review_id: reviewId, duplikat: false });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Błąd zapisu opinii' },
      { status: 500 }
    );
  }
}
