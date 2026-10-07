'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AppNotification,
  NotificationStatus,
  NotificationType,
} from '@/lib/types';
import {
  NotificationView,
  executeNotificationAction,
  listNotifications,
  setNotificationStatus,
} from '@/app/actions/notifications';

const POLL_MS = 20_000;

// Akcja → docelowy status powiadomienia (lokalne odzwierciedlenie po sukcesie)
const ACTION_RESULT_STATUS: Record<string, NotificationStatus> = {
  disable_access: 'rozwiazane',
  send_reminder: 'w_toku',
  extend_7d: 'rozwiazane',
  send_more_agents: 'w_toku',
  escalate_claude: 'w_toku',
  resolve_manual: 'rozwiazane',
  ignore: 'rozwiazane',
  approve_deploy: 'rozwiazane',
};

const TYPE_BADGE: Record<NotificationType, string> = {
  techniczne: 'bg-sky-900/40 text-sky-300',
  biznes: 'bg-gold/15 text-gold-light',
  agent: 'bg-bordo/25 text-bordo-glow',
};

const SEVERITY_DOT: Record<string, string> = {
  info: 'bg-sky-400',
  warn: 'bg-gold',
  krytyczne: 'bg-red-500',
};

const STATUS_LABEL: Record<NotificationStatus, string> = {
  nowe: 'Nowe',
  w_toku: 'W toku',
  rozwiazane: 'Rozwiązane',
};

type Filter = 'wszystkie' | NotificationStatus;

export default function NotificationList({
  initialNotifications,
}: {
  initialNotifications: NotificationView[];
}) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [filter, setFilter] = useState<Filter>('wszystkie');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{
    notification: NotificationView;
    action: string;
    label: string;
  } | null>(null);

  // Live: polling odświeża statusy agentów (self-healing kończy się po stronie serwera)
  useEffect(() => {
    const interval = setInterval(() => {
      listNotifications().then(setNotifications).catch(() => {});
    }, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  const visible =
    filter === 'wszystkie' ? notifications : notifications.filter((n) => n.status === filter);

  function replace(updated: NotificationView) {
    setNotifications((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
  }

  async function runAction(notification: NotificationView, action: string) {
    setBusyId(notification.id);
    setMessage(null);
    try {
      const msg = await executeNotificationAction(notification.id, action);
      setMessage(msg);
      // stan po akcji ustala serwer — lokalnie odzwierciedlamy skutek
      const newStatus = ACTION_RESULT_STATUS[action] ?? 'rozwiazane';
      replace({
        ...notification,
        status: newStatus,
        runningAgents:
          action === 'send_more_agents'
            ? notification.runningAgents + 1
            : notification.runningAgents,
      });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Błąd akcji');
    } finally {
      setBusyId(null);
      setConfirming(null);
    }
  }

  async function markResolved(notification: NotificationView) {
    setBusyId(notification.id);
    try {
      const updated = await setNotificationStatus(notification.id, 'rozwiazane');
      replace({ ...notification, ...updated });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Błąd zapisu');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(['wszystkie', 'nowe', 'w_toku', 'rozwiazane'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              filter === f
                ? 'border-gold-dim bg-gold/10 text-gold-light'
                : 'border-ink-border text-stone-500 hover:text-stone-300'
            }`}
          >
            {f === 'wszystkie' ? 'Wszystkie' : STATUS_LABEL[f as NotificationStatus]}
          </button>
        ))}
      </div>

      {message && (
        <div className="mb-4 rounded-md border border-gold-dim/40 bg-gold/5 px-4 py-2 text-sm text-gold-light">
          {message}
          <button className="ml-3 underline" onClick={() => setMessage(null)}>
            zamknij
          </button>
        </div>
      )}

      <div className="space-y-3">
        {visible.map((n) => (
          <div
            key={n.id}
            className={`card p-4 ${n.status === 'rozwiazane' ? 'opacity-60' : ''} ${
              n.severity === 'krytyczne' && n.status !== 'rozwiazane' ? 'border-bordo/70' : ''
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[n.severity]}`} />
                  <p className="font-semibold text-stone-200">{n.tytul}</p>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${TYPE_BADGE[n.typ]}`}
                  >
                    {n.typ}
                  </span>
                  <span className="text-[11px] text-stone-600">
                    {new Date(n.created_at).toLocaleString('pl-PL', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                {n.opis && <p className="mt-1 text-sm text-stone-400">{n.opis}</p>}
                {n.runningAgents > 0 && n.status !== 'rozwiazane' && (
                  <p className="mt-2 inline-flex items-center gap-2 rounded-full border border-gold-dim/40 bg-gold/10 px-3 py-1 text-xs text-gold-light">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-gold" />
                    Agenci pracują ({n.runningAgents})
                  </p>
                )}
              </div>
              <span
                className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] ${
                  n.status === 'nowe'
                    ? 'border-bordo/60 bg-bordo/15 text-bordo-glow'
                    : n.status === 'w_toku'
                      ? 'border-gold-dim/40 bg-gold/5 text-gold-dim'
                      : 'border-ink-border text-stone-600'
                }`}
              >
                {STATUS_LABEL[n.status]}
              </span>
            </div>

            {n.status !== 'rozwiazane' && (
              <div className="mt-3 flex flex-wrap gap-2">
                {n.related_typ === 'agent_run' && n.related_id && (
                  <Link
                    href={`/agenci?run=${n.related_id}`}
                    className="rounded-md border border-sky-800 px-3 py-1.5 text-xs text-sky-300 transition hover:bg-sky-950/40"
                  >
                    Otwórz review
                  </Link>
                )}
                {n.akcje.map((a) => (
                  <button
                    key={a.action}
                    disabled={busyId === n.id}
                    onClick={() =>
                      a.confirm
                        ? setConfirming({ notification: n, action: a.action, label: a.label })
                        : runAction(n, a.action)
                    }
                    className={
                      a.confirm
                        ? 'rounded-md bg-red-950 px-3 py-1.5 text-xs text-red-300 transition hover:bg-red-900 disabled:opacity-50'
                        : 'rounded-md border border-gold-dim/40 px-3 py-1.5 text-xs text-gold-light transition hover:bg-gold/10 disabled:opacity-50'
                    }
                  >
                    {a.label}
                  </button>
                ))}
                <button
                  disabled={busyId === n.id}
                  onClick={() => markResolved(n)}
                  className="rounded-md border border-ink-border px-3 py-1.5 text-xs text-stone-500 transition hover:text-stone-300 disabled:opacity-50"
                >
                  Oznacz jako rozwiązane
                </button>
              </div>
            )}
          </div>
        ))}
        {visible.length === 0 && (
          <div className="card px-4 py-12 text-center text-stone-600">
            Brak powiadomień w tym widoku.
          </div>
        )}
      </div>

      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setConfirming(null)}
        >
          <div
            className="card w-full max-w-md p-6 shadow-2xl shadow-black/60"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-serif text-xl font-bold text-stone-100">
              Potwierdź: {confirming.label}
            </h2>
            <p className="mt-2 text-sm text-stone-400">{confirming.notification.tytul}</p>
            <p className="mt-2 text-sm text-red-300">
              Klient straci dostęp do panelu do czasu ręcznego przywrócenia. Kontynuować?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setConfirming(null)}>
                Anuluj
              </button>
              <button
                disabled={busyId !== null}
                className="rounded-md bg-red-900 px-4 py-2 text-sm font-semibold text-red-100 transition hover:bg-red-800 disabled:opacity-50"
                onClick={() => runAction(confirming.notification, confirming.action)}
              >
                Tak, wyłącz dostęp
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
