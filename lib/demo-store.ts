// Tryb demo — działa bez skonfigurowanego Supabase.
// Dane trzymane w pamięci procesu (znikają po restarcie serwera).
import {
  AgentRun,
  AppNotification,
  Automation,
  AutomationEvent,
  ClientAccount,
  ClientAutomation,
  ClientCredential,
  ClientRequirement,
  AdCampaign,
  Booking,
  BookingCalendar,
  CalendarAvailability,
  CalendarMember,
  Contact,
  ContactInput,
  Contract,
  Conversation,
  Course,
  CustomObject,
  CustomObjectRecord,
  SmartList,
  Snapshot,
  CourseProgress,
  EmailCampaign,
  Enrollment,
  Lesson,
  Payment,
  PaymentLink,
  Subscription,
  EmailContact,
  EmailList,
  EmailSend,
  EventType,
  EventSource,
  FormDef,
  FormSubmission,
  Invoice,
  KnowledgeDoc,
  Message,
  MessageTemplate,
  PageBlock,
  Review,
  ReviewRequest,
  Site,
  SitePage,
  SocialPost,
  LeadActivity,
  MonthlyReport,
  Server,
  Task,
  TemplateVersion,
  UptimeCheck,
  UptimePing,
  WorkflowError,
} from './types';
import { simulatePing } from './uptime';
import {
  DEFAULT_EVENT_VALUES,
  buildMonthlyReportPayload,
  minutyForTyp,
  monthRange,
  inRange,
  stawkaPlnH,
  wycenaZdarzenia,
} from './wyniki';
// Uwaga: getDb() reseeduje bazę przy zmianie kształtu (sprawdzanie kluczy),
// więc dev po dodaniu kolekcji nie wymaga restartu procesu.

// Podbij przy każdej zmianie kształtu seedów — wymusza reseed bez restartu
const SEED_VERSION = 16;

interface DemoDb {
  version: number;
  servers: Server[];
  contacts: Contact[];
  automations: Automation[];
  clientAutomations: ClientAutomation[];
  invoices: Invoice[];
  contracts: Contract[];
  tasks: Task[];
  agentRuns: AgentRun[];
  notifications: AppNotification[];
  clientAccounts: ClientAccount[];
  clientCredentials: ClientCredential[];
  leadActivities: LeadActivity[];
  automationEvents: AutomationEvent[];
  monthlyReports: MonthlyReport[];
  workflowErrors: WorkflowError[];
  uptimeChecks: UptimeCheck[];
  uptimePings: UptimePing[];
  templateVersions: TemplateVersion[];
  conversations: Conversation[];
  messages: Message[];
  messageTemplates: MessageTemplate[];
  knowledgeDocs: KnowledgeDoc[];
  sites: Site[];
  sitePages: SitePage[];
  pageBlocks: PageBlock[];
  forms: FormDef[];
  formSubmissions: FormSubmission[];
  emailLists: EmailList[];
  emailContacts: EmailContact[];
  emailCampaigns: EmailCampaign[];
  emailSends: EmailSend[];
  socialPosts: SocialPost[];
  reviewRequests: ReviewRequest[];
  reviews: Review[];
  payments: Payment[];
  paymentLinks: PaymentLink[];
  subscriptions: Subscription[];
  courses: Course[];
  lessons: Lesson[];
  enrollments: Enrollment[];
  courseProgress: CourseProgress[];
  snapshots: Snapshot[];
  customObjects: CustomObject[];
  customObjectRecords: CustomObjectRecord[];
  smartLists: SmartList[];
  bookingCalendars: BookingCalendar[];
  calendarMembers: CalendarMember[];
  calendarAvailability: CalendarAvailability[];
  bookings: Booking[];
  adCampaigns: AdCampaign[];
  seq: number;
}

const SEED_SERVER: Server = {
  id: 'srv-1',
  nazwa: 'Serwer 1 (stronevo-prod)',
  host: 'vps.stronevo.pl',
  port: 22,
  notatka: 'Główny VPS produkcyjny — n8n, Coolify, klienci',
  status: 'aktywny',
  n8n_url: null,
  n8n_api_key: null,
};

const SEED_CONTACTS: Contact[] = [
  {
    id: 'c-1',
    server_id: 'srv-1',
    typ: 'klient',
    imie: 'Gwidon',
    firma: 'Mercatura (ppoż.)',
    nip: null,
    adres: 'ul. Przykładowa 12, 60-001 Poznań',
    branza: 'ochrona przeciwpożarowa',
    miasto: 'Poznań',
    telefon: '+48 600 000 001',
    email: 'biuro@mercatura.example',
    zrodlo: 'polecenie',
    status_pipeline: 'KLIENT',
    nastepna_akcja: 'Follow-up po evencie Tor Poznań',
    nastepna_akcja_data: '2026-07-14',
    data_ostatniego_kontaktu: '2026-07-02',
    notatki: 'Zaproszenie PDF dostarczone. Potencjał: strona + chatbot RAG.',
    business_hours: {
      dni: {
        pon: ['8:00', '16:00'],
        wt: ['8:00', '16:00'],
        sr: ['8:00', '16:00'],
        czw: ['8:00', '16:00'],
        pt: ['8:00', '16:00'],
        sob: null,
        nd: null,
      },
      wyjatki: [],
    },
    srednia_wartosc_wizyty: 500,
    auto_followup_sms: false,
    przypisany_do: null,
    created_at: '2026-06-20T10:00:00Z',
  },
  {
    id: 'c-2',
    server_id: null,
    typ: 'lead',
    imie: 'Marek',
    firma: 'Balustrady Nowak',
    nip: null,
    adres: null,
    branza: 'balustrady / metaloplastyka',
    miasto: 'Kalisz',
    telefon: '+48 600 000 002',
    email: null,
    zrodlo: 'OLX',
    status_pipeline: 'PROBA_KONTAKTU',
    nastepna_akcja: 'Drugi telefon (nie odbiera przed 16)',
    nastepna_akcja_data: '2026-07-04',
    data_ostatniego_kontaktu: '2026-07-01',
    notatki: null,
    business_hours: null,
    srednia_wartosc_wizyty: null,
    auto_followup_sms: false,
    przypisany_do: null,
    created_at: '2026-06-28T09:00:00Z',
  },
  {
    id: 'c-3',
    server_id: null,
    typ: 'prospekt',
    imie: 'Anna',
    firma: 'Klinika Uśmiech',
    nip: '7791234567',
    adres: 'ul. Zdrowa 5, 61-200 Poznań',
    branza: 'stomatologia',
    miasto: 'Poznań',
    telefon: '+48 600 000 003',
    email: 'rejestracja@usmiech.example',
    zrodlo: 'kampania Meta',
    status_pipeline: 'UMOWIONY',
    nastepna_akcja: 'Demo chatbota rezerwacji',
    nastepna_akcja_data: '2026-07-07',
    data_ostatniego_kontaktu: '2026-06-30',
    notatki: 'Zainteresowana automatyzacją rejestracji pacjentów.',
    business_hours: {
      dni: {
        pon: ['9:00', '18:00'],
        wt: ['9:00', '18:00'],
        sr: ['9:00', '18:00'],
        czw: ['9:00', '18:00'],
        pt: ['9:00', '18:00'],
        sob: ['9:00', '14:00'],
        nd: null,
      },
      wyjatki: [{ data: '2026-08-15', opis: 'Wniebowzięcie NMP' }],
    },
    srednia_wartosc_wizyty: 350,
    auto_followup_sms: true,
    przypisany_do: 'Ty (CEO)',
    created_at: '2026-06-25T14:30:00Z',
  },
  {
    id: 'c-4',
    server_id: null,
    typ: 'lead',
    imie: 'Tomasz',
    firma: 'Hydraulik24 Kowalski',
    nip: null,
    adres: null,
    branza: 'hydraulika',
    miasto: 'Wrocław',
    telefon: '+48 600 000 004',
    email: null,
    zrodlo: 'formularz /wycena/',
    status_pipeline: 'NOWY',
    nastepna_akcja: 'Pierwszy kontakt telefoniczny',
    nastepna_akcja_data: '2026-07-03',
    data_ostatniego_kontaktu: null,
    notatki: null,
    business_hours: null,
    srednia_wartosc_wizyty: null,
    auto_followup_sms: false,
    przypisany_do: null,
    created_at: '2026-07-02T08:15:00Z',
  },
  {
    id: 'c-5',
    server_id: null,
    typ: 'prospekt',
    imie: 'Karolina',
    firma: 'Studio Fryzur KaEs',
    nip: null,
    adres: 'ul. Modna 3, 61-800 Poznań',
    branza: 'beauty',
    miasto: 'Poznań',
    telefon: '+48 600 000 005',
    email: 'kaes@salon.example',
    zrodlo: 'Oferteo',
    status_pipeline: 'OFERTA',
    nastepna_akcja: 'Przypomnienie o ofercie (pakiet Standard)',
    nastepna_akcja_data: '2026-07-05',
    data_ostatniego_kontaktu: '2026-06-29',
    notatki: 'Oferta wysłana 29.06 — strona + booking Cal.com.',
    business_hours: null,
    srednia_wartosc_wizyty: null,
    auto_followup_sms: false,
    przypisany_do: null,
    created_at: '2026-06-22T11:00:00Z',
  },
  {
    id: 'c-6',
    server_id: null,
    typ: 'lead',
    imie: 'Piotr',
    firma: 'Transport Bagiński',
    nip: null,
    adres: null,
    branza: 'transport',
    miasto: 'Gniezno',
    telefon: '+48 600 000 006',
    email: null,
    zrodlo: 'zimny telefon',
    status_pipeline: 'PIEC',
    nastepna_akcja: 'Odezwać się we wrześniu (sezon)',
    nastepna_akcja_data: '2026-09-01',
    data_ostatniego_kontaktu: '2026-06-18',
    notatki: 'Teraz brak budżetu, wróci temat po wakacjach.',
    business_hours: null,
    srednia_wartosc_wizyty: null,
    auto_followup_sms: false,
    przypisany_do: null,
    created_at: '2026-06-18T13:00:00Z',
  },
  {
    id: 'c-7',
    server_id: 'srv-1',
    typ: 'klient',
    imie: 'Robert',
    firma: 'Warsztat MotoMax',
    nip: '6181234567',
    adres: 'ul. Warsztatowa 8, 62-800 Kalisz',
    branza: 'motoryzacja',
    miasto: 'Kalisz',
    telefon: '+48 600 000 007',
    email: 'serwis@motomax.example',
    zrodlo: 'kampania Meta',
    status_pipeline: 'KLIENT',
    nastepna_akcja: 'Miesięczny check-in po raporcie wyników',
    nastepna_akcja_data: '2026-08-03',
    data_ostatniego_kontaktu: '2026-06-28',
    notatki: 'Recepcja AI + workflow przypomnień o przeglądach. Zadowolony, potencjał na opinie.',
    business_hours: {
      dni: {
        pon: ['8:00', '17:00'],
        wt: ['8:00', '17:00'],
        sr: ['8:00', '17:00'],
        czw: ['8:00', '17:00'],
        pt: ['8:00', '17:00'],
        sob: ['9:00', '13:00'],
        nd: null,
      },
      wyjatki: [],
    },
    srednia_wartosc_wizyty: 450,
    auto_followup_sms: true,
    przypisany_do: null,
    stawka_pln_h: 80, // nadpisuje globalną stawkę zł/h w Panelu Wyników
    created_at: '2026-05-20T10:00:00Z',
  },
  // ===== Leady KLIENTA (Mercatura, c-1) — jego własny CRM w panelu klienta =====
  {
    id: 'cl-1',
    server_id: null,
    typ: 'lead',
    imie: 'Restauracja Stary Młyn',
    firma: 'Stary Młyn Sp. z o.o.',
    nip: null,
    adres: null,
    branza: 'gastronomia',
    miasto: 'Poznań',
    telefon: '+48 610 000 011',
    email: 'kontakt@starymlyn.example',
    zrodlo: 'panel-klienta',
    status_pipeline: 'NOWY',
    nastepna_akcja: 'Wysłać ofertę na przegląd gaśnic',
    nastepna_akcja_data: '2026-07-08',
    data_ostatniego_kontaktu: null,
    notatki: 'Zapytanie o przegląd roczny gaśnic i hydrantów.',
    business_hours: null,
    srednia_wartosc_wizyty: 1200,
    auto_followup_sms: false,
    przypisany_do: null,
    owner_contact_id: 'c-1',
    created_at: '2026-07-01T09:00:00Z',
  },
  {
    id: 'cl-2',
    server_id: null,
    typ: 'lead',
    imie: 'Hotel Panorama',
    firma: 'Panorama Hotele',
    nip: null,
    adres: null,
    branza: 'hotelarstwo',
    miasto: 'Gniezno',
    telefon: '+48 610 000 012',
    email: 'recepcja@panorama.example',
    zrodlo: 'panel-klienta',
    status_pipeline: 'PROBA_KONTAKTU',
    nastepna_akcja: 'Oddzwonić — nie odebrali',
    nastepna_akcja_data: '2026-07-04',
    data_ostatniego_kontaktu: '2026-07-02',
    notatki: 'Duży obiekt, potencjał na stały serwis ppoż.',
    business_hours: null,
    srednia_wartosc_wizyty: 4800,
    auto_followup_sms: false,
    przypisany_do: null,
    owner_contact_id: 'c-1',
    created_at: '2026-06-29T12:00:00Z',
  },
  {
    id: 'cl-3',
    server_id: null,
    typ: 'lead',
    imie: 'Magazyn LogiPol',
    firma: 'LogiPol Logistyka',
    nip: null,
    adres: null,
    branza: 'logistyka',
    miasto: 'Poznań',
    telefon: '+48 610 000 013',
    email: 'bhp@logipol.example',
    zrodlo: 'panel-klienta',
    status_pipeline: 'KLIENT',
    nastepna_akcja: 'Kolejny przegląd — przypomnienie za rok',
    nastepna_akcja_data: '2027-06-01',
    data_ostatniego_kontaktu: '2026-06-20',
    notatki: 'Podpisana umowa serwisowa. Utrzymanie + upsell szkoleń.',
    business_hours: null,
    srednia_wartosc_wizyty: 9000,
    auto_followup_sms: false,
    przypisany_do: null,
    owner_contact_id: 'c-1',
    created_at: '2026-05-15T10:00:00Z',
  },
];

// Zbiorczy zestaw wymagań dla pakietów (kompendium) — używany przez auto-5/6/7
const PAKIET_WYMAGANIA: ClientRequirement[] = [
  { pozycja: 'Dane firmy do umowy/faktury (NIP, adres)', metoda: 'sami', szczegoly: 'Uzupełniane w CRM / pobierane z GUS przy prospektowaniu.' },
  { pozycja: 'Dostęp do kanałów w zakresie pakietu (kalendarz, Google Business, strona)', metoda: 'wideo', szczegoly: 'Jedno spotkanie wdrożeniowe obejmuje wszystkie podpięcia.' },
  { pozycja: 'Materiały: cennik, oferta, FAQ, logo, zdjęcia', metoda: 'przeslij' },
  { pozycja: 'Zgody RODO (nagrywanie, kontakt marketingowy)', metoda: 'poradnik' },
];

const SEED_AUTOMATIONS: Automation[] = [
  {
    id: 'auto-1',
    nazwa: 'Recepcja AI',
    typ: 'recepcja',
    opis: 'Głosowa recepcjonistka AI — odbiera telefony 24/7, umawia wizyty w kalendarzu, wysyła SMS z potwierdzeniem.',
    cena_wdrozenie: 1490,
    cena_mc: 599,
    template_config: { stack: ['vapi', 'cal.com', 'n8n'], jezyk: 'pl' },
    wymagania_od_klienta: [
      { pozycja: 'Numer telefonu klientów + zgoda na przekierowanie u operatora', metoda: 'przeslij', szczegoly: 'Numer, na który dzwonią klienci; przekierowanie ustawia operator.' },
      { pozycja: 'Dostęp do kalendarza rezerwacji (Google Calendar / Cal.com)', metoda: 'wideo', szczegoly: 'Podpinamy kalendarz wspólnie na 20-min spotkaniu.' },
      { pozycja: 'Zakres usług, czasy trwania i ceny do umawiania', metoda: 'przeslij' },
      { pozycja: 'Zasady umawiania, godziny, wyjątki, FAQ', metoda: 'poradnik', szczegoly: 'Wypełnij szablon rozmowy (wyślemy formularz).' },
      { pozycja: 'Zgoda na nagrywanie rozmów (RODO)', metoda: 'poradnik' },
    ],
  },
  {
    id: 'auto-2',
    nazwa: 'Chatbot RAG',
    typ: 'chatbot',
    opis: 'Chatbot na stronie WWW odpowiadający z wiedzy firmy (cennik, oferta, FAQ). Zbiera leady po godzinach.',
    cena_wdrozenie: 1490,
    cena_mc: 290,
    template_config: { stack: ['n8n', 'supabase-pgvector', 'claude'], widget: true },
    wymagania_od_klienta: [
      { pozycja: 'Materiały do bazy wiedzy: cennik, oferta, FAQ, regulaminy', metoda: 'przeslij', szczegoly: 'Dokumenty/linki, z których bot ma odpowiadać.' },
      { pozycja: 'Dostęp do strony WWW (wpięcie widgetu)', metoda: 'wideo', szczegoly: 'Na spotkaniu wpinamy skrypt lub prosimy o dostęp do CMS.' },
      { pozycja: 'Adres e-mail na leady zebrane po godzinach', metoda: 'przeslij' },
      { pozycja: 'Ton komunikacji i tematy, których bot ma unikać', metoda: 'poradnik' },
    ],
  },
  {
    id: 'auto-3',
    nazwa: 'Opinie AI',
    typ: 'opinie',
    opis: 'Automatyczne zbieranie opinii Google po usłudze (SMS/e-mail) + monitoring i szkice odpowiedzi na opinie.',
    cena_wdrozenie: 800,
    cena_mc: 190,
    template_config: { stack: ['n8n', 'google-business'], kanaly: ['sms', 'email'] },
    wymagania_od_klienta: [
      { pozycja: 'Dostęp menedżera do Google Business Profile', metoda: 'wideo', szczegoly: 'Nadanie dostępu lub konfiguracja wspólnie.' },
      { pozycja: 'Baza kontaktów klientów (telefon/e-mail) do prośby o opinię', metoda: 'przeslij', szczegoly: 'Zgodnie z RODO — tylko klienci po usłudze.' },
      { pozycja: 'Preferowany szablon prośby i moment wysyłki', metoda: 'poradnik' },
    ],
  },
  {
    id: 'auto-4',
    nazwa: 'Automatyzacja n8n',
    typ: 'n8n',
    opis: 'Dedykowany workflow n8n pod proces klienta — integracje, powiadomienia, raporty. Wycena wg złożoności.',
    cena_wdrozenie: 690,
    cena_mc: 190,
    template_config: { stack: ['n8n'], custom: true },
    wymagania_od_klienta: [
      { pozycja: 'Opis procesu do zautomatyzowania (krok po kroku)', metoda: 'wideo', szczegoly: 'Na spotkaniu mapujemy proces i integracje.' },
      { pozycja: 'Dostępy do systemów w integracji (klucze API / logowania)', metoda: 'przeslij', szczegoly: 'Bezpieczny kanał; minimalne uprawnienia.' },
      { pozycja: 'Przykładowe dane wejściowe i oczekiwany wynik', metoda: 'przeslij' },
    ],
  },
  {
    id: 'auto-5',
    nazwa: 'Pakiet Starter',
    typ: 'pakiet',
    opis: 'Wejście w automatyzację: chatbot RAG lub recepcja w podstawie + zbieranie leadów. Dla małych firm.',
    cena_wdrozenie: 990,
    cena_mc: 449,
    template_config: { pakiet: 'starter' },
    wymagania_od_klienta: PAKIET_WYMAGANIA,
  },
  {
    id: 'auto-6',
    nazwa: 'Pakiet Pro',
    typ: 'pakiet',
    opis: 'Recepcja AI + chatbot + opinie w jednym — pełna obsługa kontaktu i reputacji. Najczęściej wybierany.',
    cena_wdrozenie: 1490,
    cena_mc: 599,
    template_config: { pakiet: 'pro' },
    wymagania_od_klienta: PAKIET_WYMAGANIA,
  },
  {
    id: 'auto-7',
    nazwa: 'Pakiet Premium',
    typ: 'pakiet',
    opis: 'Wszystko z Pro + dedykowane automatyzacje n8n i priorytetowe wsparcie. Dla firm z większym ruchem.',
    cena_wdrozenie: 2900,
    cena_mc: 1490,
    template_config: { pakiet: 'premium' },
    wymagania_od_klienta: PAKIET_WYMAGANIA,
  },
];

const SEED_CLIENT_AUTOMATIONS: ClientAutomation[] = [
  {
    id: 'ca-1',
    contact_id: 'c-1',
    automation_id: 'auto-2',
    n8n_workflow_id: 'wf-1',
    status: 'active',
    data_startu: '2026-06-25',
    template_version: 'chatbot-rag@1.2.0',
    created_at: '2026-06-22T10:00:00Z',
  },
  {
    id: 'ca-2',
    contact_id: 'c-1',
    automation_id: 'auto-3',
    n8n_workflow_id: 'wf-2',
    status: 'active',
    data_startu: '2026-06-28',
    template_version: 'opinie-ai@1.0.3',
    created_at: '2026-06-26T09:00:00Z',
  },
  {
    id: 'ca-3',
    contact_id: 'c-7',
    automation_id: 'auto-1',
    n8n_workflow_id: 'wf-3',
    status: 'active',
    data_startu: '2026-05-25',
    // celowo STARA wersja — widok w /agenci ma pokazać „wymaga aktualizacji"
    template_version: 'recepcja-ai@2.0.0',
    created_at: '2026-05-22T10:00:00Z',
  },
  {
    id: 'ca-4',
    contact_id: 'c-7',
    automation_id: 'auto-4',
    n8n_workflow_id: 'wf-4',
    status: 'active',
    data_startu: '2026-06-01',
    template_version: 'n8n-custom@1.0.0',
    created_at: '2026-05-28T10:00:00Z',
  },
];

// ===== FAZA 1 ZAUFANIA — seedy: wersje szablonów, błędy, uptime, dostępy =====

const SEED_TEMPLATE_VERSIONS: TemplateVersion[] = [
  {
    id: 'tv-1',
    automation_id: 'auto-1',
    nazwa: 'recepcja-ai',
    wersja: '2.1.0',
    opis: 'Recepcja AI: Vapi + Cal.com + SMS potwierdzenia; poprawka slotów przy kolizji',
    n8n_json_ref: 'templates/recepcja-ai-2.1.0.json',
    created_at: '2026-06-20T10:00:00Z',
  },
  {
    id: 'tv-2',
    automation_id: 'auto-1',
    nazwa: 'recepcja-ai',
    wersja: '2.0.0',
    opis: 'Recepcja AI: wersja bazowa Vapi + Cal.com',
    n8n_json_ref: 'templates/recepcja-ai-2.0.0.json',
    created_at: '2026-05-10T10:00:00Z',
  },
  {
    id: 'tv-3',
    automation_id: 'auto-2',
    nazwa: 'chatbot-rag',
    wersja: '1.2.0',
    opis: 'Chatbot RAG: pgvector + Claude; leady po godzinach → e-mail + event',
    n8n_json_ref: 'templates/chatbot-rag-1.2.0.json',
    created_at: '2026-06-15T10:00:00Z',
  },
  {
    id: 'tv-4',
    automation_id: 'auto-3',
    nazwa: 'opinie-ai',
    wersja: '1.0.3',
    opis: 'Opinie: monitor Google Business + SMS prośba po usłudze',
    n8n_json_ref: 'templates/opinie-ai-1.0.3.json',
    created_at: '2026-06-10T10:00:00Z',
  },
  {
    id: 'tv-5',
    automation_id: 'auto-4',
    nazwa: 'n8n-custom',
    wersja: '1.0.0',
    opis: 'Baza pod dedykowane workflow (error handler + event ingest wpięte)',
    n8n_json_ref: 'templates/n8n-custom-1.0.0.json',
    created_at: '2026-05-28T10:00:00Z',
  },
];

const SEED_WORKFLOW_ERRORS: WorkflowError[] = [
  {
    id: 'we-1',
    client_automation_id: 'ca-3',
    contact_id: 'c-7',
    workflow_id: 'wf-3',
    node: 'HTTP Request — Cal.com',
    message: 'Webhook rezerwacji zwrócił HTTP 500 (timeout po stronie Cal.com)',
    severity: 'warn',
    status: 'nowy',
    meta: { execution_id: 'exec-88123' },
    created_at: new Date(Date.now() - 20 * 3_600_000).toISOString(),
  },
  {
    id: 'we-2',
    client_automation_id: 'ca-1',
    contact_id: 'c-1',
    workflow_id: 'wf-1',
    node: 'Supabase — insert lead',
    message: 'Duplicate key przy zapisie leada (poprawione deduplikacją w 1.2.0)',
    severity: 'warn',
    status: 'rozwiazany',
    meta: {},
    created_at: new Date(Date.now() - 5 * 24 * 3_600_000).toISOString(),
  },
];

const SEED_UPTIME_CHECKS: UptimeCheck[] = [
  {
    id: 'uc-1',
    client_automation_id: 'ca-1',
    contact_id: 'c-1',
    nazwa: 'Chatbot Mercatura — webhook',
    url: 'https://n8n.stronevo.pl/webhook/mercatura-chat/health',
    method: 'GET',
    expected_status: 200,
    interval_min: 5,
    aktywny: true,
    last_check_at: null,
    last_status: null,
    ok: null,
    created_at: '2026-06-25T10:00:00Z',
  },
  {
    id: 'uc-2',
    client_automation_id: 'ca-2',
    contact_id: 'c-1',
    nazwa: 'Opinie Mercatura — workflow',
    url: 'https://n8n.stronevo.pl/webhook/mercatura-opinie/health',
    method: 'GET',
    expected_status: 200,
    interval_min: 15,
    aktywny: true,
    last_check_at: null,
    last_status: null,
    ok: null,
    created_at: '2026-06-28T10:00:00Z',
  },
  {
    id: 'uc-3',
    client_automation_id: 'ca-3',
    contact_id: 'c-7',
    nazwa: 'Recepcja MotoMax — Vapi hook',
    url: 'https://n8n.stronevo.pl/webhook/motomax-recepcja/health',
    method: 'GET',
    expected_status: 200,
    interval_min: 5,
    aktywny: true,
    last_check_at: null,
    last_status: null,
    ok: null,
    created_at: '2026-05-25T10:00:00Z',
  },
];

// Historia pingów: co godzinę przez 35 dni, deterministycznie (simulatePing).
// Z tego liczy się „dostępność 99,x% w tym miesiącu" — demo nie jest puste.
function seedUptimePings(checks: UptimeCheck[]): UptimePing[] {
  const pings: UptimePing[] = [];
  const now = new Date();
  for (const check of checks) {
    let i = 0;
    let last: UptimePing | null = null;
    for (let h = 35 * 24; h >= 1; h--) {
      const at = new Date(now.getTime() - h * 3_600_000);
      if (at < new Date(check.created_at)) continue;
      const sim = simulatePing(check.id, at);
      last = {
        id: `up-${check.id}-${++i}`,
        check_id: check.id,
        contact_id: check.contact_id,
        ok: sim.ok,
        status: sim.status,
        ms: sim.ms,
        checked_at: at.toISOString(),
      };
      pings.push(last);
    }
    if (last) {
      check.last_check_at = last.checked_at;
      check.last_status = last.status;
      check.ok = last.ok;
    }
  }
  return pings;
}

// Dostępy: Mercatura ma NIEKOMPLETNE (krokowy intake w /klient + brama
// provisioningu do pokazania), MotoMax komplet.
const SEED_CLIENT_CREDENTIALS: ClientCredential[] = [
  {
    id: 'cred-1',
    contact_id: 'c-1',
    automation_id: 'auto-2',
    pozycja: 'Materiały do bazy wiedzy: cennik, oferta, FAQ, regulaminy',
    metoda: 'przeslij',
    status: 'otrzymano',
    wartosc: 'https://drive.example/mercatura-baza-wiedzy',
    created_at: '2026-06-23T10:00:00Z',
  },
  {
    id: 'cred-2',
    contact_id: 'c-1',
    automation_id: 'auto-2',
    pozycja: 'Dostęp do strony WWW (wpięcie widgetu)',
    metoda: 'wideo',
    status: 'otrzymano',
    wartosc: 'wpięte na spotkaniu 24.06',
    created_at: '2026-06-23T10:00:00Z',
  },
  {
    id: 'cred-3',
    contact_id: 'c-1',
    automation_id: 'auto-2',
    pozycja: 'Adres e-mail na leady zebrane po godzinach',
    metoda: 'przeslij',
    status: 'oczekuje',
    wartosc: null,
    created_at: '2026-06-23T10:00:00Z',
  },
  {
    id: 'cred-4',
    contact_id: 'c-1',
    automation_id: 'auto-3',
    pozycja: 'Dostęp menedżera do Google Business Profile',
    metoda: 'wideo',
    status: 'oczekuje',
    wartosc: null,
    created_at: '2026-06-26T10:00:00Z',
  },
  {
    id: 'cred-5',
    contact_id: 'c-1',
    automation_id: 'auto-3',
    pozycja: 'Baza kontaktów klientów (telefon/e-mail) do prośby o opinię',
    metoda: 'przeslij',
    status: 'oczekuje',
    wartosc: null,
    created_at: '2026-06-26T10:00:00Z',
  },
  {
    id: 'cred-6',
    contact_id: 'c-7',
    automation_id: 'auto-1',
    pozycja: 'Numer telefonu klientów + zgoda na przekierowanie u operatora',
    metoda: 'przeslij',
    status: 'otrzymano',
    wartosc: '+48 600 000 007 → przekierowanie aktywne',
    created_at: '2026-05-23T10:00:00Z',
  },
  {
    id: 'cred-7',
    contact_id: 'c-7',
    automation_id: 'auto-1',
    pozycja: 'Dostęp do kalendarza rezerwacji (Google Calendar / Cal.com)',
    metoda: 'wideo',
    status: 'otrzymano',
    wartosc: 'cal.com/motomax — podpięte',
    created_at: '2026-05-23T10:00:00Z',
  },
];

const SEED_INVOICES: Invoice[] = [
  {
    id: 'inv-1',
    contact_id: 'c-1',
    fakturownia_id: 'MOCK/2026/06/001',
    tytul: 'Wdrożenie: Chatbot RAG',
    kwota: 1200,
    cykl: 'jednorazowa',
    status: 'oplacona',
    data: '2026-06-22',
    created_at: '2026-06-22T10:05:00Z',
  },
  {
    id: 'inv-2',
    contact_id: 'c-1',
    fakturownia_id: 'MOCK/2026/07/002',
    tytul: 'Abonament: Chatbot RAG (mies.)',
    kwota: 290,
    cykl: 'miesieczna',
    status: 'wystawiona',
    data: '2026-07-25',
    created_at: '2026-06-22T10:05:00Z',
  },
];

const SEED_TASKS: Task[] = [
  {
    id: 't-1',
    contact_id: 'c-1',
    typ: 'Provisioning: Chatbot RAG — Mercatura',
    kategoria: 'build',
    wykonawca: 'human',
    status: 'wdrozone',
    diff: 'Workflow wf-1 sklonowany z szablonu, baza wiedzy zaindeksowana (42 dokumenty), widget wpięty na stronę.',
    review_status: 'zaakceptowane',
    created_at: '2026-06-22T10:10:00Z',
  },
  {
    id: 't-2',
    contact_id: 'c-3',
    typ: 'Zbuduj automatyzację: demo chatbota rezerwacji (Klinika Uśmiech)',
    kategoria: 'build',
    wykonawca: 'agent',
    status: 'do_zatwierdzenia',
    diff: 'Szkic workflow: webhook → LLM (prompt rezerwacyjny) → Cal.com API → SMS. Demo na subdomenie demo.stronevo.pl/usmiech.',
    review_status: 'oczekuje',
    created_at: '2026-07-01T09:00:00Z',
  },
  {
    id: 't-3',
    contact_id: null,
    typ: 'Naprawić workflow: Backup vault → storage (błąd 03.07)',
    kategoria: 'remediation',
    wykonawca: 'human',
    status: 'do_zrobienia',
    diff: null,
    review_status: null,
    created_at: '2026-07-03T06:30:00Z',
  },
];

const SEED_AGENT_RUNS: AgentRun[] = [
  {
    id: 'run-1',
    task_id: 't-2',
    agent: 'hermes-builder',
    status: 'done',
    log: [
      '07:02 Start: analiza zadania — demo chatbota rezerwacji (Klinika Uśmiech)',
      '07:02 Pobranie golden-template "chatbot-rezerwacje" z repo szablonów',
      '07:04 Konfiguracja: webhook /usmiech-demo, prompt rezerwacyjny PL, słoty z Cal.com',
      '07:09 Test 1: rozmowa testowa — intencja "umów wizytę" rozpoznana poprawnie',
      '07:11 Test 2: kolizja terminu — poprawnie zaproponowany kolejny slot',
      '07:13 Wygenerowano workflow JSON + instrukcję wpięcia widgetu',
      '07:13 Koniec: output gotowy do review (agent nie wdraża samodzielnie)',
    ],
    output:
      '{\n  "workflow": "chatbot-rezerwacje-usmiech",\n  "nodes": 11,\n  "webhook": "/webhook/usmiech-demo",\n  "integracje": ["cal.com", "sms-api"],\n  "deploy_target": "srv-1 (n8n)",\n  "uwagi": "Wymaga klucza Cal.com kliniki przed deployem"\n}',
    wynik_review: 'oczekuje',
    koszt: 4.2,
    created_at: '2026-07-03T07:02:00Z',
    finished_at: '2026-07-03T07:13:00Z',
  },
];

const SEED_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'n-1',
    typ: 'techniczne',
    severity: 'warn',
    tytul: 'Workflow "Backup vault → storage" zakończony błędem',
    opis: 'Ostatnie uruchomienie 03.07 02:00 zwróciło błąd. Sprawdź logi w n8n.',
    related_typ: 'workflow',
    related_id: 'wf-5',
    remediation_task_id: null,
    status: 'nowe',
    akcje: [],
    created_at: '2026-07-03T02:05:00Z',
  },
  {
    id: 'n-2',
    typ: 'agent',
    severity: 'info',
    tytul: 'Agent zbudował: demo chatbota rezerwacji (Klinika Uśmiech) — do review',
    opis: 'hermes-builder zakończył pracę (11 kroków, koszt 4.20 zł). Output czeka na weryfikację — agent nie wdraża samodzielnie.',
    related_typ: 'agent_run',
    related_id: 'run-1',
    remediation_task_id: null,
    status: 'nowe',
    akcje: [{ action: 'approve_deploy', label: 'Zatwierdź → deploy' }],
    created_at: '2026-07-03T07:13:30Z',
  },
  {
    id: 'n-3',
    typ: 'techniczne',
    severity: 'warn',
    tytul: 'Recepcja AI (Warsztat MotoMax) zgłosiła błąd',
    opis: 'Webhook rezerwacji zwrócił błąd — ostatnie zdarzenie typu "blad" z wdrożenia ca-3. Sprawdź workflow wf-3 w n8n.',
    related_typ: 'client_automation',
    related_id: 'ca-3',
    remediation_task_id: null,
    status: 'nowe',
    akcje: [],
    created_at: new Date(Date.now() - 20 * 3_600_000).toISOString(),
  },
];

// ===== PANEL WYNIKÓW — seed zdarzeń demo (ostatnie 60 dni) =====
// Deterministyczny generator (bez skoków między odświeżeniami) — panel
// w trybie demo NIE może być pusty. Profil zdarzeń zależy od typu automatyzacji.

function seededRand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

interface DayPlan {
  typ: EventType;
  zrodlo: EventSource;
  n: number;
  poGodzinachSzansa?: number;
}

// Ile zdarzeń danego typu dziennie generuje wdrożenie danego typu katalogowego
function dayPlanFor(automationTyp: string, rand: () => number): DayPlan[] {
  switch (automationTyp) {
    case 'chatbot':
      return [
        { typ: 'lead_zlapany', zrodlo: 'chatbot', n: Math.floor(rand() * 3), poGodzinachSzansa: 0.45 },
        { typ: 'workflow_run', zrodlo: 'n8n', n: 3 + Math.floor(rand() * 5) },
      ];
    case 'recepcja':
      return [
        { typ: 'rozmowa_odebrana', zrodlo: 'ada', n: 3 + Math.floor(rand() * 4) },
        { typ: 'rezerwacja', zrodlo: 'ada', n: 1 + Math.floor(rand() * 2) },
        { typ: 'sms_wyslany', zrodlo: 'sms', n: 1 + Math.floor(rand() * 2) },
      ];
    case 'opinie':
      return [
        { typ: 'opinia_zebrana', zrodlo: 'opinie', n: rand() < 0.5 ? 1 : 0 },
        { typ: 'sms_wyslany', zrodlo: 'sms', n: 1 + Math.floor(rand() * 2) },
      ];
    default: // n8n / strona / pakiet
      return [{ typ: 'workflow_run', zrodlo: 'n8n', n: 2 + Math.floor(rand() * 4) }];
  }
}

function seedAutomationEvents(
  clientAutomations: ClientAutomation[],
  contacts: Contact[],
  automations: Automation[]
): AutomationEvent[] {
  const events: AutomationEvent[] = [];
  const now = new Date();

  for (const ca of clientAutomations) {
    if (ca.status !== 'active') continue;
    const contact = contacts.find((c) => c.id === ca.contact_id) ?? null;
    const automation = automations.find((a) => a.id === ca.automation_id);
    if (!automation) continue;

    const stawka = stawkaPlnH(contact);
    const seed = [...ca.id].reduce((sum, ch) => sum + ch.charCodeAt(0), 13);
    const rand = seededRand(seed);
    const start = ca.data_startu ? new Date(ca.data_startu) : null;
    // ca-4 (workflow n8n MotoMax): zdarzenia urywają się 4 dni temu → health "uwaga"
    const stopDaysAgo = ca.id === 'ca-4' ? 4 : 0;

    let i = 0;
    for (let day = 59; day >= stopDaysAgo; day--) {
      const dayBase = new Date(now);
      dayBase.setHours(0, 0, 0, 0);
      dayBase.setDate(dayBase.getDate() - day);
      if (start && dayBase < start) continue;

      for (const plan of dayPlanFor(automation.typ, rand)) {
        for (let k = 0; k < plan.n; k++) {
          const czas = new Date(dayBase);
          czas.setHours(7 + Math.floor(rand() * 15), Math.floor(rand() * 60), 0, 0);
          if (czas > now) continue;
          const minuty = minutyForTyp(plan.typ, DEFAULT_EVENT_VALUES);
          const poGodzinach =
            plan.poGodzinachSzansa !== undefined && rand() < plan.poGodzinachSzansa;
          events.push({
            id: `ev-${ca.id}-${++i}`,
            contact_id: ca.contact_id,
            client_automation_id: ca.id,
            typ: plan.typ,
            zrodlo: plan.zrodlo,
            minuty_oszczedzone: minuty,
            wartosc_pln: wycenaZdarzenia(minuty, stawka),
            meta: poGodzinach ? { po_godzinach: true } : {},
            created_at: czas.toISOString(),
          });
        }
      }
    }

    // ca-3 (Recepcja MotoMax): wczorajszy błąd + otwarte powiadomienie (n-3)
    // → sekcja "Zdrowie wdrożeń" ma czerwony wiersz do remediacji
    if (ca.id === 'ca-3') {
      events.push({
        id: `ev-${ca.id}-blad`,
        contact_id: ca.contact_id,
        client_automation_id: ca.id,
        typ: 'blad',
        zrodlo: 'ada',
        minuty_oszczedzone: 0,
        wartosc_pln: 0,
        meta: { blad: 'Webhook rezerwacji: HTTP 500' },
        created_at: new Date(now.getTime() - 20 * 3_600_000).toISOString(),
      });
    }
  }

  return events.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

// Raporty miesięczne demo: policzone z TYCH SAMYCH zdarzeń (twarde dane),
// dla 2 poprzednich pełnych miesięcy — sekcja "historia miesięcy" nie jest pusta.
function seedMonthlyReports(
  events: AutomationEvent[],
  clientAutomations: ClientAutomation[],
  contacts: Contact[],
  automations: Automation[]
): MonthlyReport[] {
  const reports: MonthlyReport[] = [];
  const now = new Date();

  for (const contact of contacts.filter((c) => c.typ === 'klient')) {
    const cas = clientAutomations
      .filter((ca) => ca.contact_id === contact.id)
      .map((ca) => ({
        ca,
        nazwa: automations.find((a) => a.id === ca.automation_id)?.nazwa ?? 'Automatyzacja',
      }));
    if (cas.length === 0) continue;

    for (let back = 1; back <= 2; back++) {
      const okres = new Date(now.getFullYear(), now.getMonth() - back, 1);
      const { from, to } = monthRange(okres);
      const monthEvents = events.filter(
        (e) => e.contact_id === contact.id && inRange(e.created_at, from, to)
      );
      if (monthEvents.length === 0) continue;

      reports.push({
        id: `rep-${contact.id}-${okres.getFullYear()}-${okres.getMonth() + 1}`,
        contact_id: contact.id,
        okres: `${okres.getFullYear()}-${String(okres.getMonth() + 1).padStart(2, '0')}-01`,
        payload: buildMonthlyReportPayload(contact, cas, monthEvents, okres),
        wyslany_at: to.toISOString(),
        created_at: to.toISOString(),
      });
    }
  }

  return reports;
}

// ===== FAZA 2 ZAUFANIA — seedy: rozmowy, wiadomości, szablony, baza wiedzy =====

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3_600_000).toISOString();
}

const SEED_KNOWLEDGE_DOCS: KnowledgeDoc[] = [
  {
    id: 'kd-1',
    contact_id: 'c-1',
    tytul: 'Cennik przeglądów ppoż',
    tresc:
      'Przegląd gaśnicy: 25 zł/szt netto. Przegląd hydrantu wewnętrznego: 120 zł/szt netto. Pomiar wydajności hydrantu: 160 zł. Minimalna wartość wizyty serwisowej: 250 zł netto. Legalizacja i remont gaśnic wyceniane indywidualnie po oględzinach. Ceny dojazdu: Poznań gratis, poza Poznaniem 1,5 zł/km.',
    embedding: null,
    created_at: '2026-06-23T10:00:00Z',
  },
  {
    id: 'kd-2',
    contact_id: 'c-1',
    tytul: 'Zakres usług i terminy',
    tresc:
      'Wykonujemy przeglądy roczne gaśnic i hydrantów, oznakowanie ewakuacyjne, instrukcje bezpieczeństwa pożarowego oraz szkolenia ppoż. Standardowy termin realizacji przeglądu: 3-5 dni roboczych od zgłoszenia. Obszar działania: Poznań i okolice do 50 km. Po przeglądzie wystawiamy protokół i naklejki kontrolne.',
    embedding: null,
    created_at: '2026-06-23T10:00:00Z',
  },
  {
    id: 'kd-3',
    contact_id: 'c-1',
    tytul: 'FAQ — faktury i umowy serwisowe',
    tresc:
      'Wystawiamy faktury VAT z terminem 14 dni. Dla firm z umową serwisową: stały rabat 10 procent i automatyczne przypomnienia o terminach przeglądów. Umowa serwisowa nie ma okresu minimalnego — można wypowiedzieć z końcem miesiąca.',
    embedding: null,
    created_at: '2026-06-23T10:00:00Z',
  },
  {
    id: 'kd-4',
    contact_id: 'c-7',
    tytul: 'Cennik i godziny serwisu',
    tresc:
      'Wymiana oleju z filtrem: od 250 zł. Przegląd okresowy: od 450 zł. Diagnostyka komputerowa: 150 zł. Klimatyzacja — nabicie i odgrzybienie: 350 zł. Godziny pracy: poniedziałek-piątek 8:00-17:00, sobota 9:00-13:00. Rezerwacja terminu telefonicznie lub przez recepcję AI.',
    embedding: null,
    created_at: '2026-05-25T10:00:00Z',
  },
];

const SEED_MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    id: 'tmpl-1',
    owner_contact_id: null,
    nazwa: 'Dziękujemy za kontakt',
    tresc:
      'Dzień dobry! Dziękujemy za wiadomość — wracamy z odpowiedzią najszybciej, jak się da (zwykle do 2 h w godzinach pracy).',
    created_at: '2026-06-01T10:00:00Z',
  },
  {
    id: 'tmpl-2',
    owner_contact_id: null,
    nazwa: 'Prośba o telefon',
    tresc:
      'Dzień dobry! Najszybciej ustalimy szczegóły telefonicznie — proszę o numer i dogodną godzinę, oddzwonimy.',
    created_at: '2026-06-01T10:00:00Z',
  },
  {
    id: 'tmpl-3',
    owner_contact_id: 'c-1',
    nazwa: 'Potwierdzenie terminu przeglądu',
    tresc:
      'Dzień dobry! Potwierdzam termin przeglądu ppoż: {DATA}, {GODZINA}. Technik zadzwoni ok. 30 min przed przyjazdem. Do zobaczenia!',
    created_at: '2026-06-23T10:00:00Z',
  },
];

const SEED_CONVERSATIONS: Conversation[] = [
  {
    id: 'conv-1',
    contact_id: null,
    owner_contact_id: 'c-1',
    external: { imie: 'Pan Adam', telefon: '+48 601 202 303' },
    channel: 'sms',
    status: 'otwarta',
    assigned: null,
    ai_auto: true,
    last_msg_at: hoursAgo(2),
    created_at: hoursAgo(26),
  },
  {
    id: 'conv-2',
    contact_id: null,
    owner_contact_id: 'c-1',
    external: { imie: 'Gość #4821', session_id: 'demo-sess-4821' },
    channel: 'webchat',
    status: 'oczekuje',
    assigned: null,
    ai_auto: true,
    last_msg_at: hoursAgo(5),
    created_at: hoursAgo(6),
  },
  {
    id: 'conv-3',
    contact_id: 'cl-2',
    owner_contact_id: 'c-1',
    external: { imie: 'Hotel Panorama', email: 'recepcja@panorama.example' },
    channel: 'email',
    status: 'otwarta',
    assigned: 'Gwidon',
    ai_auto: false,
    last_msg_at: hoursAgo(20),
    created_at: hoursAgo(50),
  },
  {
    id: 'conv-4',
    contact_id: null,
    owner_contact_id: 'c-7',
    external: { imie: 'Klient MotoMax', telefon: '+48 605 404 505' },
    channel: 'sms',
    status: 'otwarta',
    assigned: null,
    ai_auto: false,
    last_msg_at: hoursAgo(3),
    created_at: hoursAgo(3),
  },
  {
    id: 'conv-5',
    contact_id: null,
    owner_contact_id: null, // skrzynka STRONEVO (CEO)
    external: { imie: 'Prospekt (webchat stronevo.pl)', session_id: 'demo-sess-777' },
    channel: 'webchat',
    status: 'otwarta',
    assigned: null,
    ai_auto: false,
    last_msg_at: hoursAgo(28),
    created_at: hoursAgo(29),
  },
];

const SEED_MESSAGES: Message[] = [
  // conv-1: SMS z auto-odpowiedziami AI z wiedzy (cennik)
  { id: 'm-1', conversation_id: 'conv-1', owner_contact_id: 'c-1', direction: 'in', channel: 'sms', body: 'Dzień dobry, ile kosztuje przegląd gaśnic?', media: [], author: 'koncowy', created_at: hoursAgo(26) },
  { id: 'm-2', conversation_id: 'conv-1', owner_contact_id: 'c-1', direction: 'out', channel: 'sms', body: 'Dzień dobry! Przegląd gaśnicy: 25 zł/szt netto. Minimalna wartość wizyty serwisowej: 250 zł netto. W razie dodatkowych pytań — jestem do dyspozycji, a na życzenie połączę z zespołem Mercatura.', media: [], author: 'ai', created_at: hoursAgo(26) },
  { id: 'm-3', conversation_id: 'conv-1', owner_contact_id: 'c-1', direction: 'in', channel: 'sms', body: 'A dojeżdżacie do Śremu? I jaki termin?', media: [], author: 'koncowy', created_at: hoursAgo(2) },
  { id: 'm-4', conversation_id: 'conv-1', owner_contact_id: 'c-1', direction: 'out', channel: 'sms', body: 'Dzień dobry! Obszar działania: Poznań i okolice do 50 km, standardowy termin realizacji przeglądu: 3-5 dni roboczych od zgłoszenia. W razie dodatkowych pytań — jestem do dyspozycji.', media: [], author: 'ai', created_at: hoursAgo(2) },
  // conv-2: webchat z eskalacją → lead
  { id: 'm-5', conversation_id: 'conv-2', owner_contact_id: 'c-1', direction: 'in', channel: 'webchat', body: 'Potrzebuję instrukcji bezpieczeństwa pożarowego dla magazynu.', media: [], author: 'koncowy', created_at: hoursAgo(6) },
  { id: 'm-6', conversation_id: 'conv-2', owner_contact_id: 'c-1', direction: 'out', channel: 'webchat', body: 'Dzień dobry! Wykonujemy instrukcje bezpieczeństwa pożarowego oraz szkolenia ppoż. W razie dodatkowych pytań — jestem do dyspozycji.', media: [], author: 'ai', created_at: hoursAgo(6) },
  { id: 'm-7', conversation_id: 'conv-2', owner_contact_id: 'c-1', direction: 'in', channel: 'webchat', body: 'Proszę o kontakt w tej sprawie, mój numer 604 111 222.', media: [], author: 'koncowy', created_at: hoursAgo(5) },
  { id: 'm-8', conversation_id: 'conv-2', owner_contact_id: 'c-1', direction: 'out', channel: 'webchat', body: 'Dziękuję za wiadomość! Przekazuję rozmowę do zespołu Mercatura — odezwiemy się najszybciej, jak to możliwe.', media: [], author: 'ai', created_at: hoursAgo(5) },
  // conv-3: e-mail obsługiwany ręcznie
  { id: 'm-9', conversation_id: 'conv-3', owner_contact_id: 'c-1', direction: 'in', channel: 'email', body: 'Dzień dobry, prosimy o ofertę na przegląd hydrantów w hotelu (12 szt.) + gaśnice (30 szt.).', media: [], author: 'koncowy', created_at: hoursAgo(50) },
  { id: 'm-10', conversation_id: 'conv-3', owner_contact_id: 'c-1', direction: 'out', channel: 'email', body: 'Dzień dobry! Dziękujemy za zapytanie — hydranty 12 × 120 zł, gaśnice 30 × 25 zł, razem 2190 zł netto (dojazd Gniezno wg cennika). Możemy wykonać w przyszłym tygodniu — proponuję wtorek. Czy pasuje?', media: [], author: 'human', created_at: hoursAgo(20) },
  // conv-4: SMS bez odpowiedzi (MotoMax, ai_auto OFF)
  { id: 'm-11', conversation_id: 'conv-4', owner_contact_id: 'c-7', direction: 'in', channel: 'sms', body: 'Czy mogę umówić wymianę oleju na sobotę rano?', media: [], author: 'koncowy', created_at: hoursAgo(3) },
  // conv-5: webchat STRONEVO
  { id: 'm-12', conversation_id: 'conv-5', owner_contact_id: null, direction: 'in', channel: 'webchat', body: 'Ile kosztuje chatbot na stronę z waszą obsługą?', media: [], author: 'koncowy', created_at: hoursAgo(29) },
  { id: 'm-13', conversation_id: 'conv-5', owner_contact_id: null, direction: 'out', channel: 'webchat', body: 'Dzień dobry! Chatbot RAG: wdrożenie 1490 zł + abonament 290 zł/mc (aktualizacje bazy wiedzy w cenie). Chętnie pokażemy demo — zostawi Pan/Pani kontakt?', media: [], author: 'human', created_at: hoursAgo(28) },
];

// ===== FAZA 3 ZAUFANIA — seedy: strona, formularz, e-mail, social, opinie =====

const SEED_SITES: Site[] = [
  {
    id: 'site-1',
    contact_id: 'c-1',
    nazwa: 'Mercatura — przeglądy ppoż',
    slug: 'mercatura',
    domena: null,
    status: 'opublikowana',
    theme: { accent: '#18355B' },
    created_at: '2026-06-25T10:00:00Z',
  },
];

const SEED_SITE_PAGES: SitePage[] = [
  {
    id: 'page-1',
    site_id: 'site-1',
    contact_id: 'c-1',
    sciezka: '',
    seo: {
      title: 'Mercatura — przeglądy ppoż Poznań | gaśnice, hydranty',
      description: 'Przeglądy gaśnic i hydrantów w Poznaniu i okolicach. Protokół w 3-5 dni. Zamów wycenę online.',
    },
    created_at: '2026-06-25T10:00:00Z',
  },
  {
    id: 'page-2',
    site_id: 'site-1',
    contact_id: 'c-1',
    sciezka: 'kontakt',
    seo: { title: 'Kontakt — Mercatura ppoż' },
    created_at: '2026-06-25T10:00:00Z',
  },
];

const SEED_PAGE_BLOCKS: PageBlock[] = [
  {
    id: 'blk-1',
    page_id: 'page-1',
    contact_id: 'c-1',
    typ: 'hero',
    props: {
      naglowek: 'Przeglądy ppoż bez przypominania sobie w ostatniej chwili',
      podtytul: 'Gaśnice, hydranty, oznakowanie i szkolenia — Poznań i okolice do 50 km. Protokół w 3-5 dni roboczych.',
      cta_label: 'Zamów wycenę',
      cta_url: '#formularz',
    },
    kolejnosc: 0,
    created_at: '2026-06-25T10:00:00Z',
  },
  {
    id: 'blk-2',
    page_id: 'page-1',
    contact_id: 'c-1',
    typ: 'features',
    props: {
      naglowek: 'Co robimy',
      items: [
        { tytul: 'Przeglądy gaśnic', opis: '25 zł/szt netto, naklejki kontrolne i protokół w cenie.' },
        { tytul: 'Hydranty wewnętrzne', opis: 'Przegląd 120 zł/szt, pomiar wydajności 160 zł.' },
        { tytul: 'Instrukcje i szkolenia', opis: 'Instrukcje bezpieczeństwa pożarowego oraz szkolenia ppoż dla załogi.' },
      ],
    },
    kolejnosc: 1,
    created_at: '2026-06-25T10:00:00Z',
  },
  {
    id: 'blk-3',
    page_id: 'page-1',
    contact_id: 'c-1',
    typ: 'testimonials',
    props: {
      naglowek: 'Zaufali nam',
      items: [
        { autor: 'LogiPol Logistyka', tresc: 'Cały magazyn ogarnięty w jeden dzień, dokumenty od ręki.' },
        { autor: 'Hotel Panorama', tresc: 'Wreszcie ktoś pilnuje terminów za nas.' },
      ],
    },
    kolejnosc: 2,
    created_at: '2026-06-25T10:00:00Z',
  },
  {
    id: 'blk-4',
    page_id: 'page-1',
    contact_id: 'c-1',
    typ: 'form',
    props: { form_id: 'form-1', naglowek: 'Zamów bezpłatną wycenę' },
    kolejnosc: 3,
    created_at: '2026-06-25T10:00:00Z',
  },
  {
    id: 'blk-5',
    page_id: 'page-1',
    contact_id: 'c-1',
    typ: 'cta',
    props: {
      naglowek: 'Wolisz porozmawiać?',
      tresc: 'Zadzwoń: +48 600 000 001 — odbieramy w godzinach 8:00-16:00.',
      cta_label: 'Zadzwoń teraz',
      cta_url: 'tel:+48600000001',
    },
    kolejnosc: 4,
    created_at: '2026-06-25T10:00:00Z',
  },
  {
    id: 'blk-6',
    page_id: 'page-2',
    contact_id: 'c-1',
    typ: 'text',
    props: {
      naglowek: 'Kontakt',
      tresc: 'Mercatura — ochrona przeciwpożarowa\nul. Przykładowa 12, 60-001 Poznań\ntel. +48 600 000 001 · biuro@mercatura.example',
    },
    kolejnosc: 0,
    created_at: '2026-06-25T10:00:00Z',
  },
  {
    id: 'blk-7',
    page_id: 'page-2',
    contact_id: 'c-1',
    typ: 'form',
    props: { form_id: 'form-1', naglowek: 'Napisz do nas' },
    kolejnosc: 1,
    created_at: '2026-06-25T10:00:00Z',
  },
];

const SEED_FORMS: FormDef[] = [
  {
    id: 'form-1',
    contact_id: 'c-1',
    nazwa: 'Wycena przeglądu ppoż',
    pola: [
      { name: 'imie', label: 'Imię i nazwisko', typ: 'text', required: true },
      { name: 'telefon', label: 'Telefon', typ: 'tel', required: true },
      { name: 'email', label: 'E-mail', typ: 'email' },
      { name: 'wiadomosc', label: 'Czego dotyczy wycena?', typ: 'textarea' },
    ],
    webhook_url: null, // operator podpina n8n przy wdrożeniu
    zgoda_tekst:
      'Wyrażam zgodę na przetwarzanie moich danych osobowych przez Mercatura w celu przygotowania wyceny (RODO).',
    created_at: '2026-06-25T10:00:00Z',
  },
];

const SEED_EMAIL_LISTS: EmailList[] = [
  { id: 'list-1', contact_id: 'c-1', nazwa: 'Klienci serwisowi', created_at: '2026-06-25T10:00:00Z' },
];

const SEED_EMAIL_CONTACTS: EmailContact[] = [
  { id: 'ec-1', list_id: 'list-1', contact_id: 'c-1', email: 'bhp@logipol.example', imie: 'LogiPol', zgoda: true, opt_out: false, created_at: '2026-06-25T10:00:00Z' },
  { id: 'ec-2', list_id: 'list-1', contact_id: 'c-1', email: 'recepcja@panorama.example', imie: 'Hotel Panorama', zgoda: true, opt_out: false, created_at: '2026-06-25T10:00:00Z' },
  { id: 'ec-3', list_id: 'list-1', contact_id: 'c-1', email: 'kontakt@starymlyn.example', imie: 'Stary Młyn', zgoda: true, opt_out: true, created_at: '2026-06-25T10:00:00Z' },
];

const SEED_EMAIL_CAMPAIGNS: EmailCampaign[] = [
  {
    id: 'camp-1',
    contact_id: 'c-1',
    list_id: 'list-1',
    temat: 'Przypomnienie: przeglądy ppoż przed sezonem',
    bloki: [
      { typ: 'hero', props: { naglowek: 'Sezon kontroli PIP/straży zbliża się', podtytul: 'Sprawdź, czy Twoje przeglądy są aktualne.' } },
      { typ: 'text', props: { tresc: 'Dla klientów z umową serwisową: rabat 10% i pilnowanie terminów za Was.' } },
      { typ: 'cta', props: { naglowek: 'Umów przegląd', cta_label: 'Zamów wycenę', cta_url: 'https://crm.stronevo.pl/s/mercatura' } },
    ],
    status: 'wyslana',
    zaplanowano: null,
    wyslano_at: hoursAgo(72),
    created_at: hoursAgo(80),
  },
  {
    id: 'camp-2',
    contact_id: 'c-1',
    list_id: 'list-1',
    temat: 'Nowość: szkolenia ppoż dla załogi',
    bloki: [
      { typ: 'hero', props: { naglowek: 'Szkolenia ppoż w Waszej firmie', podtytul: 'Praktyczne, na miejscu, z zaświadczeniami.' } },
      { typ: 'cta', props: { naglowek: 'Zapytaj o termin', cta_label: 'Napisz do nas', cta_url: 'https://crm.stronevo.pl/s/mercatura/kontakt' } },
    ],
    status: 'szkic',
    zaplanowano: null,
    wyslano_at: null,
    created_at: hoursAgo(10),
  },
];

const SEED_EMAIL_SENDS: EmailSend[] = [
  { id: 'es-1', campaign_id: 'camp-1', contact_id: 'c-1', email: 'bhp@logipol.example', token: 'tok-demo-1', sent: true, opened_at: hoursAgo(70), clicked_at: hoursAgo(69), created_at: hoursAgo(72) },
  { id: 'es-2', campaign_id: 'camp-1', contact_id: 'c-1', email: 'recepcja@panorama.example', token: 'tok-demo-2', sent: true, opened_at: hoursAgo(50), clicked_at: null, created_at: hoursAgo(72) },
];

const SEED_SOCIAL_POSTS: SocialPost[] = [
  {
    id: 'post-1',
    contact_id: 'c-1',
    kanaly: ['fb', 'gbp'],
    tresc: 'Sezon kontroli zbliża się — sprawdź datę na naklejce swojej gaśnicy. Jeśli minęła, zapraszamy: przegląd od 25 zł/szt, protokół od ręki. 🔥🧯',
    media: [],
    zaplanowano: hoursAgo(30),
    status: 'opublikowany',
    wynik: { fb: 'ok', gbp: 'ok' },
    created_at: hoursAgo(40),
  },
  {
    id: 'post-2',
    contact_id: 'c-1',
    kanaly: ['fb'],
    tresc: 'Czy wiesz, że instrukcja bezpieczeństwa pożarowego jest obowiązkowa dla większości obiektów? Sprawdzimy Twoją za darmo przy najbliższym przeglądzie.',
    media: [],
    zaplanowano: hoursAgo(1), // zaległy → test crona publish-due
    status: 'zaplanowany',
    wynik: {},
    created_at: hoursAgo(20),
  },
  {
    id: 'post-3',
    contact_id: 'c-7',
    kanaly: ['fb', 'ig'],
    tresc: 'Sobota 9-13 — ekspresowa wymiana oleju bez zapisów. Wpadnij! 🔧',
    media: [],
    zaplanowano: new Date(Date.now() + 26 * 3_600_000).toISOString(),
    status: 'zaplanowany',
    wynik: {},
    created_at: hoursAgo(5),
  },
];

const SEED_REVIEW_REQUESTS: ReviewRequest[] = [
  {
    id: 'rr-1',
    contact_id: 'c-1',
    external: { imie: 'LogiPol', telefon: '+48 610 000 013' },
    kanal: 'sms',
    review_link: 'https://g.page/r/mercatura-demo/review',
    status: 'wyslana',
    created_at: hoursAgo(48),
  },
];

const SEED_REVIEWS: Review[] = [
  {
    id: 'rev-1',
    contact_id: 'c-1',
    zrodlo: 'google',
    autor: 'Magazyn LogiPol',
    ocena: 5,
    tresc: 'Szybko, terminowo, pełna dokumentacja. Polecamy!',
    odpowiedz: 'Dziękujemy za zaufanie — do zobaczenia przy kolejnym przeglądzie!',
    status: 'odpowiedziano',
    external_id: 'g-demo-1',
    created_at: hoursAgo(46),
  },
  {
    id: 'rev-2',
    contact_id: 'c-1',
    zrodlo: 'google',
    autor: 'Anna K.',
    ocena: 3,
    tresc: 'Usługa ok, ale termin przesunął się o dwa dni względem ustaleń.',
    odpowiedz: null,
    status: 'nowa',
    external_id: 'g-demo-2',
    created_at: hoursAgo(8),
  },
  {
    id: 'rev-3',
    contact_id: 'c-7',
    zrodlo: 'google',
    autor: 'Marek P.',
    ocena: 5,
    tresc: 'Olej wymieniony w 20 minut, uczciwa cena.',
    odpowiedz: null,
    status: 'nowa',
    external_id: 'g-demo-3',
    created_at: hoursAgo(12),
  },
];

// ===== FAZA 4 ZAUFANIA — seedy: płatności, subskrypcje, kursy =====

function daysFromNow(d: number): string {
  return new Date(Date.now() + d * 24 * 3_600_000).toISOString().slice(0, 10);
}

const SEED_PAYMENT_LINKS: PaymentLink[] = [
  {
    id: 'pl-1',
    contact_id: 'c-1',
    kwota: 250,
    waluta: 'PLN',
    opis: 'Przegląd gaśnic — Restauracja Stary Młyn',
    token: 'pay-demo-1',
    status: 'aktywny',
    external: { imie: 'Stary Młyn', telefon: '+48 610 000 011' },
    meta: {},
    payment_id: null,
    created_at: hoursAgo(6),
    paid_at: null,
  },
  {
    id: 'pl-2',
    contact_id: 'c-1',
    kwota: 149,
    waluta: 'PLN',
    opis: 'Kurs online: Szkolenie ppoż dla pracowników',
    token: 'pay-demo-kurs',
    status: 'aktywny',
    external: { imie: 'Jan Testowy', email: 'jan@example.com', telefon: '+48 611 222 333' },
    meta: { course_id: 'course-1' },
    payment_id: null,
    created_at: hoursAgo(4),
    paid_at: null,
  },
  {
    id: 'pl-3',
    contact_id: 'c-1',
    kwota: 480,
    waluta: 'PLN',
    opis: 'Przegląd hydrantów — Hotel Panorama (zaliczka)',
    token: 'pay-demo-webhook',
    status: 'aktywny',
    external: { imie: 'Hotel Panorama', email: 'recepcja@panorama.example' },
    meta: {},
    payment_id: null,
    created_at: hoursAgo(3),
    paid_at: null,
  },
];

const SEED_PAYMENTS: Payment[] = [
  {
    id: 'pay-1',
    contact_id: 'c-1',
    payment_link_id: null,
    subscription_id: null,
    kwota: 2190,
    waluta: 'PLN',
    status: 'oplacona',
    provider: 'mock',
    external_id: 'hist-001',
    meta: { opis: 'Przegląd kompleksowy — LogiPol (historyczna)' },
    created_at: hoursAgo(120),
    paid_at: hoursAgo(119),
  },
];

const SEED_SUBSCRIPTIONS: Subscription[] = [
  {
    id: 'sub-1',
    contact_id: 'c-1',
    client_automation_id: 'ca-1',
    plan: 'Abonament: Chatbot RAG',
    kwota: 290,
    cykl: 'miesieczny',
    status: 'aktywna',
    provider: 'mock',
    provider_ref: null,
    next_charge: daysFromNow(-1), // zaległa → test crona charge-due
    created_at: '2026-06-25T10:00:00Z',
  },
  {
    id: 'sub-2',
    contact_id: 'c-7',
    client_automation_id: 'ca-3',
    plan: 'Abonament: Recepcja AI',
    kwota: 599,
    cykl: 'miesieczny',
    status: 'aktywna',
    provider: 'mock',
    provider_ref: null,
    next_charge: daysFromNow(20),
    created_at: '2026-05-25T10:00:00Z',
  },
];

const SEED_COURSES: Course[] = [
  {
    id: 'course-1',
    contact_id: 'c-1',
    tytul: 'Szkolenie ppoż dla pracowników (online)',
    opis: 'Obowiązkowe szkolenie przeciwpożarowe — 3 krótkie lekcje + praktyczne checklisty. Zaświadczenie po ukończeniu.',
    cena: 149,
    created_at: '2026-06-28T10:00:00Z',
  },
];

const SEED_LESSONS: Lesson[] = [
  {
    id: 'les-1',
    course_id: 'course-1',
    contact_id: 'c-1',
    tytul: 'Podstawy: ogień i środki gaśnicze',
    tresc: 'Trójkąt spalania: paliwo + tlen + temperatura. Gaśnica proszkowa (ABC) — do większości pożarów biurowych. NIGDY wody na urządzenia pod napięciem i tłuszcze. Sprawdź datę przeglądu na naklejce swojej gaśnicy.',
    wideo_url: null,
    kolejnosc: 0,
    created_at: '2026-06-28T10:00:00Z',
  },
  {
    id: 'les-2',
    course_id: 'course-1',
    contact_id: 'c-1',
    tytul: 'Ewakuacja: drogi, znaki, zbiórka',
    tresc: 'Zielone znaki = kierunek ewakuacji. Nie używaj windy. Punkt zbiórki ustala instrukcja bezpieczeństwa pożarowego obiektu. Przećwicz trasę ze swojego stanowiska co najmniej raz.',
    wideo_url: null,
    kolejnosc: 1,
    created_at: '2026-06-28T10:00:00Z',
  },
  {
    id: 'les-3',
    course_id: 'course-1',
    contact_id: 'c-1',
    tytul: 'Pierwsze 60 sekund pożaru',
    tresc: 'Alarmuj (998/112) → ostrzeż ludzi → gaś TYLKO gdy pożar mały i masz drogę odwrotu → zamknij drzwi za sobą → ewakuacja. Życie zawsze przed mieniem.',
    wideo_url: null,
    kolejnosc: 2,
    created_at: '2026-06-28T10:00:00Z',
  },
];

const SEED_ENROLLMENTS: Enrollment[] = [
  {
    id: 'enr-1',
    course_id: 'course-1',
    contact_id: 'c-1',
    external: { imie: 'Pracownik LogiPol', email: 'bhp@logipol.example' },
    token: 'kurs-demo-1',
    payment_id: 'pay-1',
    status: 'aktywny',
    created_at: hoursAgo(100),
  },
];

const SEED_COURSE_PROGRESS: CourseProgress[] = [
  {
    id: 'cp-1',
    enrollment_id: 'enr-1',
    lesson_id: 'les-1',
    ukonczona: true,
    updated_at: hoursAgo(90),
  },
];

// ===== FAZA 5 ZAUFANIA — seedy: obiekty, smart listy, kalendarze, kampanie =====

const SEED_CUSTOM_OBJECTS: CustomObject[] = [
  {
    id: 'co-1',
    owner_contact_id: 'c-7',
    nazwa: 'Pojazd',
    ikona: '🚗',
    schema: [
      { name: 'marka', label: 'Marka', typ: 'text' },
      { name: 'model', label: 'Model', typ: 'text' },
      { name: 'rejestracja', label: 'Nr rejestracyjny', typ: 'text' },
      { name: 'rok', label: 'Rocznik', typ: 'number' },
      { name: 'nastepny_przeglad', label: 'Następny przegląd', typ: 'date' },
    ],
    created_at: '2026-06-01T10:00:00Z',
  },
  {
    id: 'co-2',
    owner_contact_id: 'c-1',
    nazwa: 'Obiekt (budynek)',
    ikona: '🏢',
    schema: [
      { name: 'adres', label: 'Adres', typ: 'text' },
      { name: 'gasnice', label: 'Liczba gaśnic', typ: 'number' },
      { name: 'hydranty', label: 'Liczba hydrantów', typ: 'number' },
      { name: 'nastepny_przeglad', label: 'Następny przegląd', typ: 'date' },
    ],
    created_at: '2026-06-25T10:00:00Z',
  },
];

const SEED_CUSTOM_OBJECT_RECORDS: CustomObjectRecord[] = [
  {
    id: 'cor-1',
    object_id: 'co-1',
    owner_contact_id: 'c-7',
    contact_id: null,
    dane: { marka: 'Toyota', model: 'Corolla', rejestracja: 'PK 12345', rok: 2019, nastepny_przeglad: '2026-09-15' },
    created_at: hoursAgo(200),
  },
  {
    id: 'cor-2',
    object_id: 'co-1',
    owner_contact_id: 'c-7',
    contact_id: null,
    dane: { marka: 'Ford', model: 'Transit', rejestracja: 'PK 67890', rok: 2021, nastepny_przeglad: '2026-08-02' },
    created_at: hoursAgo(150),
  },
  {
    id: 'cor-3',
    object_id: 'co-2',
    owner_contact_id: 'c-1',
    contact_id: 'cl-2', // Hotel Panorama (lead klienta c-1)
    dane: { adres: 'Gniezno, Rynek 1', gasnice: 30, hydranty: 12, nastepny_przeglad: '2027-06-01' },
    created_at: hoursAgo(40),
  },
];

const SEED_SMART_LISTS: SmartList[] = [
  {
    id: 'sl-1',
    owner_contact_id: null,
    nazwa: 'Gorące leady (do obdzwonienia)',
    filtr: { status_pipeline: ['NOWY', 'PROBA_KONTAKTU'], ma_telefon: true },
    created_at: hoursAgo(300),
  },
  {
    id: 'sl-2',
    owner_contact_id: null,
    nazwa: 'Klienci z e-mailem (newsletter)',
    filtr: { typ: ['klient'], ma_email: true },
    created_at: hoursAgo(300),
  },
  {
    id: 'sl-3',
    owner_contact_id: 'c-1',
    nazwa: 'Moje leady z Poznania',
    filtr: { miasto: 'Poznań' },
    created_at: hoursAgo(100),
  },
];

const SEED_BOOKING_CALENDARS: BookingCalendar[] = [
  {
    id: 'cal-1',
    owner_contact_id: 'c-7',
    nazwa: 'Serwis MotoMax — umów wizytę',
    slug: 'motomax-serwis',
    typ: 'round_robin',
    slot_min: 60,
    capacity: 1,
    aktywny: true,
    created_at: '2026-06-01T10:00:00Z',
  },
  {
    id: 'cal-2',
    owner_contact_id: 'c-1',
    nazwa: 'Szkolenie ppoż stacjonarne (grupa)',
    slug: 'mercatura-szkolenie',
    typ: 'class',
    slot_min: 120,
    capacity: 10,
    aktywny: true,
    created_at: '2026-06-25T10:00:00Z',
  },
];

const SEED_CALENDAR_MEMBERS: CalendarMember[] = [
  { id: 'cm-1', calendar_id: 'cal-1', owner_contact_id: 'c-7', nazwa: 'Robert (właściciel)', kolejnosc: 0, created_at: '2026-06-01T10:00:00Z' },
  { id: 'cm-2', calendar_id: 'cal-1', owner_contact_id: 'c-7', nazwa: 'Paweł (mechanik)', kolejnosc: 1, created_at: '2026-06-01T10:00:00Z' },
];

// pon-pt 8-16 (dni 1-5) + sob 9-13 dla cal-1; cal-2: wt+czw 10-14
const SEED_CALENDAR_AVAILABILITY: CalendarAvailability[] = [
  ...[1, 2, 3, 4, 5].map((d, i) => ({
    id: `av-1-${i}`,
    calendar_id: 'cal-1',
    owner_contact_id: 'c-7',
    dzien: d,
    od: '08:00',
    do: '16:00',
  })),
  { id: 'av-1-sob', calendar_id: 'cal-1', owner_contact_id: 'c-7', dzien: 6, od: '09:00', do: '13:00' },
  { id: 'av-2-wt', calendar_id: 'cal-2', owner_contact_id: 'c-1', dzien: 2, od: '10:00', do: '14:00' },
  { id: 'av-2-czw', calendar_id: 'cal-2', owner_contact_id: 'c-1', dzien: 4, od: '10:00', do: '14:00' },
];

const SEED_AD_CAMPAIGNS: AdCampaign[] = [
  {
    id: 'ad-1',
    owner_contact_id: 'c-1',
    kanal: 'meta',
    nazwa: 'Leady ppoż — Poznań i okolice',
    budzet_dzienny: 40,
    status: 'aktywna',
    segment: 'nie_odebral',
    external_id: 'meta-demo-238001',
    metryki: { wydano: 312.45, wyswietlenia: 18400, klikniecia: 356, leady: 12 },
    created_at: hoursAgo(400),
  },
  {
    id: 'ad-2',
    owner_contact_id: 'c-7',
    kanal: 'google',
    nazwa: 'Wymiana oleju Kalisz — Search',
    budzet_dzienny: 25,
    status: 'szkic',
    segment: null,
    external_id: null,
    metryki: {},
    created_at: hoursAgo(30),
  },
];

function getDb(): DemoDb {
  const g = globalThis as unknown as { __stronevoDemoDb?: DemoDb };
  if (!g.__stronevoDemoDb || g.__stronevoDemoDb.version !== SEED_VERSION) {
    const automationEvents = seedAutomationEvents(
      SEED_CLIENT_AUTOMATIONS,
      SEED_CONTACTS,
      SEED_AUTOMATIONS
    );
    // uptime: kopie checków, bo seedUptimePings ustawia im last_check_at/ok
    const uptimeChecks = SEED_UPTIME_CHECKS.map((c) => ({ ...c }));
    const uptimePings = seedUptimePings(uptimeChecks);
    g.__stronevoDemoDb = {
      version: SEED_VERSION,
      servers: [SEED_SERVER],
      contacts: [...SEED_CONTACTS],
      automations: [...SEED_AUTOMATIONS],
      clientAutomations: [...SEED_CLIENT_AUTOMATIONS],
      invoices: [...SEED_INVOICES],
      contracts: [],
      tasks: [...SEED_TASKS],
      agentRuns: [...SEED_AGENT_RUNS],
      notifications: [...SEED_NOTIFICATIONS],
      clientAccounts: [],
      clientCredentials: [...SEED_CLIENT_CREDENTIALS],
      leadActivities: [],
      workflowErrors: [...SEED_WORKFLOW_ERRORS],
      uptimeChecks,
      uptimePings,
      templateVersions: [...SEED_TEMPLATE_VERSIONS],
      conversations: SEED_CONVERSATIONS.map((c) => ({ ...c })),
      messages: [...SEED_MESSAGES],
      messageTemplates: [...SEED_MESSAGE_TEMPLATES],
      knowledgeDocs: [...SEED_KNOWLEDGE_DOCS],
      sites: SEED_SITES.map((s) => ({ ...s })),
      sitePages: [...SEED_SITE_PAGES],
      pageBlocks: SEED_PAGE_BLOCKS.map((b) => ({ ...b })),
      forms: [...SEED_FORMS],
      formSubmissions: [],
      emailLists: [...SEED_EMAIL_LISTS],
      emailContacts: SEED_EMAIL_CONTACTS.map((c) => ({ ...c })),
      emailCampaigns: SEED_EMAIL_CAMPAIGNS.map((c) => ({ ...c })),
      emailSends: [...SEED_EMAIL_SENDS],
      socialPosts: SEED_SOCIAL_POSTS.map((p) => ({ ...p })),
      reviewRequests: [...SEED_REVIEW_REQUESTS],
      reviews: SEED_REVIEWS.map((r) => ({ ...r })),
      payments: SEED_PAYMENTS.map((p) => ({ ...p })),
      paymentLinks: SEED_PAYMENT_LINKS.map((l) => ({ ...l })),
      subscriptions: SEED_SUBSCRIPTIONS.map((s) => ({ ...s })),
      courses: [...SEED_COURSES],
      lessons: SEED_LESSONS.map((l) => ({ ...l })),
      enrollments: SEED_ENROLLMENTS.map((e) => ({ ...e })),
      courseProgress: SEED_COURSE_PROGRESS.map((c) => ({ ...c })),
      snapshots: [],
      customObjects: [...SEED_CUSTOM_OBJECTS],
      customObjectRecords: SEED_CUSTOM_OBJECT_RECORDS.map((r) => ({ ...r })),
      smartLists: [...SEED_SMART_LISTS],
      bookingCalendars: SEED_BOOKING_CALENDARS.map((c) => ({ ...c })),
      calendarMembers: [...SEED_CALENDAR_MEMBERS],
      calendarAvailability: [...SEED_CALENDAR_AVAILABILITY],
      bookings: [],
      adCampaigns: SEED_AD_CAMPAIGNS.map((a) => ({ ...a })),
      automationEvents,
      monthlyReports: seedMonthlyReports(
        automationEvents,
        SEED_CLIENT_AUTOMATIONS,
        SEED_CONTACTS,
        SEED_AUTOMATIONS
      ),
      seq: 100,
    };
  }
  return g.__stronevoDemoDb;
}

function nextId(prefix: string): string {
  return `${prefix}-${++getDb().seq}`;
}

export const demoStore = {
  // ===== servers / contacts (Faza 1) =====
  listServers(): Server[] {
    return getDb().servers;
  },
  getServer(id: string): Server | null {
    return getDb().servers.find((s) => s.id === id) ?? null;
  },
  createServer(input: Omit<Server, 'id'>): Server {
    const db = getDb();
    const server: Server = { ...input, id: nextId('srv') };
    db.servers.push(server);
    return server;
  },
  listContacts(): Contact[] {
    return [...getDb().contacts].sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  getContact(id: string): Contact | null {
    return getDb().contacts.find((c) => c.id === id) ?? null;
  },
  createContact(input: ContactInput): Contact {
    const db = getDb();
    const contact: Contact = { ...input, id: nextId('c'), created_at: new Date().toISOString() };
    db.contacts.push(contact);
    return contact;
  },
  updateContact(id: string, patch: Partial<ContactInput>): Contact | null {
    const db = getDb();
    const idx = db.contacts.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    db.contacts[idx] = { ...db.contacts[idx], ...patch };
    return db.contacts[idx];
  },
  deleteContact(id: string): boolean {
    const db = getDb();
    const before = db.contacts.length;
    db.contacts = db.contacts.filter((c) => c.id !== id);
    return db.contacts.length < before;
  },

  // ===== historia aktywności leada (CRM klienta) =====
  listLeadActivities(contactId: string): LeadActivity[] {
    return getDb()
      .leadActivities.filter((a) => a.contact_id === contactId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  createLeadActivity(input: Omit<LeadActivity, 'id' | 'created_at'>): LeadActivity {
    const db = getDb();
    const a: LeadActivity = { ...input, id: nextId('la'), created_at: new Date().toISOString() };
    db.leadActivities.push(a);
    return a;
  },
  deleteLeadActivity(id: string): boolean {
    const db = getDb();
    const before = db.leadActivities.length;
    db.leadActivities = db.leadActivities.filter((a) => a.id !== id);
    return db.leadActivities.length < before;
  },

  // ===== katalog automatyzacji =====
  listAutomations(): Automation[] {
    return getDb().automations;
  },
  getAutomation(id: string): Automation | null {
    return getDb().automations.find((a) => a.id === id) ?? null;
  },
  listClientAutomations(contactId?: string): ClientAutomation[] {
    const all = getDb().clientAutomations;
    return contactId ? all.filter((ca) => ca.contact_id === contactId) : all;
  },
  getClientAutomation(id: string): ClientAutomation | null {
    return getDb().clientAutomations.find((ca) => ca.id === id) ?? null;
  },
  createClientAutomation(
    input: Omit<ClientAutomation, 'id' | 'created_at'>
  ): ClientAutomation {
    const db = getDb();
    const ca: ClientAutomation = {
      ...input,
      id: nextId('ca'),
      created_at: new Date().toISOString(),
    };
    db.clientAutomations.push(ca);
    return ca;
  },
  updateClientAutomation(
    id: string,
    patch: Partial<ClientAutomation>
  ): ClientAutomation | null {
    const db = getDb();
    const idx = db.clientAutomations.findIndex((ca) => ca.id === id);
    if (idx === -1) return null;
    db.clientAutomations[idx] = { ...db.clientAutomations[idx], ...patch };
    return db.clientAutomations[idx];
  },

  // ===== faktury =====
  listInvoices(contactId?: string): Invoice[] {
    const all = [...getDb().invoices].sort((a, b) => b.created_at.localeCompare(a.created_at));
    return contactId ? all.filter((i) => i.contact_id === contactId) : all;
  },
  getInvoice(id: string): Invoice | null {
    return getDb().invoices.find((i) => i.id === id) ?? null;
  },
  createInvoice(input: Omit<Invoice, 'id' | 'created_at'>): Invoice {
    const db = getDb();
    const inv: Invoice = { ...input, id: nextId('inv'), created_at: new Date().toISOString() };
    db.invoices.push(inv);
    return inv;
  },
  updateInvoice(id: string, patch: Partial<Invoice>): Invoice | null {
    const db = getDb();
    const idx = db.invoices.findIndex((i) => i.id === id);
    if (idx === -1) return null;
    db.invoices[idx] = { ...db.invoices[idx], ...patch };
    return db.invoices[idx];
  },

  // ===== umowy =====
  listContracts(contactId?: string): Contract[] {
    const all = [...getDb().contracts].sort((a, b) => b.created_at.localeCompare(a.created_at));
    return contactId ? all.filter((c) => c.contact_id === contactId) : all;
  },
  getContract(id: string): Contract | null {
    return getDb().contracts.find((c) => c.id === id) ?? null;
  },
  createContract(input: Omit<Contract, 'id' | 'created_at'>): Contract {
    const db = getDb();
    const contract: Contract = {
      ...input,
      id: nextId('ctr'),
      created_at: new Date().toISOString(),
    };
    db.contracts.push(contract);
    return contract;
  },
  updateContract(id: string, patch: Partial<Contract>): Contract | null {
    const db = getDb();
    const idx = db.contracts.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    db.contracts[idx] = { ...db.contracts[idx], ...patch };
    return db.contracts[idx];
  },

  // ===== zadania =====
  listTasks(): Task[] {
    return [...getDb().tasks].sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  createTask(input: Omit<Task, 'id' | 'created_at'>): Task {
    const db = getDb();
    const task: Task = { ...input, id: nextId('t'), created_at: new Date().toISOString() };
    db.tasks.push(task);
    return task;
  },
  updateTask(id: string, patch: Partial<Task>): Task | null {
    const db = getDb();
    const idx = db.tasks.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    db.tasks[idx] = { ...db.tasks[idx], ...patch };
    return db.tasks[idx];
  },

  // ===== agent runs (Faza 4) =====
  listAgentRuns(taskId?: string): AgentRun[] {
    const all = [...getDb().agentRuns].sort((a, b) => b.created_at.localeCompare(a.created_at));
    return taskId ? all.filter((r) => r.task_id === taskId) : all;
  },
  getAgentRun(id: string): AgentRun | null {
    return getDb().agentRuns.find((r) => r.id === id) ?? null;
  },
  createAgentRun(input: Omit<AgentRun, 'id' | 'created_at'>): AgentRun {
    const db = getDb();
    const run: AgentRun = { ...input, id: nextId('run'), created_at: new Date().toISOString() };
    db.agentRuns.push(run);
    return run;
  },
  updateAgentRun(id: string, patch: Partial<AgentRun>): AgentRun | null {
    const db = getDb();
    const idx = db.agentRuns.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    db.agentRuns[idx] = { ...db.agentRuns[idx], ...patch };
    return db.agentRuns[idx];
  },

  // ===== powiadomienia =====
  listNotifications(): AppNotification[] {
    return [...getDb().notifications].sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  createNotification(
    input: Omit<AppNotification, 'id' | 'created_at' | 'remediation_task_id'> & {
      remediation_task_id?: string | null;
    }
  ): AppNotification {
    const db = getDb();
    const n: AppNotification = {
      remediation_task_id: null,
      ...input,
      id: nextId('n'),
      created_at: new Date().toISOString(),
    };
    db.notifications.push(n);
    return n;
  },
  updateNotification(id: string, patch: Partial<AppNotification>): AppNotification | null {
    const db = getDb();
    const idx = db.notifications.findIndex((n) => n.id === id);
    if (idx === -1) return null;
    db.notifications[idx] = { ...db.notifications[idx], ...patch };
    return db.notifications[idx];
  },
  hasOpenNotificationFor(relatedTyp: string, relatedId: string): boolean {
    return getDb().notifications.some(
      (n) => n.related_typ === relatedTyp && n.related_id === relatedId && n.status !== 'rozwiazane'
    );
  },

  // ===== konta klientów =====
  listClientAccounts(): ClientAccount[] {
    return getDb().clientAccounts;
  },
  getClientAccountByContact(contactId: string): ClientAccount | null {
    return getDb().clientAccounts.find((a) => a.contact_id === contactId) ?? null;
  },
  createClientAccount(input: Omit<ClientAccount, 'id' | 'created_at'>): ClientAccount {
    const db = getDb();
    const acc: ClientAccount = {
      ...input,
      id: nextId('acc'),
      created_at: new Date().toISOString(),
    };
    db.clientAccounts.push(acc);
    return acc;
  },
  updateClientAccount(id: string, patch: Partial<ClientAccount>): ClientAccount | null {
    const db = getDb();
    const idx = db.clientAccounts.findIndex((a) => a.id === id);
    if (idx === -1) return null;
    db.clientAccounts[idx] = { ...db.clientAccounts[idx], ...patch };
    return db.clientAccounts[idx];
  },

  // ===== Panel Wyników: zdarzenia + raporty miesięczne =====
  listAutomationEvents(filter?: {
    contactId?: string;
    clientAutomationId?: string;
    from?: Date;
    to?: Date;
  }): AutomationEvent[] {
    return getDb().automationEvents.filter((e) => {
      if (filter?.contactId && e.contact_id !== filter.contactId) return false;
      if (filter?.clientAutomationId && e.client_automation_id !== filter.clientAutomationId)
        return false;
      if (filter?.from && new Date(e.created_at) < filter.from) return false;
      if (filter?.to && new Date(e.created_at) >= filter.to) return false;
      return true;
    });
  },
  createAutomationEvent(input: Omit<AutomationEvent, 'id' | 'created_at'>): AutomationEvent {
    const db = getDb();
    const event: AutomationEvent = {
      ...input,
      id: nextId('ev'),
      created_at: new Date().toISOString(),
    };
    db.automationEvents.push(event);
    return event;
  },
  listMonthlyReports(contactId?: string): MonthlyReport[] {
    const all = [...getDb().monthlyReports].sort((a, b) => b.okres.localeCompare(a.okres));
    return contactId ? all.filter((r) => r.contact_id === contactId) : all;
  },
  getMonthlyReport(id: string): MonthlyReport | null {
    return getDb().monthlyReports.find((r) => r.id === id) ?? null;
  },
  upsertMonthlyReport(
    contactId: string,
    okres: string,
    payload: Record<string, unknown>
  ): MonthlyReport {
    const db = getDb();
    const existing = db.monthlyReports.find(
      (r) => r.contact_id === contactId && r.okres === okres
    );
    if (existing) {
      existing.payload = payload;
      return existing;
    }
    const report: MonthlyReport = {
      id: nextId('rep'),
      contact_id: contactId,
      okres,
      payload,
      wyslany_at: null,
      created_at: new Date().toISOString(),
    };
    db.monthlyReports.push(report);
    return report;
  },
  updateMonthlyReport(id: string, patch: Partial<MonthlyReport>): MonthlyReport | null {
    const db = getDb();
    const idx = db.monthlyReports.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    db.monthlyReports[idx] = { ...db.monthlyReports[idx], ...patch };
    return db.monthlyReports[idx];
  },

  // ===== Faza 1 zaufania: błędy workflowów =====
  listWorkflowErrors(filter?: {
    clientAutomationId?: string;
    status?: string;
  }): WorkflowError[] {
    return getDb()
      .workflowErrors.filter((e) => {
        if (filter?.clientAutomationId && e.client_automation_id !== filter.clientAutomationId)
          return false;
        if (filter?.status && e.status !== filter.status) return false;
        return true;
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  createWorkflowError(input: Omit<WorkflowError, 'id' | 'created_at'>): WorkflowError {
    const db = getDb();
    const err: WorkflowError = {
      ...input,
      id: nextId('we'),
      created_at: new Date().toISOString(),
    };
    db.workflowErrors.push(err);
    return err;
  },
  updateWorkflowError(id: string, patch: Partial<WorkflowError>): WorkflowError | null {
    const db = getDb();
    const idx = db.workflowErrors.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    db.workflowErrors[idx] = { ...db.workflowErrors[idx], ...patch };
    return db.workflowErrors[idx];
  },

  // ===== Faza 1 zaufania: uptime =====
  listUptimeChecks(contactId?: string): UptimeCheck[] {
    const all = getDb().uptimeChecks;
    return contactId ? all.filter((c) => c.contact_id === contactId) : all;
  },
  updateUptimeCheck(id: string, patch: Partial<UptimeCheck>): UptimeCheck | null {
    const db = getDb();
    const idx = db.uptimeChecks.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    db.uptimeChecks[idx] = { ...db.uptimeChecks[idx], ...patch };
    return db.uptimeChecks[idx];
  },
  listUptimePings(checkId?: string, contactId?: string): UptimePing[] {
    return getDb().uptimePings.filter((p) => {
      if (checkId && p.check_id !== checkId) return false;
      if (contactId && p.contact_id !== contactId) return false;
      return true;
    });
  },
  createUptimePing(input: Omit<UptimePing, 'id'>): UptimePing {
    const db = getDb();
    const ping: UptimePing = { ...input, id: nextId('up') };
    db.uptimePings.push(ping);
    return ping;
  },

  // ===== Faza 1 zaufania: rejestr wersji szablonów =====
  listTemplateVersions(): TemplateVersion[] {
    return [...getDb().templateVersions].sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  // ===== Faza 2 zaufania: rozmowy (inbox) =====
  // ownerContactId: undefined = wszystkie (CEO); null = skrzynka STRONEVO; string = klient
  listConversations(ownerContactId?: string | null): Conversation[] {
    return getDb()
      .conversations.filter((c) =>
        ownerContactId === undefined ? true : c.owner_contact_id === ownerContactId
      )
      .sort((a, b) => (b.last_msg_at ?? b.created_at).localeCompare(a.last_msg_at ?? a.created_at));
  },
  getConversation(id: string): Conversation | null {
    return getDb().conversations.find((c) => c.id === id) ?? null;
  },
  findConversationByExternal(
    ownerContactId: string | null,
    channel: string,
    external: { telefon?: string | null; email?: string | null; session_id?: string | null }
  ): Conversation | null {
    const key = (v?: string | null) => (v ?? '').replace(/\s+/g, '').toLowerCase();
    return (
      getDb().conversations.find(
        (c) =>
          c.owner_contact_id === ownerContactId &&
          c.channel === channel &&
          ((key(external.session_id) && key(c.external.session_id) === key(external.session_id)) ||
            (key(external.telefon) && key(c.external.telefon) === key(external.telefon)) ||
            (key(external.email) && key(c.external.email) === key(external.email)))
      ) ?? null
    );
  },
  createConversation(input: Omit<Conversation, 'id' | 'created_at'>): Conversation {
    const db = getDb();
    const conv: Conversation = {
      ...input,
      id: nextId('conv'),
      created_at: new Date().toISOString(),
    };
    db.conversations.push(conv);
    return conv;
  },
  updateConversation(id: string, patch: Partial<Conversation>): Conversation | null {
    const db = getDb();
    const idx = db.conversations.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    db.conversations[idx] = { ...db.conversations[idx], ...patch };
    return db.conversations[idx];
  },
  listMessages(conversationId: string): Message[] {
    return getDb()
      .messages.filter((m) => m.conversation_id === conversationId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  },
  createMessage(input: Omit<Message, 'id' | 'created_at'>): Message {
    const db = getDb();
    const msg: Message = { ...input, id: nextId('m'), created_at: new Date().toISOString() };
    db.messages.push(msg);
    const conv = db.conversations.find((c) => c.id === input.conversation_id);
    if (conv) conv.last_msg_at = msg.created_at;
    return msg;
  },
  listMessageTemplates(ownerContactId?: string | null): MessageTemplate[] {
    return getDb().messageTemplates.filter(
      (t) => t.owner_contact_id === null || ownerContactId === undefined || t.owner_contact_id === ownerContactId
    );
  },
  listKnowledgeDocs(contactId?: string | null): KnowledgeDoc[] {
    const all = getDb().knowledgeDocs;
    return contactId === undefined ? all : all.filter((d) => d.contact_id === contactId);
  },
  createKnowledgeDoc(input: Omit<KnowledgeDoc, 'id' | 'created_at'>): KnowledgeDoc {
    const db = getDb();
    const doc: KnowledgeDoc = { ...input, id: nextId('kd'), created_at: new Date().toISOString() };
    db.knowledgeDocs.push(doc);
    return doc;
  },

  // ===== Faza 3 zaufania: marketing =====
  listSites(contactId?: string | null): Site[] {
    const all = getDb().sites;
    return contactId === undefined ? all : all.filter((s) => s.contact_id === contactId);
  },
  getSiteBySlug(slug: string): Site | null {
    return getDb().sites.find((s) => s.slug === slug) ?? null;
  },
  getSite(id: string): Site | null {
    return getDb().sites.find((s) => s.id === id) ?? null;
  },
  createSite(input: Omit<Site, 'id' | 'created_at'>): Site {
    const db = getDb();
    const site: Site = { ...input, id: nextId('site'), created_at: new Date().toISOString() };
    db.sites.push(site);
    return site;
  },
  updateSite(id: string, patch: Partial<Site>): Site | null {
    const db = getDb();
    const idx = db.sites.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    db.sites[idx] = { ...db.sites[idx], ...patch };
    return db.sites[idx];
  },
  listSitePages(siteId: string): SitePage[] {
    return getDb()
      .sitePages.filter((p) => p.site_id === siteId)
      .sort((a, b) => a.sciezka.localeCompare(b.sciezka));
  },
  getSitePage(siteId: string, sciezka: string): SitePage | null {
    return getDb().sitePages.find((p) => p.site_id === siteId && p.sciezka === sciezka) ?? null;
  },
  createSitePage(input: Omit<SitePage, 'id' | 'created_at'>): SitePage {
    const db = getDb();
    const page: SitePage = { ...input, id: nextId('page'), created_at: new Date().toISOString() };
    db.sitePages.push(page);
    return page;
  },
  listPageBlocks(pageId: string): PageBlock[] {
    return getDb()
      .pageBlocks.filter((b) => b.page_id === pageId)
      .sort((a, b) => a.kolejnosc - b.kolejnosc);
  },
  createPageBlock(input: Omit<PageBlock, 'id' | 'created_at'>): PageBlock {
    const db = getDb();
    const block: PageBlock = { ...input, id: nextId('blk'), created_at: new Date().toISOString() };
    db.pageBlocks.push(block);
    return block;
  },
  updatePageBlock(id: string, patch: Partial<PageBlock>): PageBlock | null {
    const db = getDb();
    const idx = db.pageBlocks.findIndex((b) => b.id === id);
    if (idx === -1) return null;
    db.pageBlocks[idx] = { ...db.pageBlocks[idx], ...patch };
    return db.pageBlocks[idx];
  },
  deletePageBlock(id: string): boolean {
    const db = getDb();
    const before = db.pageBlocks.length;
    db.pageBlocks = db.pageBlocks.filter((b) => b.id !== id);
    return db.pageBlocks.length < before;
  },
  listForms(contactId?: string | null): FormDef[] {
    const all = getDb().forms;
    return contactId === undefined ? all : all.filter((f) => f.contact_id === contactId);
  },
  getForm(id: string): FormDef | null {
    return getDb().forms.find((f) => f.id === id) ?? null;
  },
  createForm(input: Omit<FormDef, 'id' | 'created_at'>): FormDef {
    const db = getDb();
    const form: FormDef = { ...input, id: nextId('form'), created_at: new Date().toISOString() };
    db.forms.push(form);
    return form;
  },
  listFormSubmissions(formId?: string, contactId?: string | null): FormSubmission[] {
    return getDb()
      .formSubmissions.filter((s) => {
        if (formId && s.form_id !== formId) return false;
        if (contactId !== undefined && s.contact_id !== contactId) return false;
        return true;
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  createFormSubmission(input: Omit<FormSubmission, 'id' | 'created_at'>): FormSubmission {
    const db = getDb();
    const sub: FormSubmission = { ...input, id: nextId('sub'), created_at: new Date().toISOString() };
    db.formSubmissions.push(sub);
    return sub;
  },
  listEmailLists(contactId?: string | null): EmailList[] {
    const all = getDb().emailLists;
    return contactId === undefined ? all : all.filter((l) => l.contact_id === contactId);
  },
  listEmailContacts(listId: string): EmailContact[] {
    return getDb().emailContacts.filter((c) => c.list_id === listId);
  },
  getEmailContact(id: string): EmailContact | null {
    return getDb().emailContacts.find((c) => c.id === id) ?? null;
  },
  updateEmailContact(id: string, patch: Partial<EmailContact>): EmailContact | null {
    const db = getDb();
    const idx = db.emailContacts.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    db.emailContacts[idx] = { ...db.emailContacts[idx], ...patch };
    return db.emailContacts[idx];
  },
  listEmailCampaigns(contactId?: string | null): EmailCampaign[] {
    const all = [...getDb().emailCampaigns].sort((a, b) => b.created_at.localeCompare(a.created_at));
    return contactId === undefined ? all : all.filter((c) => c.contact_id === contactId);
  },
  getEmailCampaign(id: string): EmailCampaign | null {
    return getDb().emailCampaigns.find((c) => c.id === id) ?? null;
  },
  createEmailCampaign(input: Omit<EmailCampaign, 'id' | 'created_at'>): EmailCampaign {
    const db = getDb();
    const camp: EmailCampaign = { ...input, id: nextId('camp'), created_at: new Date().toISOString() };
    db.emailCampaigns.push(camp);
    return camp;
  },
  updateEmailCampaign(id: string, patch: Partial<EmailCampaign>): EmailCampaign | null {
    const db = getDb();
    const idx = db.emailCampaigns.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    db.emailCampaigns[idx] = { ...db.emailCampaigns[idx], ...patch };
    return db.emailCampaigns[idx];
  },
  listEmailSends(campaignId?: string): EmailSend[] {
    const all = getDb().emailSends;
    return campaignId ? all.filter((s) => s.campaign_id === campaignId) : all;
  },
  getEmailSendByToken(token: string): EmailSend | null {
    return getDb().emailSends.find((s) => s.token === token) ?? null;
  },
  createEmailSend(input: Omit<EmailSend, 'id' | 'created_at'>): EmailSend {
    const db = getDb();
    const send: EmailSend = { ...input, id: nextId('es'), created_at: new Date().toISOString() };
    db.emailSends.push(send);
    return send;
  },
  updateEmailSend(id: string, patch: Partial<EmailSend>): EmailSend | null {
    const db = getDb();
    const idx = db.emailSends.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    db.emailSends[idx] = { ...db.emailSends[idx], ...patch };
    return db.emailSends[idx];
  },
  listSocialPosts(contactId?: string | null): SocialPost[] {
    const all = [...getDb().socialPosts].sort((a, b) =>
      (b.zaplanowano ?? b.created_at).localeCompare(a.zaplanowano ?? a.created_at)
    );
    return contactId === undefined ? all : all.filter((p) => p.contact_id === contactId);
  },
  createSocialPost(input: Omit<SocialPost, 'id' | 'created_at'>): SocialPost {
    const db = getDb();
    const post: SocialPost = { ...input, id: nextId('post'), created_at: new Date().toISOString() };
    db.socialPosts.push(post);
    return post;
  },
  updateSocialPost(id: string, patch: Partial<SocialPost>): SocialPost | null {
    const db = getDb();
    const idx = db.socialPosts.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    db.socialPosts[idx] = { ...db.socialPosts[idx], ...patch };
    return db.socialPosts[idx];
  },
  listReviewRequests(contactId?: string | null): ReviewRequest[] {
    const all = [...getDb().reviewRequests].sort((a, b) => b.created_at.localeCompare(a.created_at));
    return contactId === undefined ? all : all.filter((r) => r.contact_id === contactId);
  },
  createReviewRequest(input: Omit<ReviewRequest, 'id' | 'created_at'>): ReviewRequest {
    const db = getDb();
    const req: ReviewRequest = { ...input, id: nextId('rr'), created_at: new Date().toISOString() };
    db.reviewRequests.push(req);
    return req;
  },
  listReviews(contactId?: string | null): Review[] {
    const all = [...getDb().reviews].sort((a, b) => b.created_at.localeCompare(a.created_at));
    return contactId === undefined ? all : all.filter((r) => r.contact_id === contactId);
  },
  getReview(id: string): Review | null {
    return getDb().reviews.find((r) => r.id === id) ?? null;
  },
  findReviewByExternal(zrodlo: string, externalId: string): Review | null {
    return (
      getDb().reviews.find((r) => r.zrodlo === zrodlo && r.external_id === externalId) ?? null
    );
  },
  createReview(input: Omit<Review, 'id' | 'created_at'>): Review {
    const db = getDb();
    const review: Review = { ...input, id: nextId('rev'), created_at: new Date().toISOString() };
    db.reviews.push(review);
    return review;
  },
  updateReview(id: string, patch: Partial<Review>): Review | null {
    const db = getDb();
    const idx = db.reviews.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    db.reviews[idx] = { ...db.reviews[idx], ...patch };
    return db.reviews[idx];
  },

  // ===== Faza 4 zaufania: commerce =====
  listPayments(contactId?: string | null): Payment[] {
    const all = [...getDb().payments].sort((a, b) => b.created_at.localeCompare(a.created_at));
    return contactId === undefined ? all : all.filter((p) => p.contact_id === contactId);
  },
  createPayment(input: Omit<Payment, 'id' | 'created_at'>): Payment {
    const db = getDb();
    const p: Payment = { ...input, id: nextId('pay'), created_at: new Date().toISOString() };
    db.payments.push(p);
    return p;
  },
  updatePayment(id: string, patch: Partial<Payment>): Payment | null {
    const db = getDb();
    const idx = db.payments.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    db.payments[idx] = { ...db.payments[idx], ...patch };
    return db.payments[idx];
  },
  listPaymentLinks(contactId?: string | null): PaymentLink[] {
    const all = [...getDb().paymentLinks].sort((a, b) => b.created_at.localeCompare(a.created_at));
    return contactId === undefined ? all : all.filter((l) => l.contact_id === contactId);
  },
  getPaymentLinkByToken(token: string): PaymentLink | null {
    return getDb().paymentLinks.find((l) => l.token === token) ?? null;
  },
  createPaymentLink(input: Omit<PaymentLink, 'id' | 'created_at'>): PaymentLink {
    const db = getDb();
    const l: PaymentLink = { ...input, id: nextId('pl'), created_at: new Date().toISOString() };
    db.paymentLinks.push(l);
    return l;
  },
  updatePaymentLink(id: string, patch: Partial<PaymentLink>): PaymentLink | null {
    const db = getDb();
    const idx = db.paymentLinks.findIndex((l) => l.id === id);
    if (idx === -1) return null;
    db.paymentLinks[idx] = { ...db.paymentLinks[idx], ...patch };
    return db.paymentLinks[idx];
  },
  listSubscriptions(contactId?: string | null): Subscription[] {
    const all = [...getDb().subscriptions].sort((a, b) =>
      (a.next_charge ?? '9999').localeCompare(b.next_charge ?? '9999')
    );
    return contactId === undefined ? all : all.filter((s) => s.contact_id === contactId);
  },
  createSubscription(input: Omit<Subscription, 'id' | 'created_at'>): Subscription {
    const db = getDb();
    const s: Subscription = { ...input, id: nextId('sub'), created_at: new Date().toISOString() };
    db.subscriptions.push(s);
    return s;
  },
  updateSubscription(id: string, patch: Partial<Subscription>): Subscription | null {
    const db = getDb();
    const idx = db.subscriptions.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    db.subscriptions[idx] = { ...db.subscriptions[idx], ...patch };
    return db.subscriptions[idx];
  },
  listCourses(contactId?: string | null): Course[] {
    const all = getDb().courses;
    return contactId === undefined ? all : all.filter((c) => c.contact_id === contactId);
  },
  getCourse(id: string): Course | null {
    return getDb().courses.find((c) => c.id === id) ?? null;
  },
  createCourse(input: Omit<Course, 'id' | 'created_at'>): Course {
    const db = getDb();
    const c: Course = { ...input, id: nextId('course'), created_at: new Date().toISOString() };
    db.courses.push(c);
    return c;
  },
  listLessons(courseId: string): Lesson[] {
    return getDb()
      .lessons.filter((l) => l.course_id === courseId)
      .sort((a, b) => a.kolejnosc - b.kolejnosc);
  },
  createLesson(input: Omit<Lesson, 'id' | 'created_at'>): Lesson {
    const db = getDb();
    const l: Lesson = { ...input, id: nextId('les'), created_at: new Date().toISOString() };
    db.lessons.push(l);
    return l;
  },
  updateLesson(id: string, patch: Partial<Lesson>): Lesson | null {
    const db = getDb();
    const idx = db.lessons.findIndex((l) => l.id === id);
    if (idx === -1) return null;
    db.lessons[idx] = { ...db.lessons[idx], ...patch };
    return db.lessons[idx];
  },
  listEnrollments(courseId?: string, contactId?: string | null): Enrollment[] {
    return getDb().enrollments.filter((e) => {
      if (courseId && e.course_id !== courseId) return false;
      if (contactId !== undefined && e.contact_id !== contactId) return false;
      return true;
    });
  },
  getEnrollmentByToken(token: string): Enrollment | null {
    return getDb().enrollments.find((e) => e.token === token) ?? null;
  },
  createEnrollment(input: Omit<Enrollment, 'id' | 'created_at'>): Enrollment {
    const db = getDb();
    const e: Enrollment = { ...input, id: nextId('enr'), created_at: new Date().toISOString() };
    db.enrollments.push(e);
    return e;
  },
  listCourseProgress(enrollmentId: string): CourseProgress[] {
    return getDb().courseProgress.filter((p) => p.enrollment_id === enrollmentId);
  },
  upsertCourseProgress(enrollmentId: string, lessonId: string, ukonczona: boolean): CourseProgress {
    const db = getDb();
    const existing = db.courseProgress.find(
      (p) => p.enrollment_id === enrollmentId && p.lesson_id === lessonId
    );
    if (existing) {
      existing.ukonczona = ukonczona;
      existing.updated_at = new Date().toISOString();
      return existing;
    }
    const p: CourseProgress = {
      id: nextId('cp'),
      enrollment_id: enrollmentId,
      lesson_id: lessonId,
      ukonczona,
      updated_at: new Date().toISOString(),
    };
    db.courseProgress.push(p);
    return p;
  },

  // ===== Faza 5 zaufania: snapshoty, obiekty, smart listy, kalendarze, ads =====
  listSnapshots(): Snapshot[] {
    return [...getDb().snapshots].sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  getSnapshot(id: string): Snapshot | null {
    return getDb().snapshots.find((s) => s.id === id) ?? null;
  },
  createSnapshot(input: Omit<Snapshot, 'id' | 'created_at'>): Snapshot {
    const db = getDb();
    const s: Snapshot = { ...input, id: nextId('snap'), created_at: new Date().toISOString() };
    db.snapshots.push(s);
    return s;
  },
  createMessageTemplate(input: Omit<MessageTemplate, 'id' | 'created_at'>): MessageTemplate {
    const db = getDb();
    const t: MessageTemplate = { ...input, id: nextId('tmpl'), created_at: new Date().toISOString() };
    db.messageTemplates.push(t);
    return t;
  },
  createUptimeCheck(input: Omit<UptimeCheck, 'id' | 'created_at'>): UptimeCheck {
    const db = getDb();
    const c: UptimeCheck = { ...input, id: nextId('uc'), created_at: new Date().toISOString() };
    db.uptimeChecks.push(c);
    return c;
  },
  listCustomObjects(ownerContactId?: string | null): CustomObject[] {
    const all = getDb().customObjects;
    return ownerContactId === undefined
      ? all
      : all.filter((o) => o.owner_contact_id === ownerContactId);
  },
  getCustomObject(id: string): CustomObject | null {
    return getDb().customObjects.find((o) => o.id === id) ?? null;
  },
  createCustomObject(input: Omit<CustomObject, 'id' | 'created_at'>): CustomObject {
    const db = getDb();
    const o: CustomObject = { ...input, id: nextId('co'), created_at: new Date().toISOString() };
    db.customObjects.push(o);
    return o;
  },
  listCustomObjectRecords(objectId: string): CustomObjectRecord[] {
    return getDb()
      .customObjectRecords.filter((r) => r.object_id === objectId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  createCustomObjectRecord(
    input: Omit<CustomObjectRecord, 'id' | 'created_at'>
  ): CustomObjectRecord {
    const db = getDb();
    const r: CustomObjectRecord = { ...input, id: nextId('cor'), created_at: new Date().toISOString() };
    db.customObjectRecords.push(r);
    return r;
  },
  listSmartLists(ownerContactId?: string | null): SmartList[] {
    const all = getDb().smartLists;
    return ownerContactId === undefined
      ? all
      : all.filter((l) => l.owner_contact_id === ownerContactId);
  },
  createSmartList(input: Omit<SmartList, 'id' | 'created_at'>): SmartList {
    const db = getDb();
    const l: SmartList = { ...input, id: nextId('sl'), created_at: new Date().toISOString() };
    db.smartLists.push(l);
    return l;
  },
  listBookingCalendars(ownerContactId?: string | null): BookingCalendar[] {
    const all = getDb().bookingCalendars;
    return ownerContactId === undefined
      ? all
      : all.filter((c) => c.owner_contact_id === ownerContactId);
  },
  getBookingCalendarBySlug(slug: string): BookingCalendar | null {
    return getDb().bookingCalendars.find((c) => c.slug === slug) ?? null;
  },
  createBookingCalendar(input: Omit<BookingCalendar, 'id' | 'created_at'>): BookingCalendar {
    const db = getDb();
    const c: BookingCalendar = { ...input, id: nextId('cal'), created_at: new Date().toISOString() };
    db.bookingCalendars.push(c);
    return c;
  },
  listCalendarMembers(calendarId: string): CalendarMember[] {
    return getDb()
      .calendarMembers.filter((m) => m.calendar_id === calendarId)
      .sort((a, b) => a.kolejnosc - b.kolejnosc);
  },
  createCalendarMember(input: Omit<CalendarMember, 'id' | 'created_at'>): CalendarMember {
    const db = getDb();
    const m: CalendarMember = { ...input, id: nextId('cm'), created_at: new Date().toISOString() };
    db.calendarMembers.push(m);
    return m;
  },
  listCalendarAvailability(calendarId: string): CalendarAvailability[] {
    return getDb().calendarAvailability.filter((a) => a.calendar_id === calendarId);
  },
  createCalendarAvailability(input: Omit<CalendarAvailability, 'id'>): CalendarAvailability {
    const db = getDb();
    const a: CalendarAvailability = { ...input, id: nextId('av') };
    db.calendarAvailability.push(a);
    return a;
  },
  listBookings(calendarId?: string): Booking[] {
    const all = [...getDb().bookings].sort((a, b) => a.start.localeCompare(b.start));
    return calendarId ? all.filter((b) => b.calendar_id === calendarId) : all;
  },
  createBooking(input: Omit<Booking, 'id' | 'created_at'>): Booking {
    const db = getDb();
    const b: Booking = { ...input, id: nextId('book'), created_at: new Date().toISOString() };
    db.bookings.push(b);
    return b;
  },
  listAdCampaigns(ownerContactId?: string | null): AdCampaign[] {
    const all = [...getDb().adCampaigns].sort((a, b) => b.created_at.localeCompare(a.created_at));
    return ownerContactId === undefined
      ? all
      : all.filter((c) => c.owner_contact_id === ownerContactId);
  },
  createAdCampaign(input: Omit<AdCampaign, 'id' | 'created_at'>): AdCampaign {
    const db = getDb();
    const c: AdCampaign = { ...input, id: nextId('ad'), created_at: new Date().toISOString() };
    db.adCampaigns.push(c);
    return c;
  },
  updateAdCampaign(id: string, patch: Partial<AdCampaign>): AdCampaign | null {
    const db = getDb();
    const idx = db.adCampaigns.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    db.adCampaigns[idx] = { ...db.adCampaigns[idx], ...patch };
    return db.adCampaigns[idx];
  },

  // ===== dostępy/klucze od klienta =====
  listClientCredentials(contactId: string): ClientCredential[] {
    return getDb()
      .clientCredentials.filter((c) => c.contact_id === contactId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  },
  createClientCredential(
    input: Omit<ClientCredential, 'id' | 'created_at'>
  ): ClientCredential {
    const db = getDb();
    const cred: ClientCredential = {
      ...input,
      id: nextId('cred'),
      created_at: new Date().toISOString(),
    };
    db.clientCredentials.push(cred);
    return cred;
  },
  updateClientCredential(
    id: string,
    patch: Partial<ClientCredential>
  ): ClientCredential | null {
    const db = getDb();
    const idx = db.clientCredentials.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    db.clientCredentials[idx] = { ...db.clientCredentials[idx], ...patch };
    return db.clientCredentials[idx];
  },
};
