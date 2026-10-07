// Wspólne typy domenowe STRONEVO OS

export const PIPELINE_STATUSES = [
  'NOWY',
  'PROBA_KONTAKTU',
  'UMOWIONY',
  'PO_DEMO',
  'OFERTA',
  'KLIENT',
  'STRACONY',
  'PIEC',
] as const;

export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

export const STATUS_LABELS: Record<PipelineStatus, string> = {
  NOWY: 'Nowy',
  PROBA_KONTAKTU: 'Próba kontaktu',
  UMOWIONY: 'Umówiony',
  PO_DEMO: 'Po demo',
  OFERTA: 'Oferta',
  KLIENT: 'Klient',
  STRACONY: 'Stracony',
  PIEC: 'Piec',
};

// Kolor paska kolumny / badge per status
export const STATUS_COLORS: Record<PipelineStatus, string> = {
  NOWY: '#8a8a8a',
  PROBA_KONTAKTU: '#c9a15a',
  UMOWIONY: '#d8b677',
  PO_DEMO: '#b05263',
  OFERTA: '#96404f',
  KLIENT: '#5e9c6f',
  STRACONY: '#6b4a4f',
  PIEC: '#e07b39',
};

export const CONTACT_TYPES = ['lead', 'prospekt', 'klient'] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

export const TYPE_LABELS: Record<ContactType, string> = {
  lead: 'Lead',
  prospekt: 'Prospekt',
  klient: 'Klient',
};

export interface Server {
  id: string;
  nazwa: string;
  host: string | null;
  port: number | null;
  notatka: string | null;
  status: string | null;
  // Multi-VPS (Faza 3): własna instancja n8n per serwer; puste = globalny ENV
  n8n_url: string | null;
  n8n_api_key: string | null;
}

export type ServerInput = Omit<Server, 'id'>;

// --- Godziny pracy klienta (dodatek F3 — fundament "Ekranu Kasy") ---

export const DAY_KEYS = ['pon', 'wt', 'sr', 'czw', 'pt', 'sob', 'nd'] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export const DAY_LABELS: Record<DayKey, string> = {
  pon: 'Poniedziałek',
  wt: 'Wtorek',
  sr: 'Środa',
  czw: 'Czwartek',
  pt: 'Piątek',
  sob: 'Sobota',
  nd: 'Niedziela',
};

export interface BusinessHours {
  // null = dzień zamknięty; ["9:00","18:00"] = otwarcie-zamknięcie
  dni: Record<DayKey, [string, string] | null>;
  // wyjątki/święta — w te daty firma zamknięta niezależnie od dnia tygodnia
  wyjatki: { data: string; opis: string }[];
}

export interface Contact {
  id: string;
  server_id: string | null;
  typ: ContactType;
  imie: string;
  firma: string | null;
  nip: string | null;
  adres: string | null; // pełny adres do umowy (Faza 2)
  branza: string | null;
  miasto: string | null;
  telefon: string | null;
  email: string | null;
  zrodlo: string | null;
  status_pipeline: PipelineStatus;
  nastepna_akcja: string | null;
  nastepna_akcja_data: string | null; // ISO date (yyyy-mm-dd)
  data_ostatniego_kontaktu: string | null; // ISO date
  notatki: string | null;
  business_hours: BusinessHours | null; // dodatek F3
  // Panel Wartości: baza wyceny Ekranu Kasy + auto-follow-up straconych leadów
  srednia_wartosc_wizyty: number | null; // zł — ustawia CEO na karcie klienta
  auto_followup_sms: boolean;
  // Kalendarz spotkań: przydział leada do handlowca (null = CEO/„Ty")
  przypisany_do: string | null;
  // Panel Wyników: stawka zł/h klienta do wyceny oszczędzonego czasu
  // (null = globalna z ENV WYNIKI_STAWKA_PLN_H, domyślnie 60)
  stawka_pln_h?: number | null;
  // Multi-tenant CRM klienta: właściciel leada. null = lead STRONEVO (CEO);
  // ustawione = lead należący do klienta (jego contact_id) — widoczny tylko w panelu klienta.
  owner_contact_id?: string | null;
  created_at: string;
}

export type ContactInput = Omit<Contact, 'id' | 'created_at'>;

// Historia kontaktu w CRM klienta (timeline notatek/telefonów/spotkań per lead)
export const ACTIVITY_TYPES = ['notatka', 'telefon', 'email', 'spotkanie', 'status'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  notatka: 'Notatka',
  telefon: 'Telefon',
  email: 'E-mail',
  spotkanie: 'Spotkanie',
  status: 'Zmiana etapu',
};

export const ACTIVITY_TYPE_ICONS: Record<ActivityType, string> = {
  notatka: '📝',
  telefon: '📞',
  email: '✉️',
  spotkanie: '🤝',
  status: '🔄',
};

export interface LeadActivity {
  id: string;
  contact_id: string;
  owner_contact_id: string;
  typ: ActivityType;
  tresc: string;
  created_at: string;
}

// --- Dashboard CEO (Moduł B) ---

export type DataSource = 'live' | 'mock';

export interface N8nWorkflow {
  id: string;
  nazwa: string;
  klient: string | null;
  aktywny: boolean;
  ostatniStatus: 'success' | 'error' | 'waiting' | 'unknown';
  ostatnieUruchomienie: string | null; // ISO datetime
}

export interface VpsStatus {
  host: string;
  ramUsedGb: number;
  ramTotalGb: number;
  diskUsedGb: number;
  diskTotalGb: number;
  load1: number;
  load5: number;
  load15: number;
  uptime: string;
}

export interface Healthcheck {
  nazwa: string;
  status: 'up' | 'down' | 'late' | 'paused';
  ostatniPing: string | null; // ISO datetime
}

export interface IntegrationResult<T> {
  source: DataSource;
  data: T;
}

// --- Katalog automatyzacji (Faza 2) ---

export const AUTOMATION_TYPES = ['recepcja', 'chatbot', 'opinie', 'n8n', 'strona', 'pakiet'] as const;
export type AutomationType = (typeof AUTOMATION_TYPES)[number];

export const AUTOMATION_TYPE_LABELS: Record<AutomationType, string> = {
  recepcja: 'Recepcja AI',
  chatbot: 'Chatbot',
  opinie: 'Opinie',
  n8n: 'Automatyzacja n8n',
  strona: 'Strona WWW',
  pakiet: 'Pakiet',
};

// Kompendium wiedzy: co trzeba uzyskać od klienta, by wdrożyć daną automatyzację,
// i JAK to zdobyć (spotkanie wideo / poradnik dla klienta / klient przesyła / sami).
export const POZYSKANIE_METODY = ['wideo', 'poradnik', 'przeslij', 'sami'] as const;
export type PozyskanieMetoda = (typeof POZYSKANIE_METODY)[number];

export const POZYSKANIE_METODA_LABELS: Record<PozyskanieMetoda, string> = {
  wideo: 'Spotkanie wideo',
  poradnik: 'Poradnik dla klienta',
  przeslij: 'Klient przesyła',
  sami: 'Zbieramy sami',
};

export interface ClientRequirement {
  pozycja: string; // co uzyskać, np. "Dostęp do konta Google Business Profile"
  metoda: PozyskanieMetoda; // jak to zdobyć
  szczegoly?: string; // instrukcja / link do poradnika / uwaga
}

export interface Automation {
  id: string;
  nazwa: string;
  typ: AutomationType;
  opis: string;
  cena_wdrozenie: number; // zł netto
  cena_mc: number; // zł netto / mies.
  template_config: Record<string, unknown>;
  // Kompendium: lista rzeczy do zebrania od klienta przy wdrożeniu tej usługi
  wymagania_od_klienta: ClientRequirement[];
}

// Cykl życia automatyzacji klienta:
// oczekuje_oplaty → (opłata wdrożeniowa) → provisioning (budowa) → active. paused = wstrzymana.
export const CLIENT_AUTOMATION_STATUSES = [
  'oczekuje_oplaty',
  'provisioning',
  'active',
  'paused',
] as const;
export type ClientAutomationStatus = (typeof CLIENT_AUTOMATION_STATUSES)[number];

export const CLIENT_AUTOMATION_STATUS_LABELS: Record<ClientAutomationStatus, string> = {
  oczekuje_oplaty: 'Czeka na opłatę',
  provisioning: 'W budowie',
  active: 'Aktywna',
  paused: 'Wstrzymana',
};

export interface ClientAutomation {
  id: string;
  contact_id: string;
  automation_id: string;
  n8n_workflow_id: string | null;
  status: ClientAutomationStatus;
  data_startu: string | null; // ISO date
  // Panel Wyników: znacznik ostatniego zdarzenia + zdrowie wdrożenia
  // (aktualizowane przez /api/events/ingest; w UI liczone też na żywo)
  last_event_at?: string | null;
  health?: HealthStatus;
  // Rejestr wersji: która wersja golden-template stoi u klienta (np. 'chatbot-rag@1.2.0')
  template_version?: string | null;
  created_at: string;
}

// --- Dostępy/klucze od klienta (blokada deployu) ---
// Per klient, per wymaganie z kompendium: status oczekuje/otrzymano + wartość
// (klucz/notatka). Deploy (aktywacja automatyzacji) zablokowany dopóki komplet.
export const CREDENTIAL_STATUSES = ['oczekuje', 'otrzymano'] as const;
export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number];

export const CREDENTIAL_STATUS_LABELS: Record<CredentialStatus, string> = {
  oczekuje: 'Oczekuje',
  otrzymano: 'Otrzymano',
};

export interface ClientCredential {
  id: string;
  contact_id: string;
  automation_id: string | null;
  pozycja: string; // co jest wymagane (z wymagania_od_klienta.pozycja)
  metoda: PozyskanieMetoda; // jak pozyskać (wideo/poradnik/przeslij/sami)
  status: CredentialStatus;
  wartosc: string | null; // klucz/notatka — w UI maskowane; szyfrowanie at-rest = TODO hardening
  created_at: string;
}

// --- Faktury (Faza 2) ---

export const INVOICE_STATUSES = ['wystawiona', 'oplacona', 'zalegla'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_CYCLES = ['jednorazowa', 'miesieczna'] as const;
export type InvoiceCycle = (typeof INVOICE_CYCLES)[number];

export interface Invoice {
  id: string;
  contact_id: string;
  fakturownia_id: string | null;
  tytul: string;
  kwota: number; // zł netto
  cykl: InvoiceCycle;
  status: InvoiceStatus;
  data: string; // ISO date wystawienia / startu cyklu
  created_at: string;
}

export interface InvoicePosition {
  nazwa: string;
  kwota: number;
  cykl: InvoiceCycle;
}

// --- Umowy (Faza 2) ---

export const CONTRACT_STATUSES = ['szkic', 'wyslana', 'zaakceptowana'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  szkic: 'Szkic',
  wyslana: 'Wysłana',
  zaakceptowana: 'Zaakceptowana',
};

export interface Contract {
  id: string;
  contact_id: string;
  pakiet_nazwa: string;
  cena_wdrozenie: number;
  cena_abonament: number;
  lista_automatyzacji: string[]; // nazwy pakietów/automatyzacji
  data_startu: string; // ISO date
  status: ContractStatus;
  accepted_at: string | null; // e-akceptacja: timestamp
  accepted_ip: string | null; // e-akceptacja: IP
  created_at: string;
}

// --- Zadania (Faza 2) ---

// Faza 4: pełny cykl buildowy — nowe(do_zrobienia) → w_budowie(agent) →
// do_review(do_zatwierdzenia) → zatwierdzone → wdrozone. Agent NIE wdraża sam.
export const TASK_STATUSES = [
  'do_zrobienia',
  'w_budowie',
  'do_zatwierdzenia',
  'zatwierdzone',
  'wdrozone',
  'gotowe',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  do_zrobienia: 'Nowe',
  w_budowie: 'W budowie',
  do_zatwierdzenia: 'Do review',
  zatwierdzone: 'Zatwierdzone',
  wdrozone: 'Wdrożone',
  gotowe: 'Gotowe',
};

export const TASK_EXECUTORS = ['agent', 'human'] as const;
export type TaskExecutor = (typeof TASK_EXECUTORS)[number];

export const REVIEW_STATUSES = ['oczekuje', 'zaakceptowane', 'odrzucone'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

// Kategoria zadania (Faza 4): build = "zbuduj automatyzację X dla klienta Y",
// remediation = self-healing po powiadomieniu technicznym
export const TASK_CATEGORIES = ['standard', 'build', 'remediation'] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export const TASK_CATEGORY_LABELS: Record<TaskCategory, string> = {
  standard: 'Zwykłe',
  build: 'Build',
  remediation: 'Naprawa',
};

export interface Task {
  id: string;
  contact_id: string | null;
  typ: string; // opis zadania, np. "Provisioning: Chatbot RAG"
  kategoria: TaskCategory;
  wykonawca: TaskExecutor;
  status: TaskStatus;
  diff: string | null; // podgląd zmian/efektu pracy do review
  review_status: ReviewStatus | null;
  created_at: string;
}

// --- Agent runs (Faza 4 — control plane) ---

export const RUN_STATUSES = ['running', 'done', 'failed'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const RUN_REVIEWS = [
  'oczekuje',
  'zaakceptowane',
  'odrzucone',
  'eskalowane_claude',
] as const;
export type RunReview = (typeof RUN_REVIEWS)[number];

export interface AgentRun {
  id: string;
  task_id: string;
  agent: string; // np. 'hermes-builder', 'hermes-fixer'
  status: RunStatus;
  log: string[]; // kroki pracy agenta (append-only)
  output: string | null; // kod / JSON / diff do review
  wynik_review: RunReview | null;
  koszt: number; // zł — szacunkowy koszt tokenów/API runa
  created_at: string;
  finished_at: string | null;
}

// --- Powiadomienia (Faza 2) ---

export const NOTIFICATION_TYPES = ['techniczne', 'biznes', 'agent'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_SEVERITIES = ['info', 'warn', 'krytyczne'] as const;
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

export const NOTIFICATION_STATUSES = ['nowe', 'w_toku', 'rozwiazane'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

// Akcja renderowana jako przycisk przy powiadomieniu; `action` mapuje się
// na handler w app/actions/notifications.ts
export interface NotificationAction {
  action: string; // np. 'disable_access' | 'send_reminder' | 'extend_7d'
  label: string;
  confirm?: boolean; // wymaga modala potwierdzenia (CEO)
}

export interface AppNotification {
  id: string;
  typ: NotificationType;
  severity: NotificationSeverity;
  tytul: string;
  opis: string | null;
  related_typ: string | null; // np. 'invoice' | 'contact' | 'workflow' | 'agent_run'
  related_id: string | null;
  // Faza 4 (self-healing): task remediation utworzony automatycznie
  // dla powiadomienia technicznego — spina powiadomienie z agent_runs
  remediation_task_id: string | null;
  status: NotificationStatus;
  akcje: NotificationAction[];
  created_at: string;
}

// --- Konta klientów (Faza 2 — dostęp po opłacie) ---

export interface ClientAccount {
  id: string;
  contact_id: string;
  email: string;
  active: boolean;
  must_change_password: boolean;
  created_at: string;
}

export type Role = 'ceo' | 'pracownik' | 'klient';

// --- Panel klienta (Faza 3) ---

export interface Promotion {
  tytul: string;
  opis: string;
  badge: string; // np. "-20%" / "1 MC GRATIS"
}

// Pozycja katalogu upsell: automatyzacja, której klient jeszcze nie ma,
// z rabatem na wdrożenie zależnym od wielkości posiadanego pakietu
export interface UpsellItem {
  automation: Automation;
  rabatProcent: number;
  cenaWdrozeniePoRabacie: number;
}

// --- Multi-VPS (Faza 3) ---

export interface ActivityPoint {
  data: string; // ISO date
  wykonania: number;
}

export interface ServerOverview {
  server: Server;
  workflows: IntegrationResult<N8nWorkflow[]>;
  kontakty: Contact[];
  faktury: Invoice[];
  aktywnosc: ActivityPoint[]; // wykonania workflowów w czasie (14 dni)
}

// --- Połączenia na żywo (dodatek F3 — fundament "Ekranu Kasy") ---

export interface CallRecord {
  id: string;
  numer: string; // pełny numer dzwoniącego (maskowanie w warstwie UI)
  czas: string; // ISO datetime
  wynik: 'umowiono' | 'nieumowiono';
  zrodlo: 'ada' | 'chatbot';
}

// Rekord wzbogacony o flagę "po godzinach" liczoną z business_hours klienta
export interface CallWithMeta extends CallRecord {
  poGodzinach: boolean;
}

// --- Panel Wartości (Ekran Kasy) ---

export interface VocInsight {
  temat: string;
  wystapienia: number;
  cytat: string; // przykładowa wypowiedź dzwoniącego (z transkrypcji)
}

// --- Panel Wyników (Dashboard ROI) ---

export const EVENT_TYPES = [
  'rozmowa_odebrana',
  'lead_zlapany',
  'rezerwacja',
  'sms_wyslany',
  'opinia_zebrana',
  'workflow_run',
  'blad',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_SOURCES = ['ada', 'chatbot', 'opinie', 'n8n', 'sms'] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  rozmowa_odebrana: 'Rozmowa odebrana',
  lead_zlapany: 'Lead złapany',
  rezerwacja: 'Rezerwacja',
  sms_wyslany: 'SMS wysłany',
  opinia_zebrana: 'Opinia zebrana',
  workflow_run: 'Uruchomienie workflow',
  blad: 'Błąd',
};

// Zdarzenie runtime z wdrożenia (Ada/chatbot/opinie/n8n/SMS) — źródło prawdy
// o wynikach. Zapis WYŁĄCZNIE przez /api/events/ingest (service role).
export interface AutomationEvent {
  id: string;
  contact_id: string;
  client_automation_id: string | null;
  typ: EventType;
  zrodlo: EventSource;
  minuty_oszczedzone: number;
  wartosc_pln: number;
  meta: Record<string, unknown>; // np. { po_godzinach: true }
  created_at: string;
}

// Konfiguracja wartościowania: ile minut pracy właściciela oszczędza 1 zdarzenie.
// Wszystkie kwoty = JAWNY SZACUNEK („~”): minuty/60 × stawka zł/h.
export interface EventValueConfig {
  typ: EventType;
  minuty: number;
  etykieta: string;
}

export const HEALTH_STATUSES = ['ok', 'uwaga', 'blad', 'nowa'] as const;
export type HealthStatus = (typeof HEALTH_STATUSES)[number];

export const HEALTH_LABELS: Record<HealthStatus, string> = {
  ok: 'OK',
  uwaga: 'Uwaga',
  blad: 'Błąd',
  nowa: 'Nowa',
};

export interface MonthlyReport {
  id: string;
  contact_id: string;
  okres: string; // ISO date — 1. dzień raportowanego miesiąca
  payload: Record<string, unknown>;
  wyslany_at: string | null;
  created_at: string;
}

// --- Warstwa zaufania operacyjnego (Faza 1 zaufania) ---

export const WORKFLOW_ERROR_STATUSES = ['nowy', 'w_toku', 'rozwiazany'] as const;
export type WorkflowErrorStatus = (typeof WORKFLOW_ERROR_STATUSES)[number];

export const WORKFLOW_ERROR_STATUS_LABELS: Record<WorkflowErrorStatus, string> = {
  nowy: 'Nowy',
  w_toku: 'W toku',
  rozwiazany: 'Rozwiązany',
};

// Błąd z globalnego Error-Workflow n8n (POST /api/errors/ingest, service role).
// Klient NIE widzi surowych błędów — dostaje dostępność, nie stacktrace.
export interface WorkflowError {
  id: string;
  client_automation_id: string | null;
  contact_id: string | null;
  workflow_id: string | null;
  node: string | null;
  message: string;
  severity: NotificationSeverity;
  status: WorkflowErrorStatus;
  meta: Record<string, unknown>;
  created_at: string;
}

// Monitor dostępności endpointu wdrożenia (webhook n8n, widget chatbota itd.)
export interface UptimeCheck {
  id: string;
  client_automation_id: string | null;
  contact_id: string;
  nazwa: string;
  url: string;
  method: 'GET' | 'HEAD' | 'POST';
  expected_status: number;
  interval_min: number;
  aktywny: boolean;
  last_check_at: string | null;
  last_status: number | null;
  ok: boolean | null; // null = jeszcze nie sprawdzone
  created_at: string;
}

export interface UptimePing {
  id: string;
  check_id: string;
  contact_id: string;
  ok: boolean;
  status: number | null;
  ms: number | null;
  checked_at: string;
}

// Rejestr wersji golden-templates n8n (która wersja u którego klienta)
export interface TemplateVersion {
  id: string;
  automation_id: string | null;
  nazwa: string;
  wersja: string;
  opis: string | null;
  n8n_json_ref: string | null;
  created_at: string;
}

// --- Conversations (Faza 2 zaufania — jedna skrzynka + bot AI) ---

export const CONVERSATION_CHANNELS = [
  'sms',
  'email',
  'whatsapp',
  'webchat',
  'fb',
  'ig',
  'gbp',
] as const;
export type ConversationChannel = (typeof CONVERSATION_CHANNELS)[number];

export const CHANNEL_LABELS: Record<ConversationChannel, string> = {
  sms: 'SMS',
  email: 'E-mail',
  whatsapp: 'WhatsApp',
  webchat: 'Czat WWW',
  fb: 'Facebook',
  ig: 'Instagram',
  gbp: 'Google (GBP)',
};

export const CHANNEL_ICONS: Record<ConversationChannel, string> = {
  sms: '💬',
  email: '✉️',
  whatsapp: '🟢',
  webchat: '🌐',
  fb: '📘',
  ig: '📷',
  gbp: '📍',
};

export const CONVERSATION_STATUSES = ['otwarta', 'oczekuje', 'zamknieta'] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const CONVERSATION_STATUS_LABELS: Record<ConversationStatus, string> = {
  otwarta: 'Otwarta',
  oczekuje: 'Oczekuje',
  zamknieta: 'Zamknięta',
};

// Dane rozmówcy spoza systemu (koniec-klient piszący do firmy)
export interface ConversationExternal {
  imie?: string | null;
  telefon?: string | null;
  email?: string | null;
  session_id?: string | null; // webchat
}

export interface Conversation {
  id: string;
  // Dopasowany kontakt/lead w CRM (uzupełniany po złapaniu leada)
  contact_id: string | null;
  // Firma-właściciel skrzynki: null = STRONEVO (CEO), ustawione = klient (jego panel)
  owner_contact_id: string | null;
  external: ConversationExternal;
  channel: ConversationChannel;
  status: ConversationStatus;
  assigned: string | null;
  ai_auto: boolean;
  last_msg_at: string | null;
  created_at: string;
}

export const MESSAGE_AUTHORS = ['koncowy', 'ai', 'human'] as const;
export type MessageAuthor = (typeof MESSAGE_AUTHORS)[number];

export interface Message {
  id: string;
  conversation_id: string;
  owner_contact_id: string | null; // denormalizacja pod RLS
  direction: 'in' | 'out';
  channel: ConversationChannel;
  body: string;
  media: unknown[];
  author: MessageAuthor;
  created_at: string;
}

export interface MessageTemplate {
  id: string;
  owner_contact_id: string | null; // null = szablon globalny STRONEVO
  nazwa: string;
  tresc: string;
  created_at: string;
}

// Baza wiedzy firmy do Conversation AI (RAG)
export interface KnowledgeDoc {
  id: string;
  contact_id: string | null; // null = wiedza STRONEVO (własny webchat)
  tytul: string;
  tresc: string;
  embedding?: number[] | null;
  created_at: string;
}

// --- Marketing (Faza 3 zaufania: strony, formularze, e-mail, social, opinie) ---

export const BLOCK_TYPES = [
  'hero',
  'features',
  'form',
  'cta',
  'testimonials',
  'text',
  'image',
  'pricing',
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  hero: 'Hero (nagłówek strony)',
  features: 'Atuty / usługi',
  form: 'Formularz',
  cta: 'Wezwanie do działania',
  testimonials: 'Opinie klientów',
  text: 'Tekst',
  image: 'Obraz',
  pricing: 'Cennik',
};

export const SITE_STATUSES = ['szkic', 'opublikowana', 'wylaczona'] as const;
export type SiteStatus = (typeof SITE_STATUSES)[number];

export interface Site {
  id: string;
  contact_id: string | null; // firma-właściciel (null = STRONEVO)
  nazwa: string;
  slug: string; // /s/[slug]
  domena: string | null;
  status: SiteStatus;
  theme: { accent?: string };
  created_at: string;
}

export interface SitePage {
  id: string;
  site_id: string;
  contact_id: string | null;
  sciezka: string; // '' = główna
  seo: { title?: string; description?: string };
  created_at: string;
}

export interface PageBlock {
  id: string;
  page_id: string;
  contact_id: string | null;
  typ: BlockType;
  props: Record<string, unknown>;
  kolejnosc: number;
  created_at: string;
}

export interface FormField {
  name: string;
  label: string;
  typ: 'text' | 'email' | 'tel' | 'textarea' | 'select';
  required?: boolean;
  options?: string[];
}

export interface FormDef {
  id: string;
  contact_id: string | null;
  nazwa: string;
  pola: FormField[];
  webhook_url: string | null; // konfiguracja OPERATORA (n8n on-submit)
  zgoda_tekst: string;
  created_at: string;
}

export interface FormSubmission {
  id: string;
  form_id: string;
  contact_id: string | null;
  dane: Record<string, unknown>;
  zgoda_rodo: boolean;
  lead_id: string | null;
  created_at: string;
}

export interface EmailList {
  id: string;
  contact_id: string | null;
  nazwa: string;
  created_at: string;
}

export interface EmailContact {
  id: string;
  list_id: string;
  contact_id: string | null;
  email: string;
  imie: string | null;
  zgoda: boolean;
  opt_out: boolean;
  created_at: string;
}

export const CAMPAIGN_STATUSES = ['szkic', 'zaplanowana', 'wysylanie', 'wyslana'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export interface EmailCampaign {
  id: string;
  contact_id: string | null;
  list_id: string | null;
  temat: string;
  bloki: { typ: BlockType; props: Record<string, unknown> }[];
  status: CampaignStatus;
  zaplanowano: string | null;
  wyslano_at: string | null;
  created_at: string;
}

export interface EmailSend {
  id: string;
  campaign_id: string;
  contact_id: string | null;
  email: string;
  token: string;
  sent: boolean;
  opened_at: string | null;
  clicked_at: string | null;
  created_at: string;
}

export const SOCIAL_CHANNELS = ['fb', 'ig', 'gbp', 'linkedin'] as const;
export type SocialChannel = (typeof SOCIAL_CHANNELS)[number];

export const SOCIAL_CHANNEL_LABELS: Record<SocialChannel, string> = {
  fb: 'Facebook',
  ig: 'Instagram',
  gbp: 'Google (profil firmy)',
  linkedin: 'LinkedIn',
};

export const SOCIAL_POST_STATUSES = ['szkic', 'zaplanowany', 'opublikowany', 'blad'] as const;
export type SocialPostStatus = (typeof SOCIAL_POST_STATUSES)[number];

export interface SocialPost {
  id: string;
  contact_id: string | null;
  kanaly: SocialChannel[];
  tresc: string;
  media: { url: string }[];
  zaplanowano: string | null;
  status: SocialPostStatus;
  wynik: Record<string, unknown>;
  created_at: string;
}

export interface ReviewRequest {
  id: string;
  contact_id: string | null;
  external: { imie?: string | null; telefon?: string | null; email?: string | null };
  kanal: 'sms' | 'email';
  review_link: string | null;
  status: 'wyslana' | 'blad';
  created_at: string;
}

export const REVIEW_STATUSES_F3 = ['nowa', 'szkic', 'odpowiedziano'] as const;
export type ReviewStatusF3 = (typeof REVIEW_STATUSES_F3)[number];

export interface Review {
  id: string;
  contact_id: string | null;
  zrodlo: 'google' | 'fb';
  autor: string | null;
  ocena: number | null;
  tresc: string | null;
  odpowiedz: string | null;
  status: ReviewStatusF3;
  external_id: string | null;
  created_at: string;
}

// --- Commerce (Faza 4 zaufania: płatności, subskrypcje, kursy) ---
// UWAGA: prawdziwe pieniądze — kwoty DOKŁADNE (nie ~szacunek), webhooki
// z weryfikacją podpisu, zapisy wyłącznie service role.

export const PAYMENT_PROVIDERS = ['p24', 'payu', 'stripe', 'mock'] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export const PAYMENT_PROVIDER_LABELS: Record<PaymentProvider, string> = {
  p24: 'Przelewy24',
  payu: 'PayU',
  stripe: 'Stripe (karta)',
  mock: 'Symulacja (demo)',
};

export const PAYMENT_STATUSES = ['nowa', 'oczekuje', 'oplacona', 'blad', 'zwrot'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface Payment {
  id: string;
  contact_id: string | null; // firma-właściciel (tenant)
  payment_link_id: string | null;
  subscription_id: string | null;
  kwota: number; // zł, DOKŁADNIE
  waluta: string;
  status: PaymentStatus;
  provider: PaymentProvider;
  external_id: string | null; // id transakcji u providera
  meta: Record<string, unknown>;
  created_at: string;
  paid_at: string | null;
}

export const PAYMENT_LINK_STATUSES = ['aktywny', 'oplacony', 'wygasly'] as const;
export type PaymentLinkStatus = (typeof PAYMENT_LINK_STATUSES)[number];

// Link płatniczy (text-to-pay): kapability URL /pay/[token], wysyłany SMS-em
export interface PaymentLink {
  id: string;
  contact_id: string | null;
  kwota: number;
  waluta: string;
  opis: string;
  token: string;
  status: PaymentLinkStatus;
  external: { imie?: string | null; telefon?: string | null; email?: string | null };
  meta: { course_id?: string | null; invoice_id?: string | null; [key: string]: unknown };
  payment_id: string | null;
  created_at: string;
  paid_at: string | null;
}

export const SUBSCRIPTION_CYCLES = ['miesieczny', 'roczny'] as const;
export type SubscriptionCycle = (typeof SUBSCRIPTION_CYCLES)[number];

export const SUBSCRIPTION_STATUSES = ['aktywna', 'zalegla', 'anulowana'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export interface Subscription {
  id: string;
  contact_id: string | null;
  client_automation_id: string | null; // spięcie z abonamentem wdrożenia
  plan: string;
  kwota: number; // zł / cykl, DOKŁADNIE
  cykl: SubscriptionCycle;
  status: SubscriptionStatus;
  provider: PaymentProvider;
  provider_ref: string | null; // np. Stripe customer/subscription id
  next_charge: string | null; // ISO date
  created_at: string;
}

export interface Course {
  id: string;
  contact_id: string | null; // firma-właściciel kursu
  tytul: string;
  opis: string | null;
  cena: number | null; // zł (null = kurs zamknięty, dostęp nadaje operator/klient)
  created_at: string;
}

export interface Lesson {
  id: string;
  course_id: string;
  contact_id: string | null; // denorm pod RLS
  tytul: string;
  tresc: string | null;
  wideo_url: string | null;
  kolejnosc: number;
  created_at: string;
}

// Dostęp kursanta (klient końcowy firmy): kapability URL /kurs/[token]
export interface Enrollment {
  id: string;
  course_id: string;
  contact_id: string | null; // denorm (tenant)
  external: { imie?: string | null; email?: string | null };
  token: string;
  payment_id: string | null; // dostęp po opłacie
  status: 'aktywny' | 'wstrzymany';
  created_at: string;
}

export interface CourseProgress {
  id: string;
  enrollment_id: string;
  lesson_id: string;
  ukonczona: boolean;
  updated_at: string;
}

// --- Produktyzacja + głębia CRM (Faza 5 zaufania) ---

// Snapshot: zrzut działającego setupu klienta (automatyzacje + szablony +
// wiedza bota + monitoring) → wdrożenie 1-klik u nowego klienta (operator).
export interface SnapshotAutomation {
  automation_id: string;
  nazwa: string;
  template_version: string | null;
  typ: string; // typ z automations_catalog (recepcja/chatbot/...)
}

export interface SnapshotPayload {
  zrodlo_contact_id: string | null;
  zrodlo_nazwa: string;
  automatyzacje: SnapshotAutomation[];
  szablony: { nazwa: string; tresc: string }[];
  wiedza: { tytul: string; tresc: string }[];
  uptime: { nazwa: string; url: string; interval_min: number }[];
  pipeline: { statusy: readonly string[] };
  [key: string]: unknown;
}

export interface Snapshot {
  id: string;
  nazwa: string;
  opis: string | null;
  payload: SnapshotPayload;
  created_at: string;
}

// Custom objects: struktura (schema) = OPERATOR; rekordy (dane) = funkcja użytkowa
export interface CustomObjectField {
  name: string;
  label: string;
  typ: 'text' | 'number' | 'date';
}

export interface CustomObject {
  id: string;
  owner_contact_id: string | null; // tenant (null = STRONEVO)
  nazwa: string;
  ikona: string | null;
  schema: CustomObjectField[];
  created_at: string;
}

export interface CustomObjectRecord {
  id: string;
  object_id: string;
  owner_contact_id: string | null; // denorm pod RLS
  contact_id: string | null; // powiązany kontakt/lead w CRM
  dane: Record<string, unknown>;
  created_at: string;
}

// Smart lists: zapisane filtry kontaktów
export interface SmartListFilter {
  status_pipeline?: string[];
  typ?: string[];
  zrodlo_contains?: string;
  miasto?: string;
  branza_contains?: string;
  ma_telefon?: boolean;
  ma_email?: boolean;
  [key: string]: unknown;
}

export interface SmartList {
  id: string;
  owner_contact_id: string | null;
  nazwa: string;
  filtr: SmartListFilter;
  created_at: string;
}

// Kalendarze bookingu (typy GHL: round-robin / collective / class)
export const CALENDAR_TYPES = ['osobisty', 'round_robin', 'collective', 'class'] as const;
export type CalendarType = (typeof CALENDAR_TYPES)[number];

export const CALENDAR_TYPE_LABELS: Record<CalendarType, string> = {
  osobisty: 'Osobisty (1 osoba)',
  round_robin: 'Round-robin (rotacja zespołu)',
  collective: 'Zespołowy (wszyscy naraz)',
  class: 'Grupowy (klasa, limit miejsc)',
};

export interface BookingCalendar {
  id: string;
  owner_contact_id: string | null;
  nazwa: string;
  slug: string; // publiczny widget /rezerwacja/[slug]
  typ: CalendarType;
  slot_min: number; // długość slotu w minutach
  capacity: number; // class: limit miejsc na slot (inne typy: 1)
  aktywny: boolean;
  created_at: string;
}

export interface CalendarMember {
  id: string;
  calendar_id: string;
  owner_contact_id: string | null;
  nazwa: string;
  kolejnosc: number;
  created_at: string;
}

// Dostępność: dzień tygodnia (0=nd wg getDay()) + zakres godzin
export interface CalendarAvailability {
  id: string;
  calendar_id: string;
  owner_contact_id: string | null;
  dzien: number; // 0-6 (getDay: 0=niedziela)
  od: string; // 'HH:MM'
  do: string; // 'HH:MM'
}

export interface Booking {
  id: string;
  calendar_id: string;
  owner_contact_id: string | null;
  member_id: string | null; // round-robin: przydzielony członek
  external: { imie?: string | null; telefon?: string | null; email?: string | null };
  start: string; // ISO datetime
  koniec: string;
  status: 'potwierdzona' | 'odwolana';
  created_at: string;
}

// Ad Manager (opcjonalny): kampanie Meta/Google — uruchomienie/raport via n8n
export const AD_CHANNELS = ['meta', 'google'] as const;
export type AdChannel = (typeof AD_CHANNELS)[number];

export interface AdCampaign {
  id: string;
  owner_contact_id: string | null;
  kanal: AdChannel;
  nazwa: string;
  budzet_dzienny: number; // zł
  status: 'szkic' | 'aktywna' | 'wstrzymana';
  segment: AudienceSegment | null; // spięcie z /audiencje
  external_id: string | null; // id kampanii w Meta/Google
  metryki: { wydano?: number; wyswietlenia?: number; klikniecia?: number; leady?: number };
  created_at: string;
}

// --- Remarketing / Meta Custom Audiences (Faza 3) ---

export const AUDIENCE_SEGMENTS = ['nie_odebral', 'piec', 'klienci_upsell'] as const;
export type AudienceSegment = (typeof AUDIENCE_SEGMENTS)[number];

export const AUDIENCE_SEGMENT_META: Record<
  AudienceSegment,
  { label: string; opis: string }
> = {
  nie_odebral: {
    label: 'Próba kontaktu / nie odebrał',
    opis: 'Kontakty w statusie PRÓBA_KONTAKTU — remarketing zamiast kolejnego telefonu.',
  },
  piec: {
    label: 'Piec (odłożone)',
    opis: 'Kontakty w statusie PIEC — podgrzewanie do powrotu rozmów.',
  },
  klienci_upsell: {
    label: 'Klienci (upsell)',
    opis: 'Aktywni klienci — kampanie dosprzedażowe kolejnych automatyzacji.',
  },
};

