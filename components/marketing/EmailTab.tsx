'use client';

import { useState } from 'react';
import {
  CampaignWithStats,
  saveCampaign,
  sendCampaignAction,
} from '@/app/actions/marketing';
import { EMAIL_BLOCK_TYPES } from '@/lib/marketing';
import { BLOCK_TYPE_LABELS, BlockType, EmailList } from '@/lib/types';

// E-mail marketing (operator): kampanie z bloków (hero/text/cta/image) →
// wysyłka Brevo + tracking open/click + RODO (zgoda, 1-klik wypis w stopce).

export default function EmailTab({
  campaigns,
  lists,
  onMessage,
}: {
  campaigns: CampaignWithStats[];
  lists: EmailList[];
  onMessage: (m: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const editing = editingId === 'new' ? null : campaigns.find((c) => c.id === editingId);

  const [form, setForm] = useState<{
    temat: string;
    list_id: string;
    bloki: { typ: BlockType; props: Record<string, string> }[];
  }>({ temat: '', list_id: lists[0]?.id ?? '', bloki: [] });

  function startEdit(id: string | 'new') {
    setEditingId(id);
    const c = id === 'new' ? null : campaigns.find((x) => x.id === id);
    setForm({
      temat: c?.temat ?? '',
      list_id: c?.list_id ?? lists[0]?.id ?? '',
      bloki: (c?.bloki ?? [
        { typ: 'hero', props: { naglowek: '', podtytul: '' } },
        { typ: 'cta', props: { naglowek: '', cta_label: '', cta_url: '' } },
      ]) as { typ: BlockType; props: Record<string, string> }[],
    });
  }

  async function handleSave() {
    setBusy('save');
    try {
      await saveCampaign({
        id: editingId === 'new' ? undefined : editingId!,
        contact_id: editing?.contact_id ?? campaigns[0]?.contact_id ?? null,
        list_id: form.list_id || null,
        temat: form.temat,
        bloki: form.bloki,
      });
      onMessage('Kampania zapisana (szkic). Odśwież, by zobaczyć zmiany na liście.');
      setEditingId(null);
    } catch (e) {
      onMessage(e instanceof Error ? e.message : 'Błąd zapisu');
    } finally {
      setBusy(null);
    }
  }

  async function handleSend(id: string) {
    setBusy(id);
    try {
      const r = await sendCampaignAction(id);
      onMessage(
        `Wysłano do ${r.odbiorcy} odbiorców (pominięto RODO/wypisy: ${r.pominiete_rodo}). Tracking otwarć/kliknięć aktywny.`
      );
    } catch (e) {
      onMessage(e instanceof Error ? e.message : 'Błąd wysyłki');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-stone-500">
          Wysyłka: Brevo/SMTP · każdy mail ma zgodę RODO i 1-klik wypis w stopce
        </p>
        <button onClick={() => startEdit('new')} className="btn-ghost !py-1.5 text-xs">
          + Nowa kampania
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-border text-left text-[11px] uppercase tracking-wider text-stone-500">
              <th className="px-4 py-2.5">Kampania</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Wysłane</th>
              <th className="px-4 py-2.5">Otwarcia</th>
              <th className="px-4 py-2.5">Kliknięcia</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id} className="border-b border-ink-border/50">
                <td className="px-4 py-2.5">
                  <p className="font-medium text-stone-200">{c.temat}</p>
                  <p className="text-xs text-stone-500">{c.ownerName}</p>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase ${c.status === 'wyslana' ? 'bg-emerald-900/40 text-emerald-300' : 'bg-gold/15 text-gold-light'}`}>
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-stone-300">{c.wyslane}</td>
                <td className="px-4 py-2.5 text-stone-300">
                  {c.otwarcia}
                  {c.wyslane > 0 && <span className="text-xs text-stone-600"> ({Math.round((c.otwarcia / c.wyslane) * 100)}%)</span>}
                </td>
                <td className="px-4 py-2.5 text-stone-300">{c.klikniecia}</td>
                <td className="px-4 py-2.5 text-right">
                  {c.status !== 'wyslana' && (
                    <span className="flex justify-end gap-1.5">
                      <button onClick={() => startEdit(c.id)} className="rounded border border-ink-border px-2 py-1 text-[11px] text-stone-400 hover:text-stone-200">Edytuj</button>
                      <button disabled={busy === c.id} onClick={() => handleSend(c.id)} className="rounded border border-gold-dim/40 px-2 py-1 text-[11px] text-gold-light hover:bg-gold/10 disabled:opacity-50">
                        {busy === c.id ? 'Wysyłanie...' : 'Wyślij teraz'}
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingId && (
        <div className="card space-y-3 p-4">
          <h3 className="font-serif text-lg font-bold text-stone-200">
            {editingId === 'new' ? 'Nowa kampania' : 'Edycja kampanii'}
          </h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input className="input" placeholder="Temat wiadomości" value={form.temat} onChange={(e) => setForm({ ...form, temat: e.target.value })} />
            <select className="input" value={form.list_id} onChange={(e) => setForm({ ...form, list_id: e.target.value })}>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>Lista: {l.nazwa}</option>
              ))}
            </select>
          </div>

          {form.bloki.map((b, i) => (
            <div key={i} className="rounded-md border border-ink-border bg-ink-soft/60 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">{BLOCK_TYPE_LABELS[b.typ]}</span>
                <button
                  onClick={() => setForm({ ...form, bloki: form.bloki.filter((_, j) => j !== i) })}
                  className="text-[11px] text-bordo-glow underline"
                >
                  usuń
                </button>
              </div>
              <div className="space-y-2">
                {['hero', 'text', 'cta'].includes(b.typ) && (
                  <input
                    className="input"
                    placeholder="Nagłówek"
                    value={b.props.naglowek ?? ''}
                    onChange={(e) => updateBlok(i, 'naglowek', e.target.value)}
                  />
                )}
                {b.typ === 'hero' && (
                  <input className="input" placeholder="Podtytuł" value={b.props.podtytul ?? ''} onChange={(e) => updateBlok(i, 'podtytul', e.target.value)} />
                )}
                {b.typ === 'text' && (
                  <textarea className="input" rows={3} placeholder="Treść" value={b.props.tresc ?? ''} onChange={(e) => updateBlok(i, 'tresc', e.target.value)} />
                )}
                {b.typ === 'cta' && (
                  <div className="grid grid-cols-2 gap-2">
                    <input className="input" placeholder="Tekst przycisku" value={b.props.cta_label ?? ''} onChange={(e) => updateBlok(i, 'cta_label', e.target.value)} />
                    <input className="input" placeholder="Link" value={b.props.cta_url ?? ''} onChange={(e) => updateBlok(i, 'cta_url', e.target.value)} />
                  </div>
                )}
                {b.typ === 'image' && (
                  <input className="input" placeholder="URL obrazu" value={b.props.url ?? ''} onChange={(e) => updateBlok(i, 'url', e.target.value)} />
                )}
              </div>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-2">
            <select
              className="input !w-auto !py-1 text-xs"
              value=""
              onChange={(e) => {
                if (e.target.value)
                  setForm({ ...form, bloki: [...form.bloki, { typ: e.target.value as BlockType, props: {} }] });
              }}
            >
              <option value="">+ Dodaj blok...</option>
              {EMAIL_BLOCK_TYPES.map((t) => (
                <option key={t} value={t}>{BLOCK_TYPE_LABELS[t]}</option>
              ))}
            </select>
            <button disabled={busy === 'save' || !form.temat.trim()} onClick={handleSave} className="btn-primary !py-1.5 text-xs">
              {busy === 'save' ? 'Zapisywanie...' : 'Zapisz szkic'}
            </button>
            <button onClick={() => setEditingId(null)} className="btn-ghost !py-1.5 text-xs">Anuluj</button>
          </div>
        </div>
      )}
    </div>
  );

  function updateBlok(i: number, key: string, value: string) {
    setForm((f) => ({
      ...f,
      bloki: f.bloki.map((b, j) => (j === i ? { ...b, props: { ...b.props, [key]: value } } : b)),
    }));
  }
}
