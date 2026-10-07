import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/demo-store';
import { embedText } from '@/lib/rag';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';

// POST /api/knowledge/ingest — zasilanie bazy wiedzy Conversation AI (Faza 2).
// n8n/skrypt deployowy wrzuca dokumenty firmy (cennik, FAQ, oferta — tekst);
// endpoint liczy embedding (EMBEDDINGS_*; bez konfiguracji zapis bez wektora —
// RAG działa wtedy na fallbacku keyword) i zapisuje service role.
//
// Autoryzacja: x-ingest-key = CONVERSATIONS_INGEST_KEY (fallback EVENTS_INGEST_KEY).
// Body: { contact_id (uuid firmy; null = wiedza STRONEVO), tytul, tresc }
//       albo { contact_id, docs: [{tytul, tresc}, ...] } (bulk)

export async function POST(request: NextRequest) {
  const key = process.env.CONVERSATIONS_INGEST_KEY || process.env.EVENTS_INGEST_KEY;
  if (key && request.headers.get('x-ingest-key') !== key) {
    return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 });
  }

  let body: {
    contact_id?: string | null;
    tytul?: string;
    tresc?: string;
    docs?: { tytul?: string; tresc?: string }[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body musi być JSON-em' }, { status: 400 });
  }

  const docs = (body.docs ?? [{ tytul: body.tytul, tresc: body.tresc }])
    .map((d) => ({ tytul: (d.tytul ?? '').trim(), tresc: (d.tresc ?? '').trim() }))
    .filter((d) => d.tytul && d.tresc);
  if (docs.length === 0) {
    return NextResponse.json({ error: 'Podaj tytul + tresc (lub docs[])' }, { status: 400 });
  }

  try {
    const contactId = body.contact_id ?? null;
    const saved: { id: string; tytul: string; embedded: boolean }[] = [];

    for (const doc of docs) {
      const embedding = await embedText(`${doc.tytul}\n${doc.tresc}`);
      if (!isSupabaseConfigured()) {
        const row = demoStore.createKnowledgeDoc({
          contact_id: contactId,
          tytul: doc.tytul,
          tresc: doc.tresc,
          embedding,
        });
        saved.push({ id: row.id, tytul: row.tytul, embedded: embedding !== null });
      } else {
        if (!isAdminConfigured()) {
          return NextResponse.json(
            { error: 'Brak SUPABASE_SERVICE_ROLE_KEY — ingest wymaga service role' },
            { status: 503 }
          );
        }
        const { data, error } = await createAdminClient()
          .from('knowledge_docs')
          .insert({ contact_id: contactId, tytul: doc.tytul, tresc: doc.tresc, embedding })
          .select('id, tytul')
          .single();
        if (error) throw new Error(`Zapis dokumentu: ${error.message}`);
        saved.push({ id: data.id, tytul: data.tytul, embedded: embedding !== null });
      }
    }

    return NextResponse.json({ ok: true, zapisane: saved.length, docs: saved });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Błąd zapisu wiedzy' },
      { status: 500 }
    );
  }
}
