'use client';

import { useState } from 'react';
import { ValuePanelData, sendFollowupSms, setAutoFollowup } from '@/app/actions/value';

function timeHM(iso: string): string {
  return new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}
function dayShort(iso: string): string {
  return new Date(iso).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
}

// PANEL WARTOŚCI — Ekran Kasy + stracone leady (Auto-follow-up SMS)
// + Kalendarz Kasy + VoC. Wszystkie kwoty = szacunek konserwatywny
// (× współczynnik 0.6–0.7), jawnie opisany w UI.
export default function ValuePanel({
  contactId,
  data,
}: {
  contactId: string;
  data: ValuePanelData;
}) {
  const { stats } = data;
  const [autoFollowup, setAuto] = useState(data.autoFollowupSms);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const disclaimer = `Szacunek konserwatywny: liczba umówień × średnia wartość wizyty (${stats.wartoscWizyty} zł) × współczynnik ${stats.wspolczynnik} (nie każde umówienie kończy się wizytą — celowo zaniżamy).`;

  async function handleSms(numer: string) {
    setBusy(numer);
    setMessage(null);
    try {
      setMessage(await sendFollowupSms(contactId, numer));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Błąd wysyłki SMS');
    } finally {
      setBusy(null);
    }
  }

  async function handleAutoToggle() {
    const next = !autoFollowup;
    setAuto(next);
    setBusy('auto');
    try {
      setMessage(await setAutoFollowup(contactId, next));
    } catch (e) {
      setAuto(!next);
      setMessage(e instanceof Error ? e.message : 'Błąd zapisu');
    } finally {
      setBusy(null);
    }
  }

  const maxDayValue = Math.max(...stats.kalendarz.map((d) => d.wartosc), 1);

  return (
    <div className="space-y-6">
      {message && (
        <div className="rounded-md border border-gold-dim/40 bg-gold/5 px-4 py-2 text-sm text-gold-light">
          {message}
          <button className="ml-3 underline" onClick={() => setMessage(null)}>
            zamknij
          </button>
        </div>
      )}

      {!data.hoursDefined && (
        <div className="rounded-md border border-gold-dim/40 bg-gold/10 px-4 py-3 text-sm text-gold-light">
          Ekran Kasy potrzebuje godzin pracy firmy — bez nich nie wiemy, które telefony
          wpadły „po godzinach". Uzupełnia je opiekun STRONEVO na Twojej karcie.
        </div>
      )}

      {/* ===== EKRAN KASY ===== */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div
          className="card border-gold-dim/40 p-6 lg:col-span-2"
          title={disclaimer}
        >
          <p className="text-[11px] font-medium uppercase tracking-wider text-stone-500">
            Odzyskane po godzinach (ostatnie {stats.okresDni} dni)
          </p>
          {stats.odzyskane === 0 && stats.umowionePoGodzinach === 0 ? (
            <>
              <p className="mt-2 font-serif text-4xl font-bold text-gold">Zbieramy pierwsze wyniki</p>
              <p className="mt-2 text-sm text-stone-400">
                Pierwsze telefony odzyskane po godzinach pojawią się tu automatycznie — zwykle w ciągu
                48–72 h od startu. To miejsce pokaże, ile realnie zarabiasz na tym, że asystent
                odbiera, gdy firma jest zamknięta.
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 font-serif text-5xl font-bold text-gold">
                +{stats.odzyskane} <span className="text-2xl">zł</span>
              </p>
              <p className="mt-2 text-sm text-stone-400">
                {stats.umowionePoGodzinach}{' '}
                {stats.umowionePoGodzinach === 1 ? 'wizyta umówiona' : 'wizyt umówionych'} przez
                asystenta AI, gdy firma była zamknięta —{' '}
                <span className="text-gold-light">te telefony by przepadły</span>.
              </p>
            </>
          )}
          <p className="mt-3 inline-flex cursor-help items-center gap-1.5 rounded-full border border-ink-border px-2.5 py-1 text-[11px] text-stone-500" title={disclaimer}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8h.01M11 12h1v4h1" />
            </svg>
            szacunek konserwatywny ×{stats.wspolczynnik}
          </p>
        </div>
        <div className="flex flex-col gap-4">
          <div className="card flex-1 p-5" title={disclaimer}>
            <p className="text-[11px] uppercase tracking-wider text-stone-500">
              Zagrożone (stracone leady)
            </p>
            <p className="mt-1 font-serif text-3xl font-bold text-bordo-glow">
              {stats.zagrozone} <span className="text-lg">zł</span>
            </p>
            <p className="text-xs text-stone-500">
              {stats.straconePoGodzinach.length} nieumówionych po godzinach — do odzyskania
              follow-upem
            </p>
          </div>
          <div className="card flex-1 p-5" title={disclaimer}>
            <p className="text-[11px] uppercase tracking-wider text-stone-500">
              Umówienia razem ({stats.okresDni} dni)
            </p>
            <p className="mt-1 font-serif text-3xl font-bold text-stone-200">
              {stats.umowioneRazem}{' '}
              <span className="text-lg text-stone-500">≈ {stats.wartoscUmowionychRazem} zł</span>
            </p>
          </div>
        </div>
      </div>

      {/* ===== STRACONE LEADY + AUTO-FOLLOW-UP ===== */}
      <div className="card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-serif text-lg font-bold text-stone-200">
            Stracone leady — odzyskaj je SMS-em
          </h3>
          <label
            className="flex cursor-pointer items-center gap-2 text-sm text-stone-300"
            title="Nowe nieodebrane telefony po godzinach dostaną SMS automatycznie (co godzinę, każdy lead tylko raz). Historyczne leady możesz odzyskać ręcznie przyciskiem obok."
          >
            <input
              type="checkbox"
              checked={autoFollowup}
              disabled={busy === 'auto'}
              onChange={handleAutoToggle}
              className="h-4 w-4 accent-[#7B2D3B]"
            />
            Auto-follow-up SMS nowych straconych leadów
          </label>
        </div>
        {stats.straconePoGodzinach.length === 0 ? (
          <p className="py-4 text-center text-sm text-stone-600">
            Brak straconych leadów po godzinach — asystent domyka wszystko.
          </p>
        ) : (
          <ul className="divide-y divide-ink-border/60">
            {stats.straconePoGodzinach.slice(0, 6).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="flex items-center gap-3">
                  <span className="font-mono text-sm text-stone-200">{c.numer}</span>
                  <span className="text-xs text-stone-500">
                    {dayShort(c.czas)} {timeHM(c.czas)} · po godzinach · bez rezerwacji
                  </span>
                </span>
                <button
                  disabled={busy === c.numer}
                  onClick={() => handleSms(c.numer)}
                  className="rounded border border-gold-dim/40 px-2.5 py-1 text-[11px] text-gold-light transition hover:bg-gold/10 disabled:opacity-50"
                >
                  {busy === c.numer ? 'Wysyłanie...' : 'Wyślij follow-up SMS'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ===== KALENDARZ KASY (tylko gdy są umówienia — inaczej ściana „—") ===== */}
      {stats.umowioneRazem > 0 && (
      <div className="card p-5" title={disclaimer}>
        <h3 className="mb-3 font-serif text-lg font-bold text-stone-200">
          Kalendarz Kasy — wartość umówień dzień po dniu
        </h3>
        <div className="grid grid-cols-7 gap-2">
          {stats.kalendarz.map((d) => {
            const heat = d.wartosc / maxDayValue;
            return (
              <div
                key={d.data}
                className="rounded-md border border-ink-border p-2 text-center"
                style={{
                  background:
                    d.wartosc > 0
                      ? `rgba(216, 182, 119, ${0.06 + heat * 0.22})`
                      : undefined,
                }}
                title={`${d.data}: ${d.umowienia} umówień ≈ ${d.wartosc} zł (${disclaimer})`}
              >
                <p className="text-[10px] text-stone-500">{dayShort(d.data)}</p>
                <p className={`font-serif text-sm font-bold ${d.wartosc > 0 ? 'text-gold-light' : 'text-stone-700'}`}>
                  {d.wartosc > 0 ? `${d.wartosc} zł` : '—'}
                </p>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-stone-600">
          szacunek konserwatywny ×{stats.wspolczynnik} · średnia wartość wizyty{' '}
          {stats.wartoscWizyty} zł (ustawia opiekun STRONEVO)
        </p>
      </div>
      )}

      {/* ===== VoC ===== */}
      <div className="card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-serif text-lg font-bold text-stone-200">
            Głos klientów (VoC) — o co pytają dzwoniący
          </h3>
          {data.vocSource === 'mock' && (
            <span className="rounded-full border border-gold-dim/40 bg-gold/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-gold-light">
              Przykład — realne dane po podpięciu rozmów
            </span>
          )}
        </div>
        <ul className="space-y-2.5">
          {data.voc.map((v) => (
            <li key={v.temat} className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="flex items-baseline gap-2">
                <span className="rounded bg-bordo/20 px-2 py-0.5 text-xs font-semibold text-bordo-glow">
                  {v.wystapienia}×
                </span>
                <span className="text-sm text-stone-200">{v.temat}</span>
              </span>
              <span className="text-xs italic text-stone-500">„{v.cytat}"</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
