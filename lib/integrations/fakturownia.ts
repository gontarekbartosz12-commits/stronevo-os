import { Contact, IntegrationResult, InvoicePosition, InvoiceStatus } from '@/lib/types';

// Fakturownia API — stub z ENV. Bez FAKTUROWNIA_DOMAIN/FAKTUROWNIA_API_KEY
// wszystkie funkcje działają w trybie mock (deterministyczne ID, brak realnych wywołań).
// Docs API: https://app.fakturownia.pl/api

function isConfigured(): boolean {
  return Boolean(process.env.FAKTUROWNIA_DOMAIN && process.env.FAKTUROWNIA_API_KEY);
}

function apiBase(): string {
  return `https://${process.env.FAKTUROWNIA_DOMAIN}.fakturownia.pl`;
}

export interface CreateInvoiceResult {
  fakturowniaId: string;
  numer: string;
  kwota: number;
}

// Wystawia fakturę za pozycje jednorazowe (wdrożenie).
// firstMonthFree: pozycje cykliczne NIE wchodzą na tę fakturę —
// abonament rusza fakturą cykliczną od 2. miesiąca (createRecurring).
export async function createInvoice(
  contact: Contact,
  pozycje: InvoicePosition[],
  opts: { firstMonthFree?: boolean; simulated?: boolean } = {}
): Promise<IntegrationResult<CreateInvoiceResult>> {
  const jednorazowe = pozycje.filter((p) => p.cykl === 'jednorazowa');
  const kwota = jednorazowe.reduce((sum, p) => sum + p.kwota, 0);

  // GUARD: płatność symulowana (mock-pay / demo) NIGDY nie wystawia realnej
  // faktury VAT — nawet gdy Fakturownia jest skonfigurowana. Ochrona przed
  // realnymi dokumentami fiskalnymi podczas testów bramki.
  if (!isConfigured() || opts.simulated) {
    const stamp = Date.now().toString().slice(-6);
    return {
      source: 'mock',
      data: { fakturowniaId: `MOCK-${stamp}`, numer: `MOCK/${stamp}`, kwota },
    };
  }

  try {
    const res = await fetch(`${apiBase()}/invoices.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_token: process.env.FAKTUROWNIA_API_KEY,
        invoice: {
          kind: 'vat',
          buyer_name: contact.firma ?? contact.imie,
          buyer_tax_no: contact.nip ?? undefined,
          buyer_email: contact.email ?? undefined,
          buyer_post_city: contact.miasto ?? undefined,
          positions: jednorazowe.map((p) => ({
            name: p.nazwa,
            total_price_gross: p.kwota,
            quantity: 1,
          })),
          description: opts.firstMonthFree
            ? 'Pierwszy miesiąc abonamentu gratis — rozliczenie cykliczne od 2. miesiąca.'
            : undefined,
        },
      }),
    });
    if (!res.ok) throw new Error(`Fakturownia: HTTP ${res.status}`);
    const json = await res.json();
    return {
      source: 'live',
      data: { fakturowniaId: String(json.id), numer: json.number ?? String(json.id), kwota },
    };
  } catch {
    const stamp = Date.now().toString().slice(-6);
    return {
      source: 'mock',
      data: { fakturowniaId: `MOCK-${stamp}`, numer: `MOCK/${stamp}`, kwota },
    };
  }
}

// Status płatności faktury. Mock: brak zewnętrznego źródła prawdy,
// zwraca null → wołający zostaje przy statusie z własnej bazy.
export async function getInvoiceStatus(
  fakturowniaId: string
): Promise<IntegrationResult<InvoiceStatus | null>> {
  if (!isConfigured() || fakturowniaId.startsWith('MOCK')) {
    return { source: 'mock', data: null };
  }

  try {
    const res = await fetch(
      `${apiBase()}/invoices/${fakturowniaId}.json?api_token=${process.env.FAKTUROWNIA_API_KEY}`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) throw new Error(`Fakturownia: HTTP ${res.status}`);
    const json = await res.json();
    const status: InvoiceStatus =
      json.status === 'paid' ? 'oplacona' : json.paid_date ? 'oplacona' : 'wystawiona';
    return { source: 'live', data: status };
  } catch {
    return { source: 'mock', data: null };
  }
}

// Faktura cykliczna (abonament) — start od podanej daty (2. miesiąc przy firstMonthFree).
export async function createRecurring(
  contact: Contact,
  pozycje: InvoicePosition[],
  startDate: string,
  opts: { simulated?: boolean } = {}
): Promise<IntegrationResult<{ recurringId: string }>> {
  const cykliczne = pozycje.filter((p) => p.cykl === 'miesieczna');

  // GUARD jak w createInvoice: symulacja nie tworzy realnej faktury cyklicznej.
  if (!isConfigured() || opts.simulated || cykliczne.length === 0) {
    return { source: 'mock', data: { recurringId: `MOCK-REC-${Date.now().toString().slice(-6)}` } };
  }

  try {
    const res = await fetch(`${apiBase()}/recurrings.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_token: process.env.FAKTUROWNIA_API_KEY,
        recurring: {
          name: `Abonament — ${contact.firma ?? contact.imie}`,
          invoice_attributes: {
            kind: 'vat',
            buyer_name: contact.firma ?? contact.imie,
            buyer_tax_no: contact.nip ?? undefined,
            buyer_email: contact.email ?? undefined,
            positions: cykliczne.map((p) => ({
              name: p.nazwa,
              total_price_gross: p.kwota,
              quantity: 1,
            })),
          },
          start_date: startDate,
          every: '1m',
          issue_working_day_only: false,
        },
      }),
    });
    if (!res.ok) throw new Error(`Fakturownia: HTTP ${res.status}`);
    const json = await res.json();
    return { source: 'live', data: { recurringId: String(json.id) } };
  } catch {
    return { source: 'mock', data: { recurringId: `MOCK-REC-${Date.now().toString().slice(-6)}` } };
  }
}
