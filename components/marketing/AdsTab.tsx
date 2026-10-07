'use client';

import { useState } from 'react';
import {
  createAdCampaignAction,
  setAdCampaignStatus,
} from '@/app/actions/produktyzacja';
import {
  AUDIENCE_SEGMENT_META,
  AUDIENCE_SEGMENTS,
  AdCampaign,
  AdChannel,
  AudienceSegment,
  Contact,
} from '@/lib/types';

// AD MANAGER (Faza 5, opcjonalny — operator): kampanie Meta/Google spięte
// z segmentami /audiencje. Uruchomienie/raport przez router n8n (Ads API);
// bez ENV metryki dosypuje symulacja crona /api/ads/sync (jawnie oznaczona).

export default function AdsTab({
  campaigns,
  klienci,
  onMessage,
}: {
  campaigns: AdCampaign[];
  klienci: Contact[];
  onMessage: (m: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({
    ownerId: '',
    kanal: 'meta' as AdChannel,
    nazwa: '',
    budzet: '',
    segment: '' as '' | AudienceSegment,
  });

  async function run(key: string, fn: () => Promise<string>) {
    setBusy(key);
    try {
      onMessage(await fn());
    } catch (e) {
      onMessage(e instanceof Error ? e.message : 'Błąd');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-2.5 p-4">
        <h3 className="font-serif text-lg font-bold text-stone-200">Nowa kampania (operator)</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
          <select className="input" value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}>
            <option value="">Firma: STRONEVO</option>
            {klienci.map((k) => (<option key={k.id} value={k.id}>{k.firma ?? k.imie}</option>))}
          </select>
          <select className="input" value={form.kanal} onChange={(e) => setForm({ ...form, kanal: e.target.value as AdChannel })}>
            <option value="meta">Meta (FB/IG)</option>
            <option value="google">Google Ads</option>
          </select>
          <input className="input" placeholder="Nazwa kampanii" value={form.nazwa} onChange={(e) => setForm({ ...form, nazwa: e.target.value })} />
          <input className="input" placeholder="Budżet dzienny (zł)" value={form.budzet} onChange={(e) => setForm({ ...form, budzet: e.target.value })} />
          <select className="input" value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value as '' | AudienceSegment })}>
            <option value="">bez segmentu</option>
            {AUDIENCE_SEGMENTS.map((s) => (
              <option key={s} value={s}>Audiencja: {AUDIENCE_SEGMENT_META[s].label}</option>
            ))}
          </select>
        </div>
        <button
          disabled={busy === 'create' || !form.nazwa || !form.budzet}
          onClick={() =>
            run('create', async () => {
              await createAdCampaignAction({
                owner_contact_id: form.ownerId || null,
                kanal: form.kanal,
                nazwa: form.nazwa,
                budzet_dzienny: Number(form.budzet.replace(',', '.')) || 0,
                segment: form.segment || null,
              });
              setForm({ ...form, nazwa: '', budzet: '' });
              return 'Kampania zapisana (szkic) — uruchom, gdy gotowa (odśwież stronę).';
            })
          }
          className="btn-primary !py-1.5 text-xs"
        >
          {busy === 'create' ? 'Tworzenie...' : 'Utwórz kampanię'}
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-border text-left text-[11px] uppercase tracking-wider text-stone-500">
              <th className="px-4 py-2.5">Kampania</th>
              <th className="px-4 py-2.5">Kanał</th>
              <th className="px-4 py-2.5 text-right">Budżet/dz.</th>
              <th className="px-4 py-2.5 text-right">Wydano</th>
              <th className="px-4 py-2.5 text-right">Kliknięcia</th>
              <th className="px-4 py-2.5 text-right">Leady</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id} className="border-b border-ink-border/50">
                <td className="px-4 py-2.5">
                  <p className="text-stone-200">{c.nazwa}</p>
                  <p className="text-xs text-stone-500">
                    {c.segment ? `audiencja: ${AUDIENCE_SEGMENT_META[c.segment].label}` : '—'}
                  </p>
                </td>
                <td className="px-4 py-2.5 text-xs text-stone-400">{c.kanal === 'meta' ? 'Meta' : 'Google'}</td>
                <td className="px-4 py-2.5 text-right text-stone-300">{Number(c.budzet_dzienny).toFixed(0)} zł</td>
                <td className="px-4 py-2.5 text-right font-serif font-bold text-gold">
                  {Number(c.metryki?.wydano ?? 0).toFixed(2)} zł
                </td>
                <td className="px-4 py-2.5 text-right text-stone-300">{c.metryki?.klikniecia ?? 0}</td>
                <td className="px-4 py-2.5 text-right text-stone-300">{c.metryki?.leady ?? 0}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase ${c.status === 'aktywna' ? 'bg-emerald-900/40 text-emerald-300' : c.status === 'wstrzymana' ? 'bg-bordo/25 text-bordo-glow' : 'bg-stone-700/40 text-stone-400'}`}>
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    disabled={busy === c.id}
                    onClick={() =>
                      run(c.id, () =>
                        setAdCampaignStatus(c.id, c.status === 'aktywna' ? 'wstrzymana' : 'aktywna')
                      )
                    }
                    className="rounded border border-ink-border px-2 py-1 text-[11px] text-stone-400 hover:text-stone-200"
                  >
                    {c.status === 'aktywna' ? 'Wstrzymaj' : 'Uruchom'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-stone-600">
        Metryki synchronizuje cron /api/ads/sync (n8n → Meta/Google Ads API; bez kluczy = jawna
        symulacja). Segmenty audiencji eksportujesz w /audiencje.
      </p>
    </div>
  );
}
