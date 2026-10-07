'use client';

import { useState } from 'react';
import {
  CourseWithMeta,
  addLessonAction,
  createCourseAction,
  createPaymentLinkAction,
  createSubscriptionAction,
  grantEnrollmentAction,
  saveLessonContent,
  setSubscriptionStatus,
} from '@/app/actions/commerce';
import {
  Contact,
  PAYMENT_PROVIDER_LABELS,
  Payment,
  PaymentLink,
  Subscription,
  SubscriptionCycle,
} from '@/lib/types';

// COMMERCE HUB (operator): Płatności (text-to-pay) · Subskrypcje · Kursy.
// ⚠️ Prawdziwe pieniądze: kwoty dokładne; statusy zmienia webhook, nie UI.

const TABS = ['Płatności', 'Subskrypcje', 'Kursy'] as const;
type Tab = (typeof TABS)[number];

function zl(v: number): string {
  return `${Number(v).toFixed(2)} zł`;
}
function d(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('pl-PL') : '—';
}

export default function CommerceHub({
  payments,
  links,
  subscriptions,
  courses,
  klienci,
}: {
  payments: Payment[];
  links: PaymentLink[];
  subscriptions: Subscription[];
  courses: CourseWithMeta[];
  klienci: Contact[];
}) {
  const [tab, setTab] = useState<Tab>('Płatności');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const klientName = (id: string | null) =>
    id ? klienci.find((k) => k.id === id)?.firma ?? 'klient' : 'STRONEVO';

  async function run(key: string, fn: () => Promise<string | void>) {
    setBusy(key);
    setMessage(null);
    try {
      const msg = await fn();
      if (msg) setMessage(msg);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Błąd');
    } finally {
      setBusy(null);
    }
  }

  // --- formularze ---
  const [linkForm, setLinkForm] = useState({ contactId: '', kwota: '', opis: '', imie: '', telefon: '', sms: true });
  const [subForm, setSubForm] = useState({ contactId: '', plan: '', kwota: '', cykl: 'miesieczny' as SubscriptionCycle, nextCharge: new Date().toISOString().slice(0, 10) });
  const [courseForm, setCourseForm] = useState({ contactId: '', tytul: '', opis: '', cena: '' });
  const [lessonEdit, setLessonEdit] = useState<{ id: string; tytul: string; tresc: string } | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-lg border border-ink-border p-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-4 py-1.5 text-sm transition ${tab === t ? 'bg-bordo/30 font-semibold text-gold-light' : 'text-stone-500 hover:text-stone-300'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {message && (
        <div className="break-all rounded-md border border-gold-dim/40 bg-gold/5 px-4 py-2 text-sm text-gold-light">
          {message}
          <button className="ml-3 underline" onClick={() => setMessage(null)}>zamknij</button>
        </div>
      )}

      {/* ===== PŁATNOŚCI ===== */}
      {tab === 'Płatności' && (
        <div className="space-y-4">
          <div className="card space-y-2.5 p-4">
            <h3 className="font-serif text-lg font-bold text-stone-200">Nowy link płatniczy (text-to-pay)</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
              <select className="input" value={linkForm.contactId} onChange={(e) => setLinkForm({ ...linkForm, contactId: e.target.value })}>
                <option value="">Firma: STRONEVO</option>
                {klienci.map((k) => (<option key={k.id} value={k.id}>{k.firma ?? k.imie}</option>))}
              </select>
              <input className="input" placeholder="Kwota (zł)" value={linkForm.kwota} onChange={(e) => setLinkForm({ ...linkForm, kwota: e.target.value })} />
              <input className="input sm:col-span-2" placeholder="Opis (co opłacane)" value={linkForm.opis} onChange={(e) => setLinkForm({ ...linkForm, opis: e.target.value })} />
              <input className="input" placeholder="Telefon płatnika" value={linkForm.telefon} onChange={(e) => setLinkForm({ ...linkForm, telefon: e.target.value })} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input className="input !w-auto" placeholder="Imię/firma płatnika" value={linkForm.imie} onChange={(e) => setLinkForm({ ...linkForm, imie: e.target.value })} />
              <label className="flex items-center gap-1.5 text-xs text-stone-300">
                <input type="checkbox" checked={linkForm.sms} onChange={(e) => setLinkForm({ ...linkForm, sms: e.target.checked })} className="accent-[#7B2D3B]" />
                wyślij SMS-em od razu
              </label>
              <button
                disabled={busy === 'link' || !linkForm.kwota || !linkForm.opis}
                onClick={() =>
                  run('link', async () => {
                    const r = await createPaymentLinkAction({
                      contact_id: linkForm.contactId || null,
                      kwota: Number(linkForm.kwota.replace(',', '.')),
                      opis: linkForm.opis,
                      imie: linkForm.imie,
                      telefon: linkForm.telefon,
                      sendSmsNow: linkForm.sms,
                    });
                    setLinkForm({ ...linkForm, kwota: '', opis: '', imie: '', telefon: '' });
                    return r.message;
                  })
                }
                className="btn-primary !py-1.5 text-xs"
              >
                {busy === 'link' ? 'Tworzenie...' : 'Utwórz link'}
              </button>
            </div>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-border text-left text-[11px] uppercase tracking-wider text-stone-500">
                  <th className="px-4 py-2.5">Link / opis</th>
                  <th className="px-4 py-2.5">Firma</th>
                  <th className="px-4 py-2.5 text-right">Kwota</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Utworzony</th>
                </tr>
              </thead>
              <tbody>
                {links.map((l) => (
                  <tr key={l.id} className="border-b border-ink-border/50">
                    <td className="px-4 py-2.5">
                      <p className="text-stone-200">{l.opis}</p>
                      <a href={`/pay/${l.token}`} target="_blank" className="text-xs text-gold-dim underline">/pay/{l.token}</a>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-stone-400">{klientName(l.contact_id)}</td>
                    <td className="px-4 py-2.5 text-right font-serif font-bold text-gold">{zl(Number(l.kwota))}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase ${l.status === 'oplacony' ? 'bg-emerald-900/40 text-emerald-300' : l.status === 'aktywny' ? 'bg-gold/15 text-gold-light' : 'bg-stone-700/40 text-stone-400'}`}>
                        {l.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-stone-500">{d(l.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card p-4">
            <h3 className="mb-2 font-serif text-lg font-bold text-stone-200">Ostatnie płatności</h3>
            <ul className="divide-y divide-ink-border/60">
              {payments.slice(0, 10).map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="text-sm text-stone-300">
                    {String(p.meta?.opis ?? p.meta?.plan ?? 'Płatność')}
                    <span className="ml-2 text-xs text-stone-500">{klientName(p.contact_id)} · {PAYMENT_PROVIDER_LABELS[p.provider]}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="font-serif font-bold text-gold">{zl(Number(p.kwota))}</span>
                    <span className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase ${p.status === 'oplacona' ? 'bg-emerald-900/40 text-emerald-300' : p.status === 'oczekuje' ? 'bg-gold/15 text-gold-light' : 'bg-bordo/25 text-bordo-glow'}`}>
                      {p.status}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ===== SUBSKRYPCJE ===== */}
      {tab === 'Subskrypcje' && (
        <div className="space-y-4">
          <div className="card space-y-2.5 p-4">
            <h3 className="font-serif text-lg font-bold text-stone-200">Nowa subskrypcja (operator)</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
              <select className="input" value={subForm.contactId} onChange={(e) => setSubForm({ ...subForm, contactId: e.target.value })}>
                <option value="">— klient —</option>
                {klienci.map((k) => (<option key={k.id} value={k.id}>{k.firma ?? k.imie}</option>))}
              </select>
              <input className="input" placeholder="Plan (np. Abonament: Pro)" value={subForm.plan} onChange={(e) => setSubForm({ ...subForm, plan: e.target.value })} />
              <input className="input" placeholder="Kwota (zł/cykl)" value={subForm.kwota} onChange={(e) => setSubForm({ ...subForm, kwota: e.target.value })} />
              <select className="input" value={subForm.cykl} onChange={(e) => setSubForm({ ...subForm, cykl: e.target.value as SubscriptionCycle })}>
                <option value="miesieczny">miesięczny</option>
                <option value="roczny">roczny</option>
              </select>
              <input type="date" className="input" value={subForm.nextCharge} onChange={(e) => setSubForm({ ...subForm, nextCharge: e.target.value })} />
            </div>
            <button
              disabled={busy === 'sub' || !subForm.contactId || !subForm.plan || !subForm.kwota}
              onClick={() =>
                run('sub', async () => {
                  await createSubscriptionAction({
                    contact_id: subForm.contactId,
                    plan: subForm.plan,
                    kwota: Number(subForm.kwota.replace(',', '.')),
                    cykl: subForm.cykl,
                    next_charge: subForm.nextCharge,
                  });
                  setSubForm({ ...subForm, plan: '', kwota: '' });
                  return 'Subskrypcja utworzona — cron obciąży w dniu next_charge (odśwież stronę).';
                })
              }
              className="btn-primary !py-1.5 text-xs"
            >
              {busy === 'sub' ? 'Tworzenie...' : 'Utwórz subskrypcję'}
            </button>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-border text-left text-[11px] uppercase tracking-wider text-stone-500">
                  <th className="px-4 py-2.5">Plan</th>
                  <th className="px-4 py-2.5">Klient</th>
                  <th className="px-4 py-2.5 text-right">Kwota</th>
                  <th className="px-4 py-2.5">Cykl</th>
                  <th className="px-4 py-2.5">Następne obciążenie</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((s) => (
                  <tr key={s.id} className="border-b border-ink-border/50">
                    <td className="px-4 py-2.5 text-stone-200">{s.plan}</td>
                    <td className="px-4 py-2.5 text-xs text-stone-400">{klientName(s.contact_id)}</td>
                    <td className="px-4 py-2.5 text-right font-serif font-bold text-gold">{zl(Number(s.kwota))}</td>
                    <td className="px-4 py-2.5 text-xs text-stone-400">{s.cykl}</td>
                    <td className="px-4 py-2.5 text-xs text-stone-300">{d(s.next_charge)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase ${s.status === 'aktywna' ? 'bg-emerald-900/40 text-emerald-300' : s.status === 'zalegla' ? 'bg-bordo/25 text-bordo-glow' : 'bg-stone-700/40 text-stone-400'}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {s.status !== 'anulowana' && (
                        <button
                          disabled={busy === s.id}
                          onClick={() => run(s.id, async () => { await setSubscriptionStatus(s.id, 'anulowana'); return 'Subskrypcja anulowana.'; })}
                          className="rounded border border-ink-border px-2 py-1 text-[11px] text-stone-400 hover:text-stone-200"
                        >
                          Anuluj
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-stone-600">
            Auto-obciążenia: cron /api/subscriptions/charge-due (Stripe off-session / symulacja demo /
            smart dunning: link text-to-pay SMS-em). MRR z aktywnych subskrypcji liczy się w Panelu Przychodów.
          </p>
        </div>
      )}

      {/* ===== KURSY ===== */}
      {tab === 'Kursy' && (
        <div className="space-y-4">
          <div className="card space-y-2.5 p-4">
            <h3 className="font-serif text-lg font-bold text-stone-200">Nowy kurs (operator)</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              <select className="input" value={courseForm.contactId} onChange={(e) => setCourseForm({ ...courseForm, contactId: e.target.value })}>
                <option value="">Właściciel: STRONEVO</option>
                {klienci.map((k) => (<option key={k.id} value={k.id}>{k.firma ?? k.imie}</option>))}
              </select>
              <input className="input" placeholder="Tytuł kursu" value={courseForm.tytul} onChange={(e) => setCourseForm({ ...courseForm, tytul: e.target.value })} />
              <input className="input" placeholder="Cena (zł, puste = zamknięty)" value={courseForm.cena} onChange={(e) => setCourseForm({ ...courseForm, cena: e.target.value })} />
              <button
                disabled={busy === 'course' || !courseForm.tytul}
                onClick={() =>
                  run('course', async () => {
                    await createCourseAction({
                      contact_id: courseForm.contactId || null,
                      tytul: courseForm.tytul,
                      opis: courseForm.opis,
                      cena: courseForm.cena ? Number(courseForm.cena.replace(',', '.')) : null,
                    });
                    setCourseForm({ ...courseForm, tytul: '', cena: '' });
                    return 'Kurs utworzony — dodaj lekcje (odśwież stronę).';
                  })
                }
                className="btn-primary !py-2 text-xs"
              >
                Utwórz kurs
              </button>
            </div>
          </div>

          {courses.map((c) => (
            <div key={c.id} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-serif text-lg font-bold text-stone-100">{c.tytul}</p>
                  <p className="text-xs text-stone-500">
                    {c.ownerName} · {c.cena !== null ? `${zl(Number(c.cena))} (sprzedaż linkiem: meta.course_id)` : 'dostęp nadawany ręcznie'} · kursantów: {c.enrollments.length}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={busy === `grant-${c.id}`}
                    onClick={() =>
                      run(`grant-${c.id}`, async () => {
                        const imie = window.prompt('Imię kursanta:');
                        if (!imie) return;
                        const r = await grantEnrollmentAction({ course_id: c.id, imie });
                        return `Dostęp nadany: ${r.url}`;
                      })
                    }
                    className="rounded border border-gold-dim/40 px-2.5 py-1 text-[11px] text-gold-light hover:bg-gold/10"
                  >
                    + Nadaj dostęp
                  </button>
                  <button
                    disabled={busy === `lesson-${c.id}`}
                    onClick={() =>
                      run(`lesson-${c.id}`, async () => {
                        const tytul = window.prompt('Tytuł nowej lekcji:');
                        if (!tytul) return;
                        await addLessonAction(c.id, tytul);
                        return 'Lekcja dodana (odśwież stronę).';
                      })
                    }
                    className="rounded border border-ink-border px-2.5 py-1 text-[11px] text-stone-400 hover:text-stone-200"
                  >
                    + Lekcja
                  </button>
                </div>
              </div>

              <ul className="mt-3 divide-y divide-ink-border/60">
                {c.lessons.map((l, i) => (
                  <li key={l.id} className="py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-stone-300">{i + 1}. {l.tytul}</span>
                      <button
                        onClick={() => setLessonEdit(lessonEdit?.id === l.id ? null : { id: l.id, tytul: l.tytul, tresc: l.tresc ?? '' })}
                        className="rounded border border-ink-border px-2 py-0.5 text-[11px] text-stone-400 hover:text-stone-200"
                      >
                        Edytuj treść
                      </button>
                    </div>
                    {lessonEdit?.id === l.id && (
                      <div className="mt-2 space-y-2 rounded-md border border-ink-border bg-ink-soft/60 p-3">
                        <input className="input" value={lessonEdit.tytul} onChange={(e) => setLessonEdit({ ...lessonEdit, tytul: e.target.value })} />
                        <textarea className="input" rows={4} value={lessonEdit.tresc} onChange={(e) => setLessonEdit({ ...lessonEdit, tresc: e.target.value })} />
                        <button
                          disabled={busy === `save-${l.id}`}
                          onClick={() =>
                            run(`save-${l.id}`, async () => {
                              await saveLessonContent(l.id, { tytul: lessonEdit.tytul, tresc: lessonEdit.tresc });
                              setLessonEdit(null);
                              return 'Lekcja zapisana.';
                            })
                          }
                          className="btn-primary !py-1 text-[11px]"
                        >
                          Zapisz lekcję
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              {c.enrollments.length > 0 && (
                <p className="mt-2 border-t border-ink-border/60 pt-2 text-[11px] text-stone-500">
                  Dostępy: {c.enrollments.map((e) => `${e.external?.imie ?? 'kursant'} (/kurs/${e.token})`).join(' · ')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
