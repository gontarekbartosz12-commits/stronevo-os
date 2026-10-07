import {
  AutomationEvent,
  ClientAutomation,
  Contact,
  EventType,
  EventValueConfig,
  HealthStatus,
} from './types';

// PANEL WYNIKÓW — silnik agregacji ROI.
//
// Zasada (guardrail): wszystkie kwoty to JAWNY SZACUNEK („~”) liczony prostą,
// konfigurowalną metodą: minuty oszczędzone per zdarzenie (event_values)
// / 60 × stawka zł/h (globalna z ENV lub nadpisana per klient). Zero zmyślonych
// kwot — każda liczba wynika wprost ze zdarzeń i tej formuły.

// ===== Wartościowanie =====

export const DEFAULT_EVENT_VALUES: EventValueConfig[] = [
  { typ: 'rozmowa_odebrana', minuty: 5, etykieta: 'Rozmowa odebrana' },
  { typ: 'lead_zlapany', minuty: 10, etykieta: 'Lead złapany' },
  { typ: 'rezerwacja', minuty: 8, etykieta: 'Rezerwacja' },
  { typ: 'sms_wyslany', minuty: 2, etykieta: 'SMS wysłany' },
  { typ: 'opinia_zebrana', minuty: 15, etykieta: 'Opinia zebrana' },
  { typ: 'workflow_run', minuty: 1, etykieta: 'Uruchomienie workflow' },
  { typ: 'blad', minuty: 0, etykieta: 'Błąd' },
];

export const DEFAULT_STAWKA_PLN_H = 60;

// Stawka globalna zł/h (ENV), nadpisywalna per klient (contacts.stawka_pln_h)
export function stawkaPlnH(contact?: Pick<Contact, 'stawka_pln_h'> | null): number {
  const perClient = Number(contact?.stawka_pln_h);
  if (Number.isFinite(perClient) && perClient > 0) return perClient;
  const global = Number(process.env.WYNIKI_STAWKA_PLN_H);
  if (Number.isFinite(global) && global > 0) return global;
  return DEFAULT_STAWKA_PLN_H;
}

export function minutyForTyp(typ: EventType, values: EventValueConfig[]): number {
  return values.find((v) => v.typ === typ)?.minuty ?? 0;
}

// wartość zdarzenia = round(minuty/60 × stawka, 2)
export function wycenaZdarzenia(minuty: number, stawka: number): number {
  return Math.round((minuty / 60) * stawka * 100) / 100;
}

// ===== Reguła zdrowia wdrożenia =====
// ok    = zdarzenie ≤48h i brak nierozwiązanego błędu
// uwaga = brak zdarzenia 2–7 dni LUB błąd w ostatnich 7 dniach (rozwiązany)
// blad  = brak zdarzenia >7 dni LUB nierozwiązany błąd
// nowa  = jeszcze żadnego zdarzenia
// Progi konfigurowalne: WYNIKI_HEALTH_OK_H (48), WYNIKI_HEALTH_BLAD_D (7).

export interface HealthInput {
  lastEventAt: string | null;
  unresolvedError: boolean; // otwarte powiadomienie techniczne dla wdrożenia
  errorsLast7d: number;
  now?: Date;
}

export function healthThresholds(): { okHours: number; bladDays: number } {
  const okHours = Number(process.env.WYNIKI_HEALTH_OK_H);
  const bladDays = Number(process.env.WYNIKI_HEALTH_BLAD_D);
  return {
    okHours: Number.isFinite(okHours) && okHours > 0 ? okHours : 48,
    bladDays: Number.isFinite(bladDays) && bladDays > 0 ? bladDays : 7,
  };
}

export function computeHealth(input: HealthInput): HealthStatus {
  const { okHours, bladDays } = healthThresholds();
  if (input.unresolvedError) return 'blad';
  if (!input.lastEventAt) return 'nowa';

  const now = input.now ?? new Date();
  const ageH = (now.getTime() - new Date(input.lastEventAt).getTime()) / 3_600_000;
  if (ageH > bladDays * 24) return 'blad';
  if (ageH > okHours) return 'uwaga';
  if (input.errorsLast7d >= 1) return 'uwaga';
  return 'ok';
}

// Najgorszy status z listy (kropka klienta w tabeli CEO)
const HEALTH_RANK: Record<HealthStatus, number> = { blad: 3, uwaga: 2, nowa: 1, ok: 0 };

export function worstHealth(statuses: HealthStatus[]): HealthStatus {
  if (statuses.length === 0) return 'nowa';
  return statuses.reduce((worst, s) => (HEALTH_RANK[s] > HEALTH_RANK[worst] ? s : worst), 'ok');
}

// ===== Agregacje KPI =====

export interface WynikiKpi {
  rozmowy: number;
  leady: number;
  leadyPoGodzinach: number;
  rezerwacje: number;
  smsy: number;
  opinie: number;
  workflowRuns: number;
  bledy: number;
  minuty: number;
  godziny: number; // zaokrąglone do 0.1
  wartoscPln: number; // suma wartosc_pln (jawny szacunek „~”)
}

export function emptyKpi(): WynikiKpi {
  return {
    rozmowy: 0,
    leady: 0,
    leadyPoGodzinach: 0,
    rezerwacje: 0,
    smsy: 0,
    opinie: 0,
    workflowRuns: 0,
    bledy: 0,
    minuty: 0,
    godziny: 0,
    wartoscPln: 0,
  };
}

export function inRange(iso: string, from: Date, to: Date): boolean {
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t < to.getTime();
}

export function computeKpi(events: AutomationEvent[]): WynikiKpi {
  const kpi = emptyKpi();
  for (const e of events) {
    switch (e.typ) {
      case 'rozmowa_odebrana':
        kpi.rozmowy++;
        break;
      case 'lead_zlapany':
        kpi.leady++;
        if (e.meta?.po_godzinach === true) kpi.leadyPoGodzinach++;
        break;
      case 'rezerwacja':
        kpi.rezerwacje++;
        break;
      case 'sms_wyslany':
        kpi.smsy++;
        break;
      case 'opinia_zebrana':
        kpi.opinie++;
        break;
      case 'workflow_run':
        kpi.workflowRuns++;
        break;
      case 'blad':
        kpi.bledy++;
        break;
    }
    kpi.minuty += e.minuty_oszczedzone;
    kpi.wartoscPln += Number(e.wartosc_pln);
  }
  kpi.godziny = Math.round((kpi.minuty / 60) * 10) / 10;
  kpi.wartoscPln = Math.round(kpi.wartoscPln * 100) / 100;
  return kpi;
}

// Zakresy dat
export function monthRange(okres: Date): { from: Date; to: Date } {
  const from = new Date(okres.getFullYear(), okres.getMonth(), 1);
  const to = new Date(okres.getFullYear(), okres.getMonth() + 1, 1);
  return { from, to };
}

export function lastDaysRange(days: number, now = new Date()): { from: Date; to: Date } {
  const from = new Date(now.getTime() - days * 24 * 3_600_000);
  return { from, to: now };
}

// ===== Trend dzienny (wykres 30/90 dni) =====

export interface TrendPoint {
  data: string; // ISO date (yyyy-mm-dd)
  zdarzenia: number;
  wartosc: number; // zł (~)
}

export function computeTrend(events: AutomationEvent[], days: number, now = new Date()): TrendPoint[] {
  const byDay = new Map<string, { n: number; v: number }>();
  for (const e of events) {
    if (e.typ === 'blad') continue;
    const key = e.created_at.slice(0, 10);
    const cur = byDay.get(key) ?? { n: 0, v: 0 };
    cur.n += 1;
    cur.v += Number(e.wartosc_pln);
    byDay.set(key, cur);
  }
  const points: TrendPoint[] = [];
  const base = new Date(now);
  base.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const cur = byDay.get(key);
    points.push({
      data: key,
      zdarzenia: cur?.n ?? 0,
      wartosc: Math.round((cur?.v ?? 0) * 100) / 100,
    });
  }
  return points;
}

// ===== Zdanie ROI po ludzku (ton STRONEVO: usprawnienie/wynik/nowoczesność) =====
// NIGDY nie sugerujemy, że klient „sobie nie radzi".

export function roiSentence(kpi: WynikiKpi, okresLabel = 'W tym miesiącu'): string {
  const parts: string[] = [];
  if (kpi.rozmowy > 0)
    parts.push(`odebrały ${kpi.rozmowy} ${odmiana(kpi.rozmowy, 'telefon', 'telefony', 'telefonów')}`);
  if (kpi.rezerwacje > 0)
    parts.push(`umówiły ${kpi.rezerwacje} ${odmiana(kpi.rezerwacje, 'spotkanie', 'spotkania', 'spotkań')}`);
  if (kpi.leady > 0)
    parts.push(`złapały ${kpi.leady} ${odmiana(kpi.leady, 'leada', 'leady', 'leadów')}`);
  if (kpi.opinie > 0)
    parts.push(`zebrały ${kpi.opinie} ${odmiana(kpi.opinie, 'opinię', 'opinie', 'opinii')}`);

  if (parts.length === 0) {
    return `${okresLabel} Twoje automatyzacje pracowały w tle — pierwsze wyniki pojawią się tutaj automatycznie.`;
  }

  const lista =
    parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} i ${parts[parts.length - 1]}`;
  return `${okresLabel} Twoje automatyzacje ${lista} — to ~${kpi.godziny} h Twojego czasu (~${formatPln(kpi.wartoscPln)} zł).`;
}

export function odmiana(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const last = n % 10;
  const last2 = n % 100;
  if (last >= 2 && last <= 4 && !(last2 >= 12 && last2 <= 14)) return few;
  return many;
}

export function formatPln(v: number): string {
  return v.toLocaleString('pl-PL', { maximumFractionDigits: 0 });
}

// Jawny opis metody liczenia — pokazywany przy każdej kwocie („~”)
export function metodaOpis(stawka: number): string {
  return `Szacunek: każde zdarzenie ma przypisane minuty zaoszczędzonej pracy (np. rozmowa odebrana = 5 min, opinia = 15 min), a wartość = minuty ÷ 60 × stawka ${stawka} zł/h. Metoda celowo prosta i w pełni konfigurowalna.`;
}

// ===== Raport miesięczny (payload monthly_reports) =====

export function okresLabel(okres: Date): string {
  return okres.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
}

export interface MonthlyReportPayload {
  firma: string;
  okres: string; // yyyy-mm-01
  okres_label: string; // „czerwiec 2026"
  kpi: WynikiKpi;
  roi_zdanie: string;
  automatyzacje: { nazwa: string; zdarzenia: number; minuty: number; wartosc_pln: number }[];
  stawka_pln_h: number;
  metoda: string;
  [key: string]: unknown;
}

// Payload liczony z twardych zdarzeń miesiąca — wspólny dla crona
// /api/reports/run i seedów demo. Ton: usprawnienie/wynik, zero ocen klienta.
export function buildMonthlyReportPayload(
  contact: Contact,
  automations: { ca: ClientAutomation; nazwa: string }[],
  monthEvents: AutomationEvent[], // zdarzenia klienta z raportowanego miesiąca
  okres: Date
): MonthlyReportPayload {
  const stawka = stawkaPlnH(contact);
  const kpi = computeKpi(monthEvents);
  const label = okresLabel(okres);

  const perAutomation = automations
    .map(({ ca, nazwa }) => {
      const ev = monthEvents.filter((e) => e.client_automation_id === ca.id);
      const k = computeKpi(ev);
      return {
        nazwa,
        zdarzenia: ev.filter((e) => e.typ !== 'blad').length,
        minuty: k.minuty,
        wartosc_pln: k.wartoscPln,
      };
    })
    .filter((a) => a.zdarzenia > 0 || automations.length === 1);

  return {
    firma: contact.firma ?? contact.imie,
    okres: `${okres.getFullYear()}-${String(okres.getMonth() + 1).padStart(2, '0')}-01`,
    okres_label: label,
    kpi,
    roi_zdanie: roiSentence(kpi, `W ${miesiacDopelniacz(okres)}`),
    automatyzacje: perAutomation,
    stawka_pln_h: stawka,
    metoda: metodaOpis(stawka),
  };
}

// „W czerwcu 2026" — dopełniacz nazwy miesiąca do zdania ROI
const MIESIACE_DOP = [
  'styczniu', 'lutym', 'marcu', 'kwietniu', 'maju', 'czerwcu',
  'lipcu', 'sierpniu', 'wrześniu', 'październiku', 'listopadzie', 'grudniu',
];

export function miesiacDopelniacz(okres: Date): string {
  return `${MIESIACE_DOP[okres.getMonth()]} ${okres.getFullYear()}`;
}

// ===== Rollupy dla ekranu CEO =====

export interface ClientRollup {
  contact: Contact;
  aktywneAutomatyzacje: number;
  zdarzenia30d: number;
  ostatniaAktywnosc: string | null;
  health: HealthStatus;
  roi30dPln: number;
}

export interface AutomationRollup {
  ca: ClientAutomation;
  nazwa: string;
  klient: Contact | null;
  lastEventAt: string | null;
  health: HealthStatus;
  zdarzenia30d: number;
  bledy7d: number;
  minuty30d: number;
  wartosc30dPln: number;
}

// Zdrowie liczone na żywo ze zdarzeń (źródło prawdy), nie z kolumny —
// kolumna client_automations.health służy filtrom n8n/integracjom.
export function rollupAutomation(
  ca: ClientAutomation,
  nazwa: string,
  klient: Contact | null,
  events: AutomationEvent[], // zdarzenia TEGO wdrożenia
  unresolvedError: boolean,
  now = new Date()
): AutomationRollup {
  const last = events.reduce<string | null>(
    (acc, e) => (!acc || e.created_at > acc ? e.created_at : acc),
    ca.last_event_at ?? null
  );
  const range30 = lastDaysRange(30, now);
  const range7 = lastDaysRange(7, now);
  const ev30 = events.filter((e) => inRange(e.created_at, range30.from, range30.to));
  const bledy7d = events.filter(
    (e) => e.typ === 'blad' && inRange(e.created_at, range7.from, range7.to)
  ).length;
  const kpi30 = computeKpi(ev30);

  // Wdrożenie w budowie/wstrzymane nie alarmuje czerwonym — pokazujemy 'nowa'
  const health =
    ca.status === 'active'
      ? computeHealth({ lastEventAt: last, unresolvedError, errorsLast7d: bledy7d, now })
      : 'nowa';

  return {
    ca,
    nazwa,
    klient,
    lastEventAt: last,
    health,
    zdarzenia30d: ev30.filter((e) => e.typ !== 'blad').length,
    bledy7d,
    minuty30d: kpi30.minuty,
    wartosc30dPln: kpi30.wartoscPln,
  };
}
