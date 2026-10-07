'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AiDraftResult,
  InboxConversation,
  aiDraft,
  getThread,
  listInboxConversations,
  sendReply,
  setConversationStatus,
  toggleAiAuto,
} from '@/app/actions/conversations';
import { createPaymentLinkAction } from '@/app/actions/commerce';
import {
  CHANNEL_ICONS,
  CHANNEL_LABELS,
  CONVERSATION_STATUS_LABELS,
  ConversationStatus,
  Message,
  MessageTemplate,
} from '@/lib/types';

// INBOX „RozmOWY" (Faza 2 zaufania): jedna skrzynka na wszystkie kanały.
// variant 'ceo' (operator): pełna kontrola + toggle bota + szkic AI.
// variant 'klient' (OPERATOR-FIRST): codzienny ruch (czyta/odpowiada/zamyka),
// bot widoczny jako badge „obsługa STRONEVO" — bez konfiguracji.

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'teraz';
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} godz.`;
  return `${Math.round(h / 24)} dn.`;
}

const STATUS_BADGE: Record<ConversationStatus, string> = {
  otwarta: 'bg-emerald-900/40 text-emerald-300',
  oczekuje: 'bg-gold/15 text-gold-light',
  zamknieta: 'bg-stone-700/40 text-stone-400',
};

export default function Inbox({
  initial,
  templates,
  variant,
  scopeOwner,
  paymentsWired = false,
}: {
  initial: InboxConversation[];
  templates: MessageTemplate[];
  variant: 'ceo' | 'klient';
  scopeOwner?: string; // /klient: id firmy (skrzynka klienta)
  paymentsWired?: boolean; // bramka podłączona; false = brak „Link do zapłaty" (prowadziłby do demo)
}) {
  const [conversations, setConversations] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null);
  const [thread, setThread] = useState<Message[]>([]);
  const [filter, setFilter] = useState<'wszystkie' | ConversationStatus>('wszystkie');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [draftInfo, setDraftInfo] = useState<AiDraftResult | null>(null);
  const [showPay, setShowPay] = useState(false);
  const [pay, setPay] = useState({ kwota: '', opis: '' });
  const threadRef = useRef<HTMLDivElement>(null);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  const loadThread = useCallback(async (id: string) => {
    try {
      setThread(await getThread(id));
      setTimeout(() => {
        threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
      }, 50);
    } catch {
      setThread([]);
    }
  }, []);

  useEffect(() => {
    if (selectedId) void loadThread(selectedId);
    setDraftInfo(null);
  }, [selectedId, loadThread]);

  // Polling listy + otwartego wątku (realtime bez SSE)
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        setConversations(await listInboxConversations(scopeOwner));
        if (selectedId) void loadThread(selectedId);
      } catch {
        // brak sieci — kolejny tick spróbuje ponownie
      }
    }, 20_000);
    return () => clearInterval(t);
  }, [scopeOwner, selectedId, loadThread]);

  const visible = conversations.filter((c) => filter === 'wszystkie' || c.status === filter);

  async function handleSend() {
    if (!selected || !reply.trim()) return;
    setBusy('send');
    setMessage(null);
    try {
      const { delivery } = await sendReply(selected.id, reply);
      setReply('');
      setDraftInfo(null);
      await loadThread(selected.id);
      setConversations(await listInboxConversations(scopeOwner));
      if (!delivery.sent) {
        // Zapisane w wątku, ale NIE dostarczone do klienta — mówimy wprost.
        setMessage(
          `Zapisano w wątku, ale wiadomość NIE trafiła do klienta — kanał „${CHANNEL_LABELS[selected.channel]}" nie jest podłączony (${delivery.via}). Podłączy go opiekun STRONEVO.`
        );
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Błąd wysyłki');
    } finally {
      setBusy(null);
    }
  }

  // Płatność kontekstowa: link do zapłaty prosto z wątku (prefill numeru rozmówcy).
  async function handleSendPay() {
    if (!selected) return;
    const kwota = Number(pay.kwota.replace(',', '.'));
    if (!kwota || kwota <= 0 || !pay.opis.trim()) {
      setMessage('Podaj kwotę i za co (opis).');
      return;
    }
    setBusy('pay');
    setMessage(null);
    try {
      const r = await createPaymentLinkAction({
        contact_id: selected.owner_contact_id ?? null,
        kwota,
        opis: pay.opis.trim(),
        imie: selected.external?.imie ?? undefined,
        telefon: selected.external?.telefon ?? undefined,
        sendSmsNow: Boolean(selected.external?.telefon),
      });
      setMessage(r.message);
      setPay({ kwota: '', opis: '' });
      setShowPay(false);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Nie udało się utworzyć linku płatności');
    } finally {
      setBusy(null);
    }
  }

  async function handleToggleAi() {
    if (!selected) return;
    setBusy('ai');
    try {
      const msg = await toggleAiAuto(selected.id, !selected.ai_auto);
      setMessage(msg);
      setConversations((prev) =>
        prev.map((c) => (c.id === selected.id ? { ...c, ai_auto: !selected.ai_auto } : c))
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Błąd');
    } finally {
      setBusy(null);
    }
  }

  async function handleDraft() {
    if (!selected) return;
    setBusy('draft');
    setMessage(null);
    try {
      const d = await aiDraft(selected.id);
      if (d.draft) setReply(d.draft);
      setDraftInfo(d);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Błąd szkicu AI');
    } finally {
      setBusy(null);
    }
  }

  async function handleStatus(status: ConversationStatus) {
    if (!selected) return;
    setBusy('status');
    try {
      await setConversationStatus(selected.id, status);
      setConversations((prev) =>
        prev.map((c) => (c.id === selected.id ? { ...c, status } : c))
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Błąd');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card grid min-h-[560px] grid-cols-1 overflow-hidden lg:grid-cols-[340px_1fr]">
      {/* ===== LISTA ===== */}
      <div className="flex flex-col border-b border-ink-border lg:border-b-0 lg:border-r">
        <div className="flex gap-1 border-b border-ink-border p-2">
          {(['wszystkie', 'otwarta', 'oczekuje', 'zamknieta'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded px-2.5 py-1 text-[11px] transition ${
                filter === f
                  ? 'bg-bordo/30 font-semibold text-gold-light'
                  : 'text-stone-500 hover:text-stone-300'
              }`}
            >
              {f === 'wszystkie' ? 'Wszystkie' : CONVERSATION_STATUS_LABELS[f]}
            </button>
          ))}
        </div>
        <div className="max-h-[560px] flex-1 overflow-y-auto">
          {visible.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-stone-600">
              Brak rozmów — wpięte kanały (SMS/e-mail/czat WWW) pojawią się tu automatycznie.
            </p>
          )}
          {visible.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`block w-full border-b border-ink-border/50 px-4 py-3 text-left transition hover:bg-ink-hover ${
                selectedId === c.id ? 'bg-bordo/15' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-stone-200">
                  <span title={CHANNEL_LABELS[c.channel]}>{CHANNEL_ICONS[c.channel]}</span>
                  <span className="truncate">{c.external?.imie ?? 'Rozmówca'}</span>
                  {c.unanswered && (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-bordo-glow" title="czeka na odpowiedź" />
                  )}
                </span>
                <span className="shrink-0 text-[10px] text-stone-600">{timeAgo(c.last_msg_at)}</span>
              </div>
              <p className="mt-0.5 truncate text-xs text-stone-500">
                {c.lastAuthor === 'ai' && '🤖 '}
                {c.lastMessage ?? '—'}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium uppercase ${STATUS_BADGE[c.status]}`}>
                  {CONVERSATION_STATUS_LABELS[c.status]}
                </span>
                {variant === 'ceo' && (
                  <span className="text-[10px] text-stone-600">{c.ownerName}</span>
                )}
                {c.ai_auto && (
                  <span className="rounded bg-gold/10 px-1.5 py-0.5 text-[9px] text-gold-dim">AI</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ===== WĄTEK ===== */}
      <div className="flex min-w-0 flex-col">
        {!selected ? (
          <p className="flex flex-1 items-center justify-center text-sm text-stone-600">
            Wybierz rozmowę z listy.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-border px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-stone-100">
                  {CHANNEL_ICONS[selected.channel]} {selected.external?.imie ?? 'Rozmówca'}
                  <span className="ml-2 text-xs font-normal text-stone-500">
                    {selected.external?.telefon ?? selected.external?.email ?? ''}
                  </span>
                </p>
                <p className="text-[11px] text-stone-500">
                  {CHANNEL_LABELS[selected.channel]}
                  {variant === 'ceo' && <> · skrzynka: {selected.ownerName}</>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {variant === 'ceo' ? (
                  <button
                    onClick={handleToggleAi}
                    disabled={busy === 'ai'}
                    className={`rounded border px-2.5 py-1 text-[11px] transition disabled:opacity-50 ${
                      selected.ai_auto
                        ? 'border-gold-dim/50 bg-gold/10 text-gold-light'
                        : 'border-ink-border text-stone-400 hover:text-stone-200'
                    }`}
                    title="Bot odpowiada automatycznie z wiedzy firmy; przy niepewności eskaluje do człowieka"
                  >
                    🤖 Bot AI: {selected.ai_auto ? 'WŁ' : 'wył'}
                  </button>
                ) : (
                  selected.ai_auto && (
                    <span
                      className="rounded border border-gold-dim/40 bg-gold/10 px-2.5 py-1 text-[11px] text-gold-light"
                      title="Bot skonfigurowany i utrzymywany przez STRONEVO — chcesz zmian? Napisz do opiekuna."
                    >
                      🤖 Bot AI aktywny · obsługa STRONEVO
                    </span>
                  )
                )}
                {selected.status !== 'zamknieta' ? (
                  <button
                    onClick={() => handleStatus('zamknieta')}
                    disabled={busy === 'status'}
                    className="rounded border border-ink-border px-2.5 py-1 text-[11px] text-stone-400 transition hover:text-stone-200 disabled:opacity-50"
                  >
                    Zamknij
                  </button>
                ) : (
                  <button
                    onClick={() => handleStatus('otwarta')}
                    disabled={busy === 'status'}
                    className="rounded border border-ink-border px-2.5 py-1 text-[11px] text-stone-400 transition hover:text-stone-200 disabled:opacity-50"
                  >
                    Otwórz ponownie
                  </button>
                )}
              </div>
            </div>

            <div ref={threadRef} className="flex max-h-[420px] flex-1 flex-col gap-2.5 overflow-y-auto p-4">
              {thread.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[78%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    m.direction === 'in'
                      ? 'self-start rounded-bl-sm border border-ink-border bg-ink-soft text-stone-200'
                      : m.author === 'ai'
                        ? 'self-end rounded-br-sm border border-gold-dim/30 bg-gold/10 text-stone-200'
                        : 'self-end rounded-br-sm bg-bordo/40 text-stone-100'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <p className="mt-1 text-[10px] text-stone-500">
                    {m.author === 'ai' ? '🤖 bot' : m.author === 'human' ? 'zespół' : ''}
                    {m.author !== 'koncowy' && ' · '}
                    {new Date(m.created_at).toLocaleString('pl-PL', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              ))}
            </div>

            {message && (
              <div className="mx-4 mb-2 rounded-md border border-gold-dim/40 bg-gold/5 px-3 py-2 text-xs text-gold-light">
                {message}
                <button className="ml-3 underline" onClick={() => setMessage(null)}>
                  zamknij
                </button>
              </div>
            )}
            {draftInfo && (
              <p className="mx-4 mb-1 text-[11px] text-stone-500">
                Szkic AI ({draftInfo.action === 'eskalacja' ? 'sugeruje eskalację' : 'z wiedzy firmy'}
                {draftInfo.zrodla.length > 0 && `: ${draftInfo.zrodla.join(', ')}`}) — sprawdź przed
                wysłaniem.
              </p>
            )}

            {/* ===== ODPOWIEDŹ ===== */}
            <div className="border-t border-ink-border p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <select
                  className="input !w-auto !py-1 text-xs"
                  value=""
                  onChange={(e) => {
                    const t = templates.find((x) => x.id === e.target.value);
                    if (t) setReply(t.tresc);
                  }}
                >
                  <option value="">Szablon...</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nazwa}
                    </option>
                  ))}
                </select>
                {variant === 'ceo' && (
                  <button
                    onClick={handleDraft}
                    disabled={busy === 'draft'}
                    className="rounded border border-gold-dim/40 px-2.5 py-1 text-[11px] text-gold-light transition hover:bg-gold/10 disabled:opacity-50"
                  >
                    {busy === 'draft' ? 'Piszę...' : '🤖 Zaproponuj odpowiedź (AI)'}
                  </button>
                )}
                {paymentsWired && (
                  <button
                    onClick={() => setShowPay((s) => !s)}
                    className={`rounded border px-2.5 py-1 text-[11px] transition ${
                      showPay
                        ? 'border-gold-dim/50 bg-gold/10 text-gold-light'
                        : 'border-gold-dim/40 text-gold-light hover:bg-gold/10'
                    }`}
                    title="Wyślij rozmówcy link do zapłaty (faktura spina się sama)"
                  >
                    💳 Link do zapłaty
                  </button>
                )}
              </div>
              {showPay && (
                <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-gold-dim/30 bg-gold/5 p-2">
                  <input
                    className="input !w-28 !py-1 text-xs"
                    placeholder="Kwota (zł)"
                    value={pay.kwota}
                    onChange={(e) => setPay({ ...pay, kwota: e.target.value })}
                  />
                  <input
                    className="input min-w-[8rem] flex-1 !py-1 text-xs"
                    placeholder="Za co (np. Wizyta / usługa)"
                    value={pay.opis}
                    onChange={(e) => setPay({ ...pay, opis: e.target.value })}
                  />
                  <span className="text-[11px] text-stone-500">
                    {selected.external?.telefon
                      ? `SMS → ${selected.external.telefon}`
                      : 'brak numeru — sam link'}
                  </span>
                  <button
                    onClick={handleSendPay}
                    disabled={busy === 'pay'}
                    className="btn-primary !py-1 text-xs"
                  >
                    {busy === 'pay' ? 'Wysyłam...' : 'Wyślij link'}
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={2}
                  placeholder={`Odpowiedz przez ${CHANNEL_LABELS[selected.channel]}...`}
                  className="input flex-1"
                />
                <button
                  onClick={handleSend}
                  disabled={busy === 'send' || !reply.trim()}
                  className="btn-primary self-end"
                >
                  {busy === 'send' ? 'Wysyłanie...' : 'Wyślij'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
