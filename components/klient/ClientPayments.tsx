'use client';

import { useState } from 'react';
import { createPaymentLinkAction } from '@/app/actions/commerce';
import { Payment, PaymentLink } from '@/lib/types';

// Płatności w panelu KLIENTA (funkcja UŻYTKOWA, operator-first):
// klient wystawia linki text-to-pay dla SWOICH klientów i widzi wpływy.
// Bramki/subskrypcje/kursy konfiguruje STRONEVO.

export default function ClientPayments({
  contactId,
  payments,
  links,
  wired = false,
}: {
  contactId: string;
  payments: Payment[];
  links: PaymentLink[];
  wired?: boolean; // czy realna bramka jest podłączona; false = teaser zamiast formularza
}) {
  const [form, setForm] = useState({ kwota: '', opis: '', imie: '', telefon: '', sms: true });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const oplacone = payments.filter((p) => p.status === 'oplacona');
  const suma = oplacone.reduce((s, p) => s + Number(p.kwota), 0);

  // Bramka niepodłączona → NIE pokazujemy formularza (prowadziłby do „trybu demo").
  // Teaser jak przy rezerwacjach: uczciwie „uruchamiamy w Twoim pakiecie".
  if (!wired) {
    return (
      <div className="card border-gold-dim/30 p-5">
        <p className="text-sm text-stone-300">
          <span className="font-semibold text-gold-light">Płatności online</span> pozwolą Ci wysłać
          klientowi link „zapłać przez telefon", a faktura spina się sama. Bramkę płatniczą
          podłącza dla Ciebie opiekun STRONEVO w ramach uruchomienia.
        </p>
        <p className="mt-2 text-xs text-stone-500">
          Chcesz przyjmować płatności online? Napisz do opiekuna — skonfigurujemy bramkę na Twoje
          konto (pieniądze trafiają prosto do Ciebie).
        </p>
      </div>
    );
  }

  async function handleCreate() {
    setBusy(true);
    setMessage(null);
    try {
      const r = await createPaymentLinkAction({
        contact_id: contactId,
        kwota: Number(form.kwota.replace(',', '.')),
        opis: form.opis,
        imie: form.imie,
        telefon: form.telefon,
        sendSmsNow: form.sms,
      });
      setMessage(r.message);
      setForm({ ...form, kwota: '', opis: '', imie: '', telefon: '' });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Błąd');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card border-gold-dim/40 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-serif text-lg font-bold text-stone-100">
            Wyślij klientowi link do płatności (SMS)
          </h3>
          <p className="text-sm text-stone-400">
            wpłynęło: <span className="font-serif font-bold text-gold">{suma.toFixed(2)} zł</span>{' '}
            ({oplacone.length} płatności)
          </p>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-4">
          <input className="input" placeholder="Kwota (zł)" value={form.kwota} onChange={(e) => setForm({ ...form, kwota: e.target.value })} />
          <input className="input sm:col-span-2" placeholder="Za co (np. Przegląd gaśnic)" value={form.opis} onChange={(e) => setForm({ ...form, opis: e.target.value })} />
          <input className="input" placeholder="Telefon klienta" value={form.telefon} onChange={(e) => setForm({ ...form, telefon: e.target.value })} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <input className="input !w-auto" placeholder="Imię/firma klienta" value={form.imie} onChange={(e) => setForm({ ...form, imie: e.target.value })} />
          <label className="flex items-center gap-1.5 text-xs text-stone-300">
            <input type="checkbox" checked={form.sms} onChange={(e) => setForm({ ...form, sms: e.target.checked })} className="accent-[#7B2D3B]" />
            wyślij SMS od razu
          </label>
          <button
            onClick={handleCreate}
            disabled={busy || !form.kwota || !form.opis}
            className="btn-primary !py-1.5 text-xs"
          >
            {busy ? 'Tworzenie...' : 'Utwórz i wyślij'}
          </button>
        </div>
        {message && (
          <p className="mt-2 break-all rounded-md border border-gold-dim/40 bg-gold/5 px-3 py-2 text-xs text-gold-light">
            {message}
          </p>
        )}
      </div>

      {links.length > 0 && (
        <div className="card p-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
            Twoje linki płatnicze
          </h4>
          <ul className="divide-y divide-ink-border/60">
            {links.slice(0, 8).map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0 truncate text-sm text-stone-300">
                  {l.opis}
                  {l.external?.imie && <span className="ml-2 text-xs text-stone-500">{l.external.imie}</span>}
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-serif font-bold text-gold">{Number(l.kwota).toFixed(2)} zł</span>
                  <span className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase ${l.status === 'oplacony' ? 'bg-emerald-900/40 text-emerald-300' : 'bg-gold/15 text-gold-light'}`}>
                    {l.status}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
