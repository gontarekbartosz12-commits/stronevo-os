import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/demo-store';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';
import { AutomationEvent, Contact } from '@/lib/types';
import {
  computeKpi,
  lastDaysRange,
  metodaOpis,
  monthRange,
  roiSentence,
  stawkaPlnH,
} from '@/lib/wyniki';

// GET /api/wyniki/summary?contact_id=...&days=30 | &okres=YYYY-MM
// Twarde KPI/ROI policzone po stronie serwera — używane przez:
//  - skrypt weryfikacyjny (scripts/verify-panel-wynikow.mjs): ingest → summary
//    → asercje, że liczby rosną dokładnie o to, co wstrzelono,
//  - n8n (np. raport tygodniowy na Telegram).
// Autoryzacja: x-ingest-key = ENV EVENTS_INGEST_KEY (jak ingest); bez ENV — otwarte (dev/demo).

export async function GET(request: NextRequest) {
  const key = process.env.EVENTS_INGEST_KEY;
  if (key && request.headers.get('x-ingest-key') !== key) {
    return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const contactId = params.get('contact_id');
  if (!contactId) {
    return NextResponse.json({ error: 'Podaj contact_id' }, { status: 400 });
  }

  // Zakres: okres=YYYY-MM (pełny miesiąc) albo days=N (domyślnie 30)
  let from: Date;
  let to: Date;
  const okres = params.get('okres');
  if (okres && /^\d{4}-\d{2}$/.test(okres)) {
    const [y, m] = okres.split('-').map(Number);
    ({ from, to } = monthRange(new Date(y, m - 1, 1)));
  } else {
    const days = Math.max(1, Math.min(365, Number(params.get('days')) || 30));
    ({ from, to } = lastDaysRange(days));
  }

  try {
    let contact: Contact | null;
    let events: AutomationEvent[];

    if (!isSupabaseConfigured()) {
      contact = demoStore.getContact(contactId);
      events = demoStore.listAutomationEvents({ contactId, from, to });
    } else {
      if (!isAdminConfigured()) {
        return NextResponse.json(
          { error: 'Brak SUPABASE_SERVICE_ROLE_KEY — summary wymaga service role' },
          { status: 503 }
        );
      }
      const supabase = createAdminClient();
      const [c, ev] = await Promise.all([
        supabase.from('contacts').select('*').eq('id', contactId).maybeSingle(),
        supabase
          .from('automation_events')
          .select('*')
          .eq('contact_id', contactId)
          .gte('created_at', from.toISOString())
          .lt('created_at', to.toISOString()),
      ]);
      contact = c.data as Contact | null;
      events = (ev.data ?? []) as AutomationEvent[];
    }

    if (!contact) {
      return NextResponse.json({ error: 'Nie znaleziono klienta' }, { status: 404 });
    }

    const kpi = computeKpi(events);
    const stawka = stawkaPlnH(contact);
    return NextResponse.json({
      ok: true,
      contact_id: contact.id,
      firma: contact.firma ?? contact.imie,
      od: from.toISOString(),
      do: to.toISOString(),
      kpi,
      roi_zdanie: roiSentence(kpi, 'W tym okresie'),
      stawka_pln_h: stawka,
      metoda: metodaOpis(stawka),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Błąd agregacji' },
      { status: 500 }
    );
  }
}
