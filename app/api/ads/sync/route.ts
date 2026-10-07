import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/demo-store';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';
import { AdCampaign } from '@/lib/types';

// POST /api/ads/sync — Ad Manager (Faza 5, opcjonalny): synchronizacja metryk
// aktywnych kampanii przez router n8n (ADS_SYNC_WEBHOOK_URL → Meta/Google Ads
// API; kredencjały reklamowe trzyma OPERATOR w n8n). Bez ENV = deterministyczna
// symulacja przyrostu metryk (demo pokazuje żywy raport).
// Autoryzacja: Bearer <MARKETING_API_TOKEN | NOTIFY_API_TOKEN>.

export async function POST(request: NextRequest) {
  const token = process.env.MARKETING_API_TOKEN || process.env.NOTIFY_API_TOKEN;
  if (token) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${token}`) {
      return NextResponse.json({ error: 'Brak autoryzacji' }, { status: 401 });
    }
  }

  try {
    const demo = !isSupabaseConfigured();
    if (!demo && !isAdminConfigured()) {
      return NextResponse.json({ error: 'Brak service role' }, { status: 503 });
    }

    let campaigns: AdCampaign[];
    if (demo) {
      campaigns = demoStore.listAdCampaigns().filter((c) => c.status === 'aktywna');
    } else {
      const { data } = await createAdminClient().from('ad_campaigns').select('*').eq('status', 'aktywna');
      campaigns = (data ?? []) as AdCampaign[];
    }

    const webhook = process.env.ADS_SYNC_WEBHOOK_URL;
    const results: { campaign_id: string; nazwa: string; via: string; metryki: Record<string, unknown> }[] = [];

    for (const c of campaigns) {
      let metryki = c.metryki ?? {};
      let via = 'mock';
      if (webhook) {
        try {
          const res = await fetch(webhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ campaign_id: c.id, kanal: c.kanal, external_id: c.external_id }),
          });
          const json = await res.json().catch(() => ({}));
          if (res.ok && json.metryki) {
            metryki = json.metryki;
            via = 'n8n router';
          }
        } catch {
          via = 'n8n router (nieosiągalny — bez zmian)';
        }
      } else {
        // symulacja demo: deterministyczny dzienny przyrost wg budżetu
        const wydano = Math.round(((Number(metryki.wydano) || 0) + Number(c.budzet_dzienny)) * 100) / 100;
        const wysw = (Number(metryki.wyswietlenia) || 0) + Math.round(Number(c.budzet_dzienny) * 55);
        const klik = (Number(metryki.klikniecia) || 0) + Math.round(Number(c.budzet_dzienny) * 1.1);
        const leady = (Number(metryki.leady) || 0) + (wysw % 3 === 0 ? 1 : 0);
        metryki = { wydano, wyswietlenia: wysw, klikniecia: klik, leady };
        via = 'symulacja (brak ADS_SYNC_WEBHOOK_URL)';
      }

      if (demo) {
        demoStore.updateAdCampaign(c.id, { metryki });
      } else {
        await createAdminClient().from('ad_campaigns').update({ metryki }).eq('id', c.id);
      }
      results.push({ campaign_id: c.id, nazwa: c.nazwa, via, metryki });
    }

    return NextResponse.json({ ok: true, zsynchronizowane: results.length, results });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Błąd synchronizacji' },
      { status: 500 }
    );
  }
}
