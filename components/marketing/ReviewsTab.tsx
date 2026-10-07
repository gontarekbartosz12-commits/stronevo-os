'use client';

import { useState } from 'react';
import {
  aiReviewDraft,
  saveReviewReply,
  sendReviewRequest,
} from '@/app/actions/marketing';
import { Contact, Review, ReviewRequest } from '@/lib/types';

// Reputacja: prośby o opinię po usłudze (SMS/e-mail) + monitoring opinii
// z odpowiedziami (AI-szkic = narzędzie OPERATORA; klient odpowiada ręcznie).

export default function ReviewsTab({
  reviews,
  requests,
  klienci,
  scopeContactId, // ustawione = wariant klienta
  onMessage,
}: {
  reviews: Review[];
  requests: ReviewRequest[];
  klienci: Contact[];
  scopeContactId?: string;
  onMessage: (m: string) => void;
}) {
  const operator = scopeContactId === undefined;
  const [busy, setBusy] = useState<string | null>(null);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [req, setReq] = useState({
    contactId: scopeContactId ?? '',
    imie: '',
    telefon: '',
    email: '',
    kanal: 'sms' as 'sms' | 'email',
    link: '',
  });

  async function handleRequest() {
    setBusy('req');
    try {
      onMessage(
        await sendReviewRequest({
          contact_id: req.contactId || null,
          imie: req.imie,
          telefon: req.telefon || undefined,
          email: req.email || undefined,
          kanal: req.kanal,
          review_link: req.link,
        })
      );
      setReq({ ...req, imie: '', telefon: '', email: '' });
    } catch (e) {
      onMessage(e instanceof Error ? e.message : 'Błąd wysyłki');
    } finally {
      setBusy(null);
    }
  }

  async function handleAiDraft(id: string) {
    setBusy(`ai-${id}`);
    try {
      const draft = await aiReviewDraft(id);
      setReplies((r) => ({ ...r, [id]: draft }));
      onMessage('Szkic AI gotowy — sprawdź i opublikuj.');
    } catch (e) {
      onMessage(e instanceof Error ? e.message : 'Błąd szkicu');
    } finally {
      setBusy(null);
    }
  }

  async function handleReply(id: string) {
    setBusy(`save-${id}`);
    try {
      onMessage(await saveReviewReply(id, replies[id] ?? ''));
      setReplies((r) => ({ ...r, [id]: '' }));
    } catch (e) {
      onMessage(e instanceof Error ? e.message : 'Błąd zapisu');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Prośba o opinię */}
      <div className="card space-y-2.5 p-4">
        <h3 className="font-serif text-lg font-bold text-stone-200">
          Poproś o opinię po usłudze
        </h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input className="input" placeholder="Imię klienta" value={req.imie} onChange={(e) => setReq({ ...req, imie: e.target.value })} />
          {req.kanal === 'sms' ? (
            <input className="input" placeholder="Telefon" value={req.telefon} onChange={(e) => setReq({ ...req, telefon: e.target.value })} />
          ) : (
            <input className="input" placeholder="E-mail" value={req.email} onChange={(e) => setReq({ ...req, email: e.target.value })} />
          )}
          <input className="input" placeholder="Link do opinii (np. g.page/...)" value={req.link} onChange={(e) => setReq({ ...req, link: e.target.value })} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input !w-auto !py-1.5 text-xs" value={req.kanal} onChange={(e) => setReq({ ...req, kanal: e.target.value as 'sms' | 'email' })}>
            <option value="sms">SMS</option>
            <option value="email">E-mail</option>
          </select>
          {operator && (
            <select className="input !w-auto !py-1.5 text-xs" value={req.contactId} onChange={(e) => setReq({ ...req, contactId: e.target.value })}>
              <option value="">Firma: STRONEVO</option>
              {klienci.map((k) => (
                <option key={k.id} value={k.id}>{k.firma ?? k.imie}</option>
              ))}
            </select>
          )}
          <button disabled={busy === 'req' || !req.imie || !req.link} onClick={handleRequest} className="btn-primary !py-1.5 text-xs">
            {busy === 'req' ? 'Wysyłanie...' : 'Wyślij prośbę'}
          </button>
          <span className="text-[11px] text-stone-600">wysłanych próśb: {requests.length}</span>
        </div>
      </div>

      {/* Opinie */}
      <div className="space-y-3">
        {reviews.map((r) => (
          <div key={r.id} className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-stone-200">
                <span className="text-gold">{'★'.repeat(r.ocena ?? 0)}{'☆'.repeat(5 - (r.ocena ?? 0))}</span>
                <span className="ml-2">{r.autor ?? 'Anonim'}</span>
                <span className="ml-2 text-xs text-stone-500">
                  {r.zrodlo === 'google' ? 'Google' : 'Facebook'} · {new Date(r.created_at).toLocaleDateString('pl-PL')}
                </span>
              </p>
              <span className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase ${r.status === 'odpowiedziano' ? 'bg-emerald-900/40 text-emerald-300' : r.status === 'szkic' ? 'bg-gold/15 text-gold-light' : 'bg-bordo/25 text-bordo-glow'}`}>
                {r.status === 'odpowiedziano' ? 'odpowiedziano' : r.status === 'szkic' ? 'szkic gotowy' : 'czeka na odpowiedź'}
              </span>
            </div>
            <p className="mt-1.5 text-sm italic text-stone-400">„{r.tresc}"</p>

            {r.status === 'odpowiedziano' && r.odpowiedz ? (
              <p className="mt-2 rounded-md border border-ink-border bg-ink-soft/60 px-3 py-2 text-xs text-stone-300">
                <span className="font-semibold text-stone-500">Odpowiedź: </span>
                {r.odpowiedz}
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                <textarea
                  className="input"
                  rows={2}
                  placeholder="Twoja odpowiedź na opinię..."
                  value={replies[r.id] ?? r.odpowiedz ?? ''}
                  onChange={(e) => setReplies((x) => ({ ...x, [r.id]: e.target.value }))}
                />
                <div className="flex gap-2">
                  {operator && (
                    <button
                      disabled={busy === `ai-${r.id}`}
                      onClick={() => handleAiDraft(r.id)}
                      className="rounded border border-gold-dim/40 px-2.5 py-1 text-[11px] text-gold-light hover:bg-gold/10 disabled:opacity-50"
                    >
                      {busy === `ai-${r.id}` ? 'Piszę...' : '🤖 Szkic AI'}
                    </button>
                  )}
                  <button
                    disabled={busy === `save-${r.id}` || !(replies[r.id] ?? r.odpowiedz ?? '').trim()}
                    onClick={() => handleReply(r.id)}
                    className="btn-primary !py-1 text-[11px]"
                  >
                    {busy === `save-${r.id}` ? 'Publikuję...' : 'Opublikuj odpowiedź'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
