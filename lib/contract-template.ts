import { Contact, Contract } from './types';

// Szablon umowy — wersja MERGE z vaulta (SZABLON-UMOWY-MERGE.md, aktualizacja
// 2026-07-03: 14-dniowe prawo odstąpienia w § 5 ust. 2, uproszczony § 9,
// „Wprowadzenie" zamiast preambuły). Dwa miejsca [DO WERYFIKACJI PRZEZ
// PRAWNIKA] to specjalistyczne kwestie RODO.
//
// Logika warunkowa: bloki {{#GLOS}}...{{/GLOS}} zostają TYLKO, gdy pakiet
// zawiera moduł głosowy (Recepcja AI); {{#BEZGLOSU}}...{{/BEZGLOSU}} odwrotnie.
// Pola opcjonalne bez wartości dostają "—". Daty w formacie DD.MM.RRRR.
// STAŁE WYKONAWCY (NIP, REGON, adres, kontakt) zaszyte na sztywno — nie parametryzować.
export const CONTRACT_TEMPLATE = `
# UMOWA O ŚWIADCZENIE USŁUG AUTOMATYZACJI AI

zawarta w dniu **{{data_umowy}}** w Piasecznie (dalej: **„Umowa"**), pomiędzy:

**WYKONAWCA:**
**Bartosz Gontarek**, prowadzący jednoosobową działalność gospodarczą pod firmą **STRONEVO Bartosz Gontarek** (marka: STRONEVO / STRONEVO.AI), [ADRES FIRMY], **NIP: [NIP]**, REGON: [REGON], e-mail: kontakt@stronevo.pl, tel. [TELEFON] (dalej: **„Wykonawca"**),

a

**ZAMAWIAJĄCY:**
**{{zamawiajacy_nazwa}}**, {{zamawiajacy_forma}}, z siedzibą/adresem: **{{zamawiajacy_adres}}**, **NIP: {{zamawiajacy_nip}}**, {{zamawiajacy_regon_krs}}, reprezentowanym przez: **{{zamawiajacy_reprezentant}}**, e-mail: **{{zamawiajacy_email}}**, tel.: **{{zamawiajacy_telefon}}** (dalej: **„Zamawiający"**),

zwanymi łącznie **„Stronami"**, a osobno **„Stroną"**.

**Wprowadzenie.** Umowa zawierana jest między dwoma przedsiębiorcami (B2B) w związku z prowadzoną działalnością. Zależy nam na współpracy uczciwej dla obu stron: Wykonawca uruchamia i utrzymuje usługę, Zamawiający płaci abonament i może w każdej chwili odejść na zasadach opisanych niżej (§ 5), w tym skorzystać z 14-dniowego prawa odstąpienia, jeśli usługa nie działa jak opisano.

---

## § 1. Definicje

1. **Usługi** — usługi automatyzacji z wykorzystaniem sztucznej inteligencji świadczone przez Wykonawcę na rzecz Zamawiającego w zakresie wybranego Pakietu, opisane w **Załączniku nr 2 (Specyfikacja usług)**.
2. **Pakiet** — wybrany przez Zamawiającego wariant Usług: **{{pakiet_nazwa}}** wraz z ewentualnymi dodatkami, zgodnie z Załącznikiem nr 2 i nr 3.
3. **Recepcja AI / Ada** — moduł głosowej recepcji telefonicznej opartej na AI (dostępny w Pakiecie Premium oraz jako dodatek), obejmujący odbieranie połączeń, rozmowę głosową w języku polskim, umawianie wizyt oraz **nagrywanie i przetwarzanie rozmów**.
4. **Wdrożenie** — jednorazowe prace konfiguracyjno-integracyjne uruchamiające Usługi (konfiguracja, integracje, testy, szkolenie, uruchomienie produkcyjne).
5. **Go-live** — dzień produkcyjnego uruchomienia Usług, potwierdzony na Trwałym nośniku (e-mail). Od tego dnia liczony jest Okres Podstawowy (§ 5) i naliczany abonament.
6. **Abonament** — miesięczne wynagrodzenie za utrzymanie i świadczenie Usług w ramach Pakietu.
7. **Overage** — opłata za wykorzystanie minut głosowych ponad limit wliczony w Pakiet.
8. **Silnik** — oprogramowanie, workflow (n8n i inne), prompty, konfiguracje, integracje, scenariusze i know-how stworzone lub wykorzystane przez Wykonawcę do świadczenia Usług.
9. **Dane Zamawiającego** — dane, treści i materiały przekazane przez Zamawiającego oraz dane wytworzone w toku świadczenia Usług dotyczące działalności Zamawiającego i jego klientów końcowych (w tym nagrania rozmów, historia rezerwacji, dane kontaktowe).
10. **Dostawcy zewnętrzni** — podmioty trzecie, których usługi (API, telefonia, model językowy, hosting, SMS, kalendarz) są niezbędne do świadczenia Usług; ich lista wskazana jest w rejestrze subprocesorów (Załącznik nr 1).
11. **Trwały nośnik** — e-mail, PDF lub inny nośnik umożliwiający przechowanie i odtworzenie informacji w niezmienionej postaci.
12. **Dni robocze** — dni od poniedziałku do piątku z wyłączeniem dni ustawowo wolnych od pracy w Polsce.

---

## § 2. Przedmiot Umowy

1. Wykonawca zobowiązuje się do Wdrożenia oraz świadczenia Usług w ramach wybranego Pakietu **{{pakiet_nazwa}}**, a Zamawiający zobowiązuje się do zapłaty wynagrodzenia i współdziałania na zasadach określonych w Umowie.
2. Szczegółowy zakres funkcjonalny Usług (moduły wchodzące w skład Pakietu) określa **Załącznik nr 2 (Specyfikacja usług)**. Na dzień zawarcia Umowy zakres obejmuje w szczególności następujące automatyzacje:
{{lista_automatyzacji}}
3. Usługi świadczone są zdalnie, na terytorium Polski. Osobista obecność Stron nie jest wymagana.
4. Usługi mają charakter **usługi ciągłej (abonamentowej)**. Wykonawca zobowiązuje się do dołożenia należytej staranności zawodowej (zobowiązanie starannego działania), z uwzględnieniem zależności od Dostawców zewnętrznych (§ 10) — Wykonawca nie gwarantuje konkretnego rezultatu handlowego (np. liczby pozyskanych klientów Zamawiającego).
5. Zmiana zakresu Usług (dodanie/usunięcie modułów, zmiana Pakietu) wymaga aneksu lub uzgodnienia na Trwałym nośniku i może wpłynąć na wysokość wynagrodzenia. Skutki podpisania aneksu rozszerzającego dla okresu obowiązywania Umowy określa § 5 ust. 8.

---

## § 3. Warunki rozpoczęcia i współdziałanie Zamawiającego

1. Rozpoczęcie Wdrożenia uzależnione jest od: (a) zawarcia Umowy, (b) zapłaty opłaty wdrożeniowej zgodnie z § 4, (c) przekazania przez Zamawiającego danych, dostępów i materiałów niezbędnych do konfiguracji (m.in. dostęp do kalendarza, numer telefonu / przekierowania, dane o usługach i cenniku Zamawiającego, materiały do bazy wiedzy chatbota).
2. Strony ustalają planowany termin startu (Go-live) na **{{data_startu}}**. Termin ten jest orientacyjny i uzależniony od terminowego przekazania przez Zamawiającego materiałów i dostępów. Zamawiający zobowiązuje się do współdziałania, w tym do terminowego dostarczania materiałów, udzielania dostępów oraz akceptacji na poszczególnych etapach. Opóźnienie Zamawiającego odpowiednio przesuwa termin Wdrożenia i Go-live, bez odpowiedzialności Wykonawcy.
3. Zamawiający odpowiada za zgodność z prawem przekazywanych treści i materiałów oraz oświadcza, że posiada do nich niezbędne prawa i zgody.
4. **Numer telefonu i przekierowania (Recepcja AI):** sposób obsługi numeru (przekierowanie z numeru Zamawiającego / nowy numer dostarczony w ramach Usługi) Strony ustalają na etapie Wdrożenia i opisują w Załączniku nr 2.

---

## § 4. Wynagrodzenie i warunki płatności

1. Wynagrodzenie Wykonawcy obejmuje:
   a) **jednorazową opłatę wdrożeniową** w wysokości **{{cena_wdrozenie}} zł netto**,
   b) **miesięczny Abonament** w wysokości **{{cena_abonament}} zł netto**,
{{#GLOS}}
   c) w przypadku modułu głosowego — **Overage** za minuty głosowe ponad limit: **{{stawka_overage}} zł za każdą rozpoczętą minutę** ponad **{{limit_minut}}** minut miesięcznie,
{{/GLOS}}
   d) opłaty za wybrane dodatki zgodnie z **Załącznikiem nr 3 (Cennik i overage)**.
2. **Status VAT / charakter cen:** wszystkie kwoty w Umowie podane są jako **kwoty netto**. Wykonawca korzysta ze **zwolnienia podmiotowego z VAT na podstawie art. 113 ust. 1 ustawy o VAT**, w związku z czym do kwot netto **nie dolicza się podatku VAT — kwota brutto jest równa kwocie netto**. W razie utraty prawa do zwolnienia (np. po przekroczeniu limitu obrotu 200 000 zł w roku) do kwot netto zostanie doliczony podatek VAT według obowiązującej stawki, o czym Wykonawca uprzedzi Zamawiającego.
3. **Limity wliczone w Pakiet** (minuty głosu, SMS) określa Załącznik nr 3. Po przekroczeniu limitu SMS naliczana jest opłata zgodnie z Załącznikiem nr 3. Wykonawca informuje Zamawiającego (np. mailowo/automatycznie) po osiągnięciu ok. 80% limitu minut.
{{#GLOS}}
4. **Twardy limit bezpieczeństwa (cap):** **{{cap_minut}}** minut głosu miesięcznie. Po jego przekroczeniu Wykonawca może czasowo ograniczyć moduł głosowy do czasu uzgodnienia większego pakietu minut — dla ochrony przed anomalią kosztową.
{{/GLOS}}
5. **Pierwszy miesiąc abonamentu gratis.** Pierwsza płatność Zamawiającego obejmuje wyłącznie opłatę wdrożeniową. Abonament naliczany jest **od 2. miesiąca** liczonego od Go-live. Miesiąc gratisowy wlicza się do Okresu Podstawowego (§ 5).
6. **Terminy płatności:**
   a) opłata wdrożeniowa — płatna z góry, w terminie **7** dni od wystawienia faktury/proformy, przed rozpoczęciem Wdrożenia,
   b) Abonament — płatny **z góry**, do **5.** dnia każdego miesiąca lub w terminie **7** dni od faktury,
   c) Overage i opłaty dodatkowe — rozliczane z dołu za miniony miesiąc, w terminie **7** dni od faktury.
7. Płatność następuje przelewem na rachunek: **{{nr_konta}}**. Za dzień zapłaty uznaje się dzień uznania rachunku Wykonawcy.
8. **Opłata wdrożeniowa jest bezzwrotna po wykonaniu Wdrożenia** (uruchomieniu Usług). Wynika to z nakładu prac konfiguracyjnych ponoszonych z góry.
9. **Opóźnienie w płatności.** Jeśli Zamawiający zapłaci po terminie, Wykonawcy przysługują odsetki ustawowe za opóźnienie w transakcjach handlowych oraz zryczałtowana rekompensata za koszty odzyskiwania należności — zgodnie z ustawą z dnia 8 marca 2013 r. o przeciwdziałaniu nadmiernym opóźnieniom w transakcjach handlowych. Są to stawki wynikające wprost z ustawy — Wykonawca nie nalicza żadnych dodatkowych kar.

---

## § 5. Okres obowiązywania i wypowiedzenie

1. Umowa zawarta jest na **czas określony 12 miesięcy** liczonych od dnia Go-live (dalej: **„Okres Podstawowy"**). Przez ten czas abonament jest stały (§ 4). Pierwszy miesiąc opieki jest gratis (§ 4 ust. 5) i liczy się do tych 12 miesięcy.
2. **14-dniowe prawo odstąpienia (gwarancja działającej usługi).** Jeśli w ciągu **14 dni od Go-live** okaże się, że Usługa nie spełnia któregoś z **mierzalnych kryteriów „Usługa działa" określonych dla wybranego Pakietu w Załączniku nr 2**, Zamawiający może odstąpić od Umowy. Wystarczy wiadomość e-mail — **ze wskazaniem konkretnego kryterium z Załącznika nr 2**, którego Usługa nie spełnia. Warunek: Zamawiający najpierw zgłasza problem, a Wykonawca ma **7 dni** na jego usunięcie; jeśli po tym czasie Usługa nadal nie spełnia wskazanego kryterium, odstąpienie jest skuteczne. W razie odstąpienia Wykonawca **zwraca opłatę wdrożeniową**, pomniejszoną wyłącznie o **faktycznie zużyte koszty zmienne** (wykorzystane minuty głosu i wysłane SMS) oraz realne, udokumentowane koszty poniesione u Dostawców zewnętrznych — a Umowa wygasa bez dalszych zobowiązań stron. **To nie jest „gwarancja satysfakcji" ani prawo zwrotu bez powodu** — podstawą jest wyłącznie obiektywna niezgodność z kryterium z Załącznika nr 2, a nie subiektywna ocena, zmiana potrzeb czy oczekiwanie konkretnego rezultatu handlowego. Prawo to nie obejmuje sytuacji, gdy Usługa nie działa z winy Zamawiającego (brak dostępów, materiałów lub współdziałania z § 3).
3. **Wypowiedzenie w każdej chwili.** Niezależnie od czasu określonego, **każda ze Stron może wypowiedzieć Umowę z zachowaniem 30-dniowego (miesięcznego) okresu wypowiedzenia**, ze skutkiem na koniec miesiąca kalendarzowego, e-mailem. Zamawiający nie musi podawać powodu.
4. **Automatyczne odnowienie.** Jeżeli żadna ze Stron nie wypowie Umowy najpóźniej na 30 dni przed końcem Okresu Podstawowego, Umowa odnawia się na kolejne 12 miesięcy (nadal na czas określony) — i tak po każdym okresie. W okresie odnowionym obowiązuje aktualny cennik Wykonawcy. O ewentualnej zmianie ceny Wykonawca uprzedza Zamawiającego e-mailem **co najmniej 30 dni przed** odnowieniem; jeśli Zamawiający nie zgadza się na nową cenę, może wypowiedzieć Umowę (ust. 3) — brak wypowiedzenia oznacza zgodę na odnowienie. W każdym odnowionym okresie nadal przysługuje 30-dniowe wypowiedzenie z ust. 3.
5. **Rozwiązanie przez Wykonawcę ze skutkiem natychmiastowym** możliwe jest, gdy Zamawiający: (a) zalega z płatnością ponad **30 dni** mimo wezwania, (b) poważnie narusza Umowę, albo (c) korzysta z Usług niezgodnie z prawem lub w sposób zagrażający Dostawcom zewnętrznym.
6. Zakończenie Umowy nie zwalnia Zamawiającego z zapłaty za usługi wykonane do dnia zakończenia.
7. Po zakończeniu Umowy nadal obowiązują zapisy o poufności, ochronie danych, prawach do Silnika i ograniczeniu odpowiedzialności.
8. **Rozszerzenie współpracy (aneks).** Jeśli w trakcie trwania Umowy Zamawiający chce dodać nowy moduł lub przejść na wyższy Pakiet, Strony podpisują aneks. Aneks rozpoczyna nowy 12-miesięczny Okres Podstawowy dla całości Usług, liczony od jego daty — z tym samym 30-dniowym prawem wypowiedzenia (ust. 3) i zasadą odnowienia (ust. 4). Aneks ustala też nową wysokość abonamentu i ewentualną opłatę za rozszerzenie. Wykonawca informuje o skutku aneksu (nowy 12-miesięczny okres) **przed** jego podpisaniem, aby decyzja była świadoma. Pełny opis wraz z przykładem znajduje się w § 5 ust. 8 wzoru głównego („UMOWA-uslugowa-AI.md").

---

## § 6. Ochrona przed brakiem płatności (wstrzymanie Usług)

1. Jeśli Zamawiający spóźnia się z płatnością, Wykonawca najpierw wysyła **wezwanie e-mail** z dodatkowym terminem **3 dni**.
2. Dopiero gdy ten termin minie bezskutecznie (czyli **po 7 dniach zwłoki**), Wykonawca może **czasowo wstrzymać Usługi** — np. wyłączyć Recepcję AI, chatbota i automatyzacje — do czasu zapłaty.
3. Wstrzymanie Usług **nie jest** rozwiązaniem Umowy i nie zwalnia z zapłaty abonamentu za ten okres. Po zapłacie Wykonawca niezwłocznie wznawia działanie.
4. Zwłoka ponad **30 dni** pozwala Wykonawcy rozwiązać Umowę ze skutkiem natychmiastowym (§ 5 ust. 5).

---

## § 7. Prawa własności intelektualnej

1. **Silnik pozostaje wyłączną własnością Wykonawcy.** Oprogramowanie, workflow, prompty, konfiguracje, integracje, scenariusze i know-how nie są przenoszone na Zamawiającego. Zamawiający **nie nabywa** do nich praw autorskich ani prawa do samodzielnego kopiowania, odsprzedaży czy udostępniania osobom trzecim.
2. Na czas obowiązywania Umowy Wykonawca udziela Zamawiającemu **licencji niewyłącznej, nieprzenoszalnej**, ograniczonej do korzystania z Usług zgodnie z ich przeznaczeniem. Licencja wygasa z chwilą zakończenia Umowy.
3. **Dane Zamawiającego pozostają własnością Zamawiającego.** Wykonawca przetwarza je wyłącznie w celu świadczenia Usług oraz na zasadach określonych w **Załączniku nr 1 (Powierzenie przetwarzania danych — RODO)**.
4. **Eksport danych przy zakończeniu.** Po zakończeniu Umowy — **pod warunkiem uregulowania wszystkich należności** — Wykonawca na wniosek Zamawiającego przekaże Dane Zamawiającego w powszechnym formacie (CSV/JSON) w terminie **14** dni, a następnie usunie je zgodnie z Załącznikiem nr 1.
5. Wykonawca może posługiwać się faktem współpracy (nazwą/logo Zamawiającego) w celach referencyjnych/portfolio, chyba że Zamawiający zgłosi sprzeciw na Trwałym nośniku.

---

## § 8. Poziom usług (SLA) i wsparcie

1. Wsparcie techniczne świadczone jest w **dni robocze w godzinach 9:00–17:00**, kanałami: e-mail kontakt@stronevo.pl oraz telefon [TELEFON].
2. **Czas reakcji** na zgłoszenie awarii krytycznej (całkowity brak działania kluczowego modułu): **do 24 godzin roboczych** od zgłoszenia. Czas reakcji oznacza podjęcie działań, nie usunięcie awarii — termin usunięcia zależy m.in. od Dostawców zewnętrznych.
3. **Wykonawca nie gwarantuje nieprzerwanej dostępności Usług ani parametru uptime (np. 99,9%).** Usługi zależą od infrastruktury i API Dostawców zewnętrznych (§ 10). Wykonawca dokłada należytej staranności, by minimalizować przerwy.
4. Planowane prace serwisowe Wykonawca w miarę możliwości zapowiada z wyprzedzeniem.

---

## § 9. Nagrywanie rozmów (Recepcja AI)

{{#BEZGLOSU}}
*Nie dotyczy — wybrany Pakiet nie obejmuje modułu głosowego (Recepcji AI).*
{{/BEZGLOSU}}
{{#GLOS}}
1. Jeśli Zamawiający korzysta z Recepcji AI, moduł ten **nagrywa i przetwarza rozmowy** dzwoniących, aby obsłużyć połączenie i umówić wizytę. Każda rozmowa zaczyna się od komunikatu informującego, że rozmówca rozmawia z automatycznym asystentem i że rozmowa jest nagrywana.
2. **Administratorem danych dzwoniących jest Zamawiający.** To on odpowiada za poinformowanie swoich klientów i za podstawę prawną nagrywania. Wykonawca dostarcza narzędzie i komunikat startowy oraz działa jako podmiot przetwarzający.
3. **Szczegóły — w Załączniku nr 1 (RODO):** dokładna treść komunikatu startowego, okresy przechowywania nagrań i transkrypcji (retencja), zasady dla branży medycznej (dane o zdrowiu, art. 9 RODO) oraz lista dostawców i miejsce przetwarzania danych. Część dostawców przetwarza dane poza Europejskim Obszarem Gospodarczym (m.in. w USA); transfer odbywa się na podstawie **standardowych klauzul umownych (SCC)** lub **Data Privacy Framework (DPF)**, zgodnie z rejestrem w Załączniku nr 1. W Załączniku nr 1 opisane są też role stron przy danych wrażliwych.
4. **Podstawa prawna nagrywania.** Podstawą nagrywania rozmów jest **zgoda dzwoniącego** wyrażona przez kontynuowanie rozmowy po komunikacie startowym (art. 6 ust. 1 lit. a RODO) lub **uzasadniony interes** administratora (art. 6 ust. 1 lit. f RODO). Przetwarzanie danych szczególnych (np. o zdrowiu) odbywa się wyłącznie na podstawie art. 9 ust. 2 RODO, za co jako administrator odpowiada Zamawiający.
{{/GLOS}}

---

## § 10. Zależność od Dostawców zewnętrznych

1. Zamawiający przyjmuje do wiadomości, że Usługi opierają się na API i infrastrukturze Dostawców zewnętrznych (m.in. telefonia/STT/TTS, model językowy, SMS, hosting, kalendarz) — lista w Załączniku nr 1.
2. Wykonawca **nie odpowiada** za przerwy, zmiany cen, limitów, funkcjonalności lub zaprzestanie działania po stronie Dostawców zewnętrznych, na które nie ma wpływu. W miarę możliwości Wykonawca dokona migracji do alternatywnego dostawcy.
3. Istotny wzrost kosztów Dostawców zewnętrznych (w szczególności kosztu minuty głosowej) może skutkować korektą Overage lub Abonamentu w trybie § 12.

---

## § 11. Odpowiedzialność

1. **Łączna odpowiedzialność Wykonawcy** wobec Zamawiającego ograniczona jest do wysokości abonamentu zapłaconego za **ostatnie 3 miesiące** przed zdarzeniem, które wywołało szkodę. To typowe i uczciwe rozwiązanie w usługach abonamentowych — chroni obie strony przed roszczeniami niewspółmiernymi do wartości usługi.
2. Wykonawca nie odpowiada za **utracone korzyści** ani szkody pośrednie (np. utratę klientów, przychodów czy reputacji), w szczególności gdy wynikają z działania Dostawców zewnętrznych.
3. Powyższe ograniczenia **nie obejmują** szkód wyrządzonych umyślnie ani przypadków, w których prawo nie pozwala wyłączyć odpowiedzialności — w tym zakresie Wykonawca odpowiada w pełni.
4. Wykonawca nie odpowiada za skutki: nieprawdziwych lub bezprawnych materiałów Zamawiającego, braku współdziałania, samodzielnych zmian konfiguracji przez Zamawiającego oraz siły wyższej.
5. Zamawiający odpowiada za treści i decyzje podejmowane na podstawie działania Usług oraz za swoje obowiązki wobec klientów końcowych (w tym RODO jako administrator danych).

---

## § 12. Zmiana wysokości wynagrodzenia

1. Wykonawca może zmienić wysokość Abonamentu lub stawki Overage z **30-dniowym wyprzedzeniem**, informując Zamawiającego na Trwałym nośniku, w szczególności w razie istotnego wzrostu kosztów Dostawców zewnętrznych lub rozszerzenia zakresu Usług.
2. Jeżeli Zamawiający nie akceptuje zmiany, może wypowiedzieć Umowę na zasadach § 5 (30-dniowe wypowiedzenie); brak wypowiedzenia w terminie **30** dni od zawiadomienia oznacza zgodę na nową cenę. Zmiana ceny na okres odnowiony następuje w trybie § 5 ust. 4.
3. Zmiana zakresu Usług na wniosek Zamawiającego (change request) realizowana jest w formie aneksu lub uzgodnienia na Trwałym nośniku i może wiązać się z dodatkową opłatą; wpływ aneksu rozszerzającego na Okres Podstawowy określa § 5 ust. 8.

---

## § 13. Poufność

1. Strony zobowiązują się do zachowania w poufności informacji handlowych, technicznych i organizacyjnych drugiej Strony, uzyskanych w związku z Umową.
2. Obowiązek poufności nie dotyczy informacji publicznie dostępnych lub których ujawnienie jest wymagane przez prawo lub organ.
3. Obowiązek poufności obowiązuje w czasie trwania Umowy i przez **3** lata po jej zakończeniu.
4. Ochrona danych osobowych uregulowana jest odrębnie w Załączniku nr 1 (RODO).

---

## § 14. Siła wyższa

1. Żadna ze Stron nie ponosi odpowiedzialności za niewykonanie lub nienależyte wykonanie Umowy spowodowane siłą wyższą (zdarzenie zewnętrzne, nadzwyczajne, niemożliwe do przewidzenia i zapobieżenia), w tym awarie o zasięgu ponadlokalnym, działania organów władzy, przerwy w dostawie energii/Internetu niezależne od Strony.
2. Strona dotknięta siłą wyższą niezwłocznie informuje drugą Stronę.

---

## § 15. Postanowienia końcowe

1. Wszelkie zmiany Umowy wymagają formy dokumentowej pod rygorem nieważności.
2. W sprawach nieuregulowanych stosuje się przepisy prawa polskiego, w szczególności Kodeksu cywilnego (o świadczeniu usług / zleceniu — art. 750 k.c.) oraz RODO.
3. Prawem właściwym jest prawo polskie. Sądem właściwym jest sąd właściwy miejscowo dla siedziby Wykonawcy.
4. Jeżeli którekolwiek postanowienie Umowy okaże się nieważne, pozostałe zachowują moc; Strony zastąpią je postanowieniem najbliższym celowi.
5. Załączniki stanowią integralną część Umowy.
6. Umowę sporządzono w formie elektronicznej / w 2 jednobrzmiących egzemplarzach.

**Załączniki:**

- Załącznik nr 1 — Umowa powierzenia przetwarzania danych osobowych (RODO, art. 28) wraz z rejestrem subprocesorów
- Załącznik nr 2 — Specyfikacja usług (moduły Pakietu)
- Załącznik nr 3 — Cennik i overage
- (opcjonalnie) Załącznik nr 4 — Wzór faktury/proformy

---

| WYKONAWCA | ZAMAWIAJĄCY |
|---|---|
| Bartosz Gontarek (STRONEVO) | {{zamawiajacy_nazwa}} |
| Data i podpis: ................... | Data i podpis: ................... |

---

# ZAŁĄCZNIK NR 2 — SPECYFIKACJA USŁUG

**Wybrany Pakiet:** {{pakiet_nazwa}}

### Moduły w Pakietach
| Moduł | Starter | Pro | Premium |
|---|:-:|:-:|:-:|
| Chatbot AI 24/7 (WWW+Messenger, baza wiedzy/RAG) | ✅ | ✅ | ✅ |
| Rezerwacje online (1 kalendarz) | ✅ | ✅ | ✅ |
| Missed-call → SMS z linkiem | ✅ | ✅ | ✅ |
| Przypomnienia SMS (anty-no-show) | ✅ | ✅ | ✅ |
| Opinie AI (prośby o opinię Google) | ✅ | ✅ | ✅ |
| Kalendarz zespołu (wiele stanowisk) | — | ✅ | ✅ |
| Lista rezerwowa (waitlist) | — | ✅ | ✅ |
| Opinie AI z odpowiedziami | — | ✅ | ✅ |
| Raport miesięczny | — | ✅ | ✅ |
| Recepcja AI głosowa „Ada" (nagrywanie) | — | — | ✅ |
| WhatsApp | — | — | ✅ |
| Analityka (dashboard) | — | — | ✅ |

Limity w cenie: Starter 500 SMS · Pro 800 SMS · Premium 800 SMS + 500 min głosu (overage {{stawka_overage}} zł/min, cap {{cap_minut}} min).

### Kryterium „USŁUGA DZIAŁA" (podstawa gwarancji z § 5 ust. 2)
**Starter** — łącznie: (1) chatbot osadzony na WWW i odpowiada z bazy wiedzy + kieruje do rezerwacji; (2) rezerwacja testowa trafia do kalendarza; (3) missed-call → SMS z linkiem w ≤ 5 min; (4) przypomnienie zaplanowane i wysłane; (5) prośba o opinię wysłana po zakończonej wizycie; (6) kanał SMS aktywny (dostarczalność potwierdzona).
**Pro** — kryteria Startera + (1) kalendarz zespołu kieruje do właściwego stanowiska; (2) waitlist wysyła propozycję obsadzenia; (3) Opinie AI generują odpowiedź do akceptacji; (4) raport miesięczny wygenerowany i dostarczony.
**Premium** — kryteria Pro + (1) Ada odbiera i odtwarza komunikat nagrywania PRZED nagraniem; (2) rozumie polski, umawia, wizyta w kalendarzu; (3) nagranie + transkrypcja + auto-delete wg retencji; (4) WhatsApp odpowiada; (5) dashboard pokazuje zdarzenia; (6) licznik minut + alarm 80%.

> Kryteria weryfikuje się przy poprawnych i kompletnych danych/dostępach Zamawiającego (§ 3). Braki po stronie Zamawiającego nie stanowią wady Usługi.

### Granice zakresu
Brak gwarancji rezultatu handlowego. Zależność od Dostawców zewnętrznych (§ 10, bez uptime SLA). Zmiany treści w abonamencie: Starter do 2/mc, Pro do 4/mc, Premium do 6/mc + 1 aktualizacja scenariusza Ady (powyżej = change request). Integracje spoza listy / drugi język / KSeF = płatny dodatek (Załącznik nr 3).

{{#GLOS}}
**Komunikat startowy Recepcji AI** (odtwarzany PRZED nagrywaniem): „Dzień dobry, rozmawiasz z automatycznym asystentem głosowym firmy {{zamawiajacy_nazwa}}. Rozmowa jest nagrywana i przetwarzana w celu obsługi i umówienia wizyty. Szczegóły w polityce prywatności."
{{/GLOS}}

---

# ZAŁĄCZNIK NR 3 — CENNIK I OVERAGE

**Dla niniejszej Umowy (Pakiet {{pakiet_nazwa}}):** wdrożenie **{{cena_wdrozenie}} zł** + abonament **{{cena_abonament}} zł/mc** (ceny końcowe, zwolnienie z VAT art. 113). Pierwszy miesiąc abonamentu gratis (§ 4 ust. 5).

### Cennik pakietów (referencyjnie)
| | Starter | Pro | Premium |
|---|---|---|---|
| Wdrożenie | 990 zł | 1 490 zł | 2 900 zł |
| Abonament/mc | 449 zł | 599 zł | 1 490 zł |
| Minuty głosu w cenie | — | — | 500/mc |
| Overage głos | — | — | {{stawka_overage}} zł/rozp. min |
| Cap minut | — | — | {{cap_minut}}/mc |
| SMS w cenie | 500 | 800 | 800 |
| SMS ponad limit | 0,25 zł | 0,20 zł | 0,20 zł |

### Dodatki à-la-carte
Recepcja AI (dodatek) 1 490 + 599/mc (300 min, overage {{stawka_overage}} zł/min) · Chatbot RAG od 990 + od 449/mc · Opinie AI od 490 + 99/mc · Automatyzacja n8n od 690 + wg zakresu · KSeF/faktury 890 + 99/mc · drugi język 1 200 + 149/mc · +200 min głosu 229/mc · +500 SMS 79/mc.

**Naliczanie:** abonament z góry; overage z dołu za miniony miesiąc; minuty w górę do pełnej; SMS per segment; limity nie kumulują się. Przelew na: **{{nr_konta}}**.
`.trim();

// Wartości domyślne modułu głosowego (Załącznik nr 3) — parametryzowalne w ENV
const GLOS_DEFAULTS = {
  limit_minut: process.env.VOICE_LIMIT_MINUT ?? '500',
  stawka_overage: process.env.VOICE_STAWKA_OVERAGE ?? '1,39',
  cap_minut: process.env.VOICE_CAP_MINUT ?? '1500',
};

export function formatDatePl(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

// Wartości merge trafiają do HTML — escapujemy dane wpisywane ręcznie w CRM
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

// Merge danych kontaktu + pakietu w treść umowy (markdown).
// Logika warunkowa: pakiet z "Recepcja AI" → bloki {{#GLOS}}; inaczej {{#BEZGLOSU}}.
export function renderContract(template: string, contact: Contact, contract: Contract): string {
  const hasVoice = contract.lista_automatyzacji.some((a) =>
    a.toLowerCase().includes('recepcja')
  );

  // 1. Bloki warunkowe
  const out = template
    .replace(/\{\{#GLOS\}\}([\s\S]*?)\{\{\/GLOS\}\}/g, hasVoice ? '$1' : '')
    .replace(/\{\{#BEZGLOSU\}\}([\s\S]*?)\{\{\/BEZGLOSU\}\}/g, hasVoice ? '' : '$1');

  // 2. Pola merge (opcjonalne bez wartości → "—")
  const fields: Record<string, string> = {
    data_umowy: formatDatePl(contract.created_at),
    zamawiajacy_nazwa: escapeHtml(contact.firma ?? contact.imie),
    zamawiajacy_forma: '—',
    zamawiajacy_adres: escapeHtml(contact.adres ?? contact.miasto ?? '—'),
    zamawiajacy_nip: escapeHtml(contact.nip ?? '—'),
    zamawiajacy_regon_krs: 'REGON/KRS: —',
    zamawiajacy_reprezentant: escapeHtml(contact.imie),
    zamawiajacy_email: escapeHtml(contact.email ?? '—'),
    zamawiajacy_telefon: escapeHtml(contact.telefon ?? '—'),
    pakiet_nazwa: escapeHtml(contract.pakiet_nazwa),
    cena_wdrozenie: String(contract.cena_wdrozenie),
    cena_abonament: String(contract.cena_abonament),
    lista_automatyzacji: contract.lista_automatyzacji
      .map((a) => `- ${escapeHtml(a)}`)
      .join('\n'),
    data_startu: formatDatePl(contract.data_startu),
    nr_konta: process.env.BANK_ACCOUNT ?? '[nr konta — ENV BANK_ACCOUNT]',
    ...GLOS_DEFAULTS,
  };

  return out.replace(/\{\{(\w+)\}\}/g, (_, key: string) => fields[key] ?? `{{${key}}}`);
}
