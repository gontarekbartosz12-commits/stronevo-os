import { Contact, SmartListFilter } from './types';

// SMART LISTS (Faza 5) — ewaluator zapisanych filtrów kontaktów.
// Czysta funkcja: filtr jsonb → predykat; liczona na serwerze (demo i live
// filtrują listę już ograniczoną przez RLS/tenanta).

export function matchesSmartFilter(contact: Contact, filtr: SmartListFilter): boolean {
  if (filtr.status_pipeline && filtr.status_pipeline.length > 0) {
    if (!filtr.status_pipeline.includes(contact.status_pipeline)) return false;
  }
  if (filtr.typ && filtr.typ.length > 0) {
    if (!filtr.typ.includes(contact.typ)) return false;
  }
  if (filtr.zrodlo_contains) {
    if (!(contact.zrodlo ?? '').toLowerCase().includes(filtr.zrodlo_contains.toLowerCase())) {
      return false;
    }
  }
  if (filtr.miasto) {
    if ((contact.miasto ?? '').toLowerCase() !== filtr.miasto.toLowerCase()) return false;
  }
  if (filtr.branza_contains) {
    if (!(contact.branza ?? '').toLowerCase().includes(filtr.branza_contains.toLowerCase())) {
      return false;
    }
  }
  if (filtr.ma_telefon === true && !contact.telefon) return false;
  if (filtr.ma_email === true && !contact.email) return false;
  return true;
}

export function evaluateSmartList(contacts: Contact[], filtr: SmartListFilter): Contact[] {
  return contacts.filter((c) => matchesSmartFilter(c, filtr));
}

// Czytelny opis filtra do UI („co łapie ta lista")
export function describeFilter(filtr: SmartListFilter): string {
  const parts: string[] = [];
  if (filtr.status_pipeline?.length) parts.push(`etap: ${filtr.status_pipeline.join('/')}`);
  if (filtr.typ?.length) parts.push(`typ: ${filtr.typ.join('/')}`);
  if (filtr.zrodlo_contains) parts.push(`źródło zawiera „${filtr.zrodlo_contains}"`);
  if (filtr.miasto) parts.push(`miasto: ${filtr.miasto}`);
  if (filtr.branza_contains) parts.push(`branża zawiera „${filtr.branza_contains}"`);
  if (filtr.ma_telefon) parts.push('ma telefon');
  if (filtr.ma_email) parts.push('ma e-mail');
  return parts.length > 0 ? parts.join(' · ') : 'wszystkie kontakty';
}
