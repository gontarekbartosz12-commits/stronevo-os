'use client';

import { useState } from 'react';
import {
  CONTACT_TYPES,
  Contact,
  ContactInput,
  PIPELINE_STATUSES,
  Server,
  STATUS_LABELS,
  TYPE_LABELS,
} from '@/lib/types';
import AutomationsTab from './tabs/AutomationsTab';
import CredentialsTab from './tabs/CredentialsTab';
import InvoicesTab from './tabs/InvoicesTab';
import ContractsTab from './tabs/ContractsTab';
import HoursTab from './tabs/HoursTab';
import CallsTab from './tabs/CallsTab';

const EMPTY: ContactInput = {
  server_id: null,
  typ: 'lead',
  imie: '',
  firma: null,
  nip: null,
  adres: null,
  branza: null,
  miasto: null,
  telefon: null,
  email: null,
  zrodlo: null,
  status_pipeline: 'NOWY',
  nastepna_akcja: null,
  nastepna_akcja_data: null,
  data_ostatniego_kontaktu: null,
  notatki: null,
  business_hours: null,
  srednia_wartosc_wizyty: null,
  auto_followup_sms: false,
  przypisany_do: null,
};

type Tab = 'dane' | 'automatyzacje' | 'dostepy' | 'faktury' | 'umowa' | 'godziny' | 'polaczenia';

const TABS: { key: Tab; label: string }[] = [
  { key: 'dane', label: 'Dane' },
  { key: 'automatyzacje', label: 'Automatyzacje' },
  { key: 'dostepy', label: 'Dostępy' },
  { key: 'faktury', label: 'Faktury' },
  { key: 'umowa', label: 'Umowa' },
  { key: 'godziny', label: 'Godziny' },
  { key: 'polaczenia', label: 'Połączenia' },
];

// Karta kontaktu: edycja danych (Faza 1) + zakładki Automatyzacje / Faktury /
// Umowa (Faza 2). Nowy kontakt = tylko formularz danych.
export default function ContactModal({
  contact,
  servers,
  onClose,
  onSave,
  onCreate,
  onDelete,
}: {
  contact: Contact | null;
  servers: Server[];
  onClose: () => void;
  onSave?: (patch: Partial<ContactInput>) => Promise<void>;
  onCreate?: (input: ContactInput) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const isNew = contact === null;
  const [tab, setTab] = useState<Tab>('dane');
  const [form, setForm] = useState<ContactInput>(isNew ? EMPTY : { ...contact });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function set<K extends keyof ContactInput>(key: K, value: ContactInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function text(value: string): string | null {
    return value.trim() === '' ? null : value;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (isNew) {
        await onCreate?.(form);
      } else {
        await onSave?.(form);
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd zapisu');
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card my-8 w-full max-w-2xl p-6 shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <h2 className="font-serif text-2xl font-bold text-stone-100">
            {isNew ? 'Nowy kontakt' : form.imie || 'Kontakt'}
            {!isNew && form.firma && (
              <span className="ml-2 text-base font-normal text-stone-500">{form.firma}</span>
            )}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-stone-500 transition hover:text-stone-200"
            aria-label="Zamknij"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {!isNew && (
          <div className="mb-5 flex gap-1 border-b border-ink-border">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`-mb-px border-b-2 px-4 py-2 text-sm transition ${
                  tab === t.key
                    ? 'border-gold font-semibold text-gold-light'
                    : 'border-transparent text-stone-500 hover:text-stone-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {(isNew || tab === 'dane') && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Imię / osoba kontaktowa *</label>
                <input
                  required
                  className="input"
                  value={form.imie}
                  onChange={(e) => set('imie', e.target.value)}
                />
              </div>
              <div>
                <label className="label">Firma</label>
                <input
                  className="input"
                  value={form.firma ?? ''}
                  onChange={(e) => set('firma', text(e.target.value))}
                />
              </div>
              <div>
                <label className="label">NIP</label>
                <input
                  className="input"
                  value={form.nip ?? ''}
                  onChange={(e) => set('nip', text(e.target.value))}
                />
              </div>
              <div>
                <label className="label">Branża</label>
                <input
                  className="input"
                  value={form.branza ?? ''}
                  onChange={(e) => set('branza', text(e.target.value))}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Adres (do umowy/faktury)</label>
                <input
                  className="input"
                  placeholder="ul. Przykładowa 1, 00-001 Miasto"
                  value={form.adres ?? ''}
                  onChange={(e) => set('adres', text(e.target.value))}
                />
              </div>
              <div>
                <label className="label">Miasto</label>
                <input
                  className="input"
                  value={form.miasto ?? ''}
                  onChange={(e) => set('miasto', text(e.target.value))}
                />
              </div>
              <div>
                <label className="label">Telefon</label>
                <input
                  className="input"
                  value={form.telefon ?? ''}
                  onChange={(e) => set('telefon', text(e.target.value))}
                />
              </div>
              <div>
                <label className="label">E-mail</label>
                <input
                  type="email"
                  className="input"
                  value={form.email ?? ''}
                  onChange={(e) => set('email', text(e.target.value))}
                />
              </div>
              <div>
                <label className="label">Źródło</label>
                <input
                  className="input"
                  placeholder="np. OLX, kampania Meta, polecenie"
                  value={form.zrodlo ?? ''}
                  onChange={(e) => set('zrodlo', text(e.target.value))}
                />
              </div>
              <div>
                <label className="label">Typ</label>
                <select
                  className="input"
                  value={form.typ}
                  onChange={(e) => set('typ', e.target.value as ContactInput['typ'])}
                >
                  {CONTACT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Etap pipeline</label>
                <select
                  className="input"
                  value={form.status_pipeline}
                  onChange={(e) =>
                    set('status_pipeline', e.target.value as ContactInput['status_pipeline'])
                  }
                >
                  {PIPELINE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Serwer</label>
                <select
                  className="input"
                  value={form.server_id ?? ''}
                  onChange={(e) => set('server_id', text(e.target.value))}
                >
                  <option value="">— brak —</option>
                  {servers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nazwa}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Data ostatniego kontaktu</label>
                <input
                  type="date"
                  className="input"
                  value={form.data_ostatniego_kontaktu ?? ''}
                  onChange={(e) => set('data_ostatniego_kontaktu', text(e.target.value))}
                />
              </div>
              <div>
                <label className="label">Śr. wartość wizyty (zł — Ekran Kasy)</label>
                <input
                  type="number"
                  min="0"
                  className="input"
                  placeholder="np. 350"
                  value={form.srednia_wartosc_wizyty ?? ''}
                  onChange={(e) =>
                    set(
                      'srednia_wartosc_wizyty',
                      e.target.value === '' ? null : Number(e.target.value)
                    )
                  }
                />
              </div>
            </div>

            <div className="rounded-md border border-gold-dim/30 bg-gold/5 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gold-dim">
                Następna akcja
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px]">
                <input
                  className="input"
                  placeholder="Co dalej z tym kontaktem?"
                  value={form.nastepna_akcja ?? ''}
                  onChange={(e) => set('nastepna_akcja', text(e.target.value))}
                />
                <input
                  type="date"
                  className="input"
                  value={form.nastepna_akcja_data ?? ''}
                  onChange={(e) => set('nastepna_akcja_data', text(e.target.value))}
                />
              </div>
            </div>

            <div>
              <label className="label">Notatki</label>
              <textarea
                rows={4}
                className="input resize-y"
                value={form.notatki ?? ''}
                onChange={(e) => set('notatki', text(e.target.value))}
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex items-center justify-between pt-2">
              {!isNew && onDelete ? (
                confirmDelete ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-red-400">Na pewno usunąć?</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await onDelete();
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Błąd usuwania');
                          setBusy(false);
                        }
                      }}
                      className="rounded-md bg-red-900 px-3 py-1.5 text-red-100 transition hover:bg-red-800"
                    >
                      Tak, usuń
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="text-stone-400 underline"
                    >
                      anuluj
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="text-sm text-stone-600 transition hover:text-red-400"
                  >
                    Usuń kontakt
                  </button>
                )
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="btn-ghost">
                  Anuluj
                </button>
                <button type="submit" disabled={busy} className="btn-primary">
                  {busy ? 'Zapisywanie...' : isNew ? 'Dodaj kontakt' : 'Zapisz zmiany'}
                </button>
              </div>
            </div>
          </form>
        )}

        {!isNew && tab === 'automatyzacje' && <AutomationsTab contactId={contact.id} />}
        {!isNew && tab === 'dostepy' && <CredentialsTab contactId={contact.id} />}
        {!isNew && tab === 'faktury' && <InvoicesTab contactId={contact.id} />}
        {!isNew && tab === 'umowa' && <ContractsTab contactId={contact.id} />}
        {!isNew && tab === 'godziny' && onSave && (
          <HoursTab contact={contact} onSave={onSave} />
        )}
        {!isNew && tab === 'polaczenia' && <CallsTab contactId={contact.id} />}
      </div>
    </div>
  );
}
