'use client';

import { useState } from 'react';
import { publishSocialNow, saveSocialPost } from '@/app/actions/marketing';
import {
  Contact,
  SOCIAL_CHANNELS,
  SOCIAL_CHANNEL_LABELS,
  SocialChannel,
  SocialPost,
  SocialPostStatus,
} from '@/lib/types';

// Social planner — kalendarz treści (planowanie = funkcja użytkowa, także dla
// klienta w /klient; publikacja przez router n8n = operator/cron).

const STATUS_BADGE: Record<SocialPostStatus, string> = {
  szkic: 'bg-stone-700/40 text-stone-400',
  zaplanowany: 'bg-gold/15 text-gold-light',
  opublikowany: 'bg-emerald-900/40 text-emerald-300',
  blad: 'bg-bordo/25 text-bordo-glow',
};

export default function SocialTab({
  posts,
  klienci,
  scopeContactId, // ustawione = wariant klienta (bez wyboru firmy, bez „Opublikuj teraz")
  publishWired = false, // czy kanały social są realnie podłączone (router n8n)
  onMessage,
}: {
  posts: SocialPost[];
  klienci: Contact[];
  scopeContactId?: string;
  publishWired?: boolean;
  onMessage: (m: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({
    contactId: scopeContactId ?? '',
    tresc: '',
    kanaly: ['fb'] as SocialChannel[],
    zaplanowano: '',
  });

  const operator = scopeContactId === undefined;

  async function handleSave() {
    setBusy('save');
    try {
      await saveSocialPost({
        contact_id: form.contactId || null,
        kanaly: form.kanaly,
        tresc: form.tresc,
        zaplanowano: form.zaplanowano ? new Date(form.zaplanowano).toISOString() : null,
      });
      onMessage(
        form.zaplanowano
          ? publishWired
            ? 'Post zaplanowany — opublikuje się automatycznie o wskazanej godzinie.'
            : 'Post zaplanowany — publikacja ruszy, gdy kanały social (FB/IG/GBP) zostaną podłączone.'
          : 'Szkic posta zapisany.'
      );
      setForm({ ...form, tresc: '', zaplanowano: '' });
    } catch (e) {
      onMessage(e instanceof Error ? e.message : 'Błąd zapisu');
    } finally {
      setBusy(null);
    }
  }

  async function handlePublish(id: string) {
    setBusy(id);
    try {
      const r = await publishSocialNow(id);
      onMessage(
        r[0]?.status === 'opublikowany'
          ? 'Post opublikowany.'
          : r[0]?.reason ?? 'Publikacja nieudana — sprawdź status posta.'
      );
    } catch (e) {
      onMessage(e instanceof Error ? e.message : 'Błąd publikacji');
    } finally {
      setBusy(null);
    }
  }

  // Kalendarz treści: grupowanie po dniu
  const byDay = new Map<string, SocialPost[]>();
  for (const p of posts) {
    const key = (p.zaplanowano ?? p.created_at).slice(0, 10);
    byDay.set(key, [...(byDay.get(key) ?? []), p]);
  }
  const days = [...byDay.keys()].sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-4">
      {!publishWired && (
        <div className="rounded-md border border-gold-dim/40 bg-gold/10 px-4 py-3 text-sm text-gold-light">
          Kanały social (FB/IG/GBP/LinkedIn) nie są jeszcze podłączone. Możesz planować i zapisywać
          posty — publikacja ruszy automatycznie, gdy opiekun STRONEVO wepnie kanały.
        </div>
      )}

      {/* Nowy post */}
      <div className="card space-y-2.5 p-4">
        <h3 className="font-serif text-lg font-bold text-stone-200">Zaplanuj post</h3>
        <textarea
          className="input"
          rows={3}
          placeholder="Treść posta..."
          value={form.tresc}
          onChange={(e) => setForm({ ...form, tresc: e.target.value })}
        />
        <div className="flex flex-wrap items-center gap-3">
          {SOCIAL_CHANNELS.map((k) => (
            <label key={k} className="flex cursor-pointer items-center gap-1.5 text-xs text-stone-300">
              <input
                type="checkbox"
                checked={form.kanaly.includes(k)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    kanaly: e.target.checked
                      ? [...form.kanaly, k]
                      : form.kanaly.filter((x) => x !== k),
                  })
                }
                className="accent-[#7B2D3B]"
              />
              {SOCIAL_CHANNEL_LABELS[k]}
            </label>
          ))}
          <input
            type="datetime-local"
            className="input !w-auto !py-1.5 text-xs"
            value={form.zaplanowano}
            onChange={(e) => setForm({ ...form, zaplanowano: e.target.value })}
          />
          {operator && (
            <select
              className="input !w-auto !py-1.5 text-xs"
              value={form.contactId}
              onChange={(e) => setForm({ ...form, contactId: e.target.value })}
            >
              <option value="">Firma: STRONEVO</option>
              {klienci.map((k) => (
                <option key={k.id} value={k.id}>{k.firma ?? k.imie}</option>
              ))}
            </select>
          )}
          <button
            disabled={busy === 'save' || !form.tresc.trim()}
            onClick={handleSave}
            className="btn-primary !py-1.5 text-xs"
          >
            {busy === 'save' ? 'Zapisywanie...' : form.zaplanowano ? 'Zaplanuj' : 'Zapisz szkic'}
          </button>
        </div>
      </div>

      {/* Kalendarz treści */}
      {days.map((day) => (
        <div key={day}>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-stone-500">
            {new Date(day).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <div className="space-y-2">
            {(byDay.get(day) ?? []).map((p) => (
              <div key={p.id} className="card flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-stone-200">{p.tresc}</p>
                  <p className="text-[11px] text-stone-500">
                    {p.kanaly.map((k) => SOCIAL_CHANNEL_LABELS[k]).join(' · ')}
                    {p.zaplanowano && ` · ${new Date(p.zaplanowano).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`}
                  </p>
                  {p.status === 'blad' && (
                    <p className="mt-0.5 text-[11px] text-bordo-glow">
                      {Object.values(p.wynik ?? {}).some((v) => String(v).includes('niewpięty'))
                        ? 'Nie opublikowano — kanał niewpięty (publikacja po podłączeniu FB/IG/GBP).'
                        : 'Publikacja nieudana — spróbuj ponownie.'}
                    </p>
                  )}
                </div>
                <span className="flex items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase ${STATUS_BADGE[p.status]}`}>
                    {p.status}
                  </span>
                  {operator && p.status !== 'opublikowany' && (
                    <button
                      disabled={busy === p.id}
                      onClick={() => handlePublish(p.id)}
                      className="rounded border border-gold-dim/40 px-2 py-1 text-[11px] text-gold-light hover:bg-gold/10 disabled:opacity-50"
                    >
                      {busy === p.id ? 'Publikuję...' : 'Opublikuj teraz'}
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
