'use client';

import { useCallback, useEffect, useState } from 'react';

// Widget rezerwacji: wybór dnia (7 dni) → wolne sloty (serwer liczy RR/class)
// → dane kontaktowe → potwierdzenie.
interface Slot {
  start: string;
  koniec: string;
  wolne_miejsca: number;
}

export default function BookingWidget({ slug }: { slug: string }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [day, setDay] = useState(days[0].toISOString().slice(0, 10));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [form, setForm] = useState({ imie: '', telefon: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSlots = useCallback(async (d: string) => {
    setLoading(true);
    setSelected(null);
    try {
      const res = await fetch(`/api/booking/slots?slug=${encodeURIComponent(slug)}&data=${d}`);
      const json = await res.json();
      setSlots(res.ok ? json.slots ?? [] : []);
    } catch {
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void loadSlots(day);
  }, [day, loadSlots]);

  async function handleBook() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/booking/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, start: selected.start, ...form }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Nie udało się zarezerwować');
      setDone(
        `Zarezerwowano: ${new Date(json.start).toLocaleString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}${json.przydzielono ? ` · obsłuży: ${json.przydzielono}` : ''}`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd');
      void loadSlots(day);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mt-6 rounded-2xl border border-emerald-300 bg-emerald-50 p-6 text-center">
        <p className="font-semibold text-emerald-800">✓ {done}</p>
        <p className="mt-1 text-xs text-emerald-700">Do zobaczenia! Potwierdzenie wysyłamy SMS-em/e-mailem.</p>
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-2xl bg-white p-5 shadow-lg">
      {/* dni */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {days.map((d) => {
          const key = d.toISOString().slice(0, 10);
          return (
            <button
              key={key}
              onClick={() => setDay(key)}
              className={`shrink-0 rounded-lg px-3 py-2 text-center text-xs transition ${
                day === key ? 'bg-[#9b2242] text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              <span className="block font-semibold">
                {d.toLocaleDateString('pl-PL', { weekday: 'short' })}
              </span>
              {d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'numeric' })}
            </button>
          );
        })}
      </div>

      {/* sloty */}
      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {loading && <p className="col-span-4 py-4 text-center text-xs text-stone-400">Szukam wolnych terminów...</p>}
        {!loading && slots.length === 0 && (
          <p className="col-span-4 py-4 text-center text-xs text-stone-400">Brak wolnych terminów tego dnia.</p>
        )}
        {!loading &&
          slots.map((s) => (
            <button
              key={s.start}
              onClick={() => setSelected(s)}
              className={`rounded-lg border px-2 py-2 text-xs font-semibold transition ${
                selected?.start === s.start
                  ? 'border-[#9b2242] bg-[#9b2242] text-white'
                  : 'border-stone-200 text-stone-700 hover:border-[#9b2242]'
              }`}
            >
              {new Date(s.start).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
              {s.wolne_miejsca > 1 && (
                <span className="block text-[9px] font-normal opacity-70">{s.wolne_miejsca} miejsc</span>
              )}
            </button>
          ))}
      </div>

      {/* dane */}
      {selected && (
        <div className="mt-4 space-y-2 border-t border-stone-100 pt-4">
          <input
            className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
            placeholder="Imię i nazwisko *"
            value={form.imie}
            onChange={(e) => setForm({ ...form, imie: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className="rounded-md border border-stone-300 px-3 py-2 text-sm"
              placeholder="Telefon"
              value={form.telefon}
              onChange={(e) => setForm({ ...form, telefon: e.target.value })}
            />
            <input
              className="rounded-md border border-stone-300 px-3 py-2 text-sm"
              placeholder="E-mail"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            onClick={handleBook}
            disabled={busy || !form.imie.trim()}
            className="w-full rounded-lg bg-[#9b2242] px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Rezerwuję...' : `Rezerwuję ${new Date(selected.start).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`}
          </button>
        </div>
      )}
    </div>
  );
}
