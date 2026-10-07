'use server';

import { demoStore } from '@/lib/demo-store';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import { Contract, Subscription } from '@/lib/types';

export interface ClientRevenue {
  contactId: string;
  nazwa: string;
  pakiet: string;
  miesiecznie: number; // zł netto / mc
  rocznie: number; // zł netto / rok
}

export interface RevenueStats {
  mrr: number; // suma miesięczna netto (wszyscy płacący klienci)
  arr: number; // MRR × 12
  liczbaKlientow: number;
  perKlient: ClientRevenue[];
  source: 'live' | 'demo';
}

// Przychód powtarzalny od klientów.
// Definicja "klient płacący" = umowa w statusie 'zaakceptowana'.
// cena_abonament = miesięczny abonament netto z umowy. MRR = suma; ARR = ×12.
// Jeden kontakt może mieć kilka umów (np. aneks) — sumujemy per kontakt.
export async function getRevenueStats(): Promise<RevenueStats> {
  let contracts: (Contract & { nazwa: string })[] = [];
  let source: 'live' | 'demo' = 'demo';

  if (!isSupabaseConfigured()) {
    const contacts = demoStore.listContacts();
    const nameById = new Map(contacts.map((c) => [c.id, c.firma ?? c.imie]));
    contracts = contacts
      .flatMap((c) => demoStore.listContracts(c.id))
      .filter((k) => k.status === 'zaakceptowana')
      .map((k) => ({ ...k, nazwa: nameById.get(k.contact_id) ?? '—' }));
  } else {
    source = 'live';
    const supabase = await createClient();
    const { data: rows } = await supabase
      .from('contracts')
      .select('*')
      .eq('status', 'zaakceptowana');
    const list = (rows ?? []) as Contract[];
    const ids = [...new Set(list.map((c) => c.contact_id))];
    const nameById = new Map<string, string>();
    if (ids.length > 0) {
      const { data: cs } = await supabase
        .from('contacts')
        .select('id, imie, firma')
        .in('id', ids);
      for (const c of (cs ?? []) as { id: string; imie: string; firma: string | null }[]) {
        nameById.set(c.id, c.firma ?? c.imie);
      }
    }
    contracts = list.map((c) => ({ ...c, nazwa: nameById.get(c.contact_id) ?? '—' }));
  }

  const byContact = new Map<string, ClientRevenue>();
  for (const k of contracts) {
    const mc = Number(k.cena_abonament) || 0;
    const prev = byContact.get(k.contact_id);
    if (prev) {
      prev.miesiecznie += mc;
      prev.rocznie += mc * 12;
      prev.pakiet = `${prev.pakiet} + ${k.pakiet_nazwa}`;
    } else {
      byContact.set(k.contact_id, {
        contactId: k.contact_id,
        nazwa: k.nazwa,
        pakiet: k.pakiet_nazwa,
        miesiecznie: mc,
        rocznie: mc * 12,
      });
    }
  }

  // FAZA 4: subskrypcje (auto-obciążenia) też liczą się do MRR.
  // Uwaga operacyjna: dla klienta rozliczanego subskrypcją NIE dubluj
  // abonamentu w umowie (jedno źródło prawdy przychodu per klient).
  let subs: (Subscription & { nazwa: string })[] = [];
  if (!isSupabaseConfigured()) {
    const nameById = new Map(demoStore.listContacts().map((c) => [c.id, c.firma ?? c.imie]));
    subs = demoStore
      .listSubscriptions()
      .filter((s) => s.status === 'aktywna')
      .map((s) => ({ ...s, nazwa: (s.contact_id && nameById.get(s.contact_id)) || '—' }));
  } else {
    const supabase = await createClient();
    const { data: rows } = await supabase.from('subscriptions').select('*').eq('status', 'aktywna');
    const list = (rows ?? []) as Subscription[];
    const ids = [...new Set(list.map((s) => s.contact_id).filter(Boolean))] as string[];
    const nameById = new Map<string, string>();
    if (ids.length > 0) {
      const { data: cs } = await supabase.from('contacts').select('id, imie, firma').in('id', ids);
      for (const c of (cs ?? []) as { id: string; imie: string; firma: string | null }[]) {
        nameById.set(c.id, c.firma ?? c.imie);
      }
    }
    subs = list.map((s) => ({ ...s, nazwa: (s.contact_id && nameById.get(s.contact_id)) || '—' }));
  }

  for (const s of subs) {
    const mc = Math.round(((Number(s.kwota) || 0) / (s.cykl === 'roczny' ? 12 : 1)) * 100) / 100;
    const key = s.contact_id ?? s.id;
    const prev = byContact.get(key);
    if (prev) {
      prev.miesiecznie += mc;
      prev.rocznie += mc * 12;
      prev.pakiet = `${prev.pakiet} + ${s.plan} (subskrypcja)`;
    } else {
      byContact.set(key, {
        contactId: key,
        nazwa: s.nazwa,
        pakiet: `${s.plan} (subskrypcja)`,
        miesiecznie: mc,
        rocznie: mc * 12,
      });
    }
  }

  const perKlient = [...byContact.values()].sort((a, b) => b.miesiecznie - a.miesiecznie);
  const mrr = perKlient.reduce((s, k) => s + k.miesiecznie, 0);

  return { mrr, arr: mrr * 12, liczbaKlientow: perKlient.length, perKlient, source };
}
