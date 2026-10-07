import { Contact, Contract } from './types';
import { escapeHtml, formatDatePl } from './contract-template';

// Wzór wypowiedzenia umowy — wersja MERGE z vaulta (WZOR-WYPOWIEDZENIA-UMOWY.md).
// Zgodny z umową główną: czas określony 12 mc + 30-dniowe wypowiedzenie
// (§ 5 ust. 3 umowy w wersji bieżącej / ust. 2 wersji z wzoru) + auto-odnowienie.
// PROJEKT POGLĄDOWY — finalizacja przez radcę prawnego przed użyciem z klientem.
export const TERMINATION_TEMPLATE = `
# PROJEKT POGLĄDOWY — DO WERYFIKACJI PRZEZ RADCĘ PRAWNEGO. Nie stanowi porady prawnej.

> Wzór roboczy STRONEVO.AI generowany automatycznie. Oświadczenie o wypowiedzeniu Umowy o świadczenie usług automatyzacji AI. Zapisy wymagają finalizacji przez polskiego radcę prawnego / adwokata przed użyciem z klientem.

---

# OŚWIADCZENIE O WYPOWIEDZENIU UMOWY

Piaseczno, dnia **{{data_wypowiedzenia}}**

**WYPOWIADAJĄCY (Nadawca):** {{wypowiadajacy}}
**ADRESAT:** druga Strona Umowy

**Dane Stron Umowy:**

**WYKONAWCA:**
Bartosz Gontarek, prowadzący jednoosobową działalność gospodarczą pod firmą **STRONEVO Bartosz Gontarek** (marka: STRONEVO / STRONEVO.AI), [ADRES FIRMY], **NIP: [NIP]**, REGON: [REGON], e-mail: kontakt@stronevo.pl, tel. [TELEFON].

**ZAMAWIAJĄCY:**
**{{zamawiajacy_nazwa}}**.

---

## Treść oświadczenia

1. Działając w imieniu **{{wypowiadajacy}}**, na podstawie **postanowień Umowy o świadczenie usług automatyzacji AI o 30-dniowym okresie wypowiedzenia** nr **{{nr_umowy}}** zawartej w dniu **{{data_umowy}}** pomiędzy Wykonawcą (STRONEVO Bartosz Gontarek) a Zamawiającym (**{{zamawiajacy_nazwa}}**) (dalej: **„Umowa"**),

niniejszym **wypowiadam Umowę z zachowaniem miesięcznego (30-dniowego) okresu wypowiedzenia**, ze skutkiem na koniec miesiąca kalendarzowego.

2. **Okres wypowiedzenia** biegnie zgodnie z Umową — liczony jest od dnia doręczenia niniejszego oświadczenia drugiej Stronie i wynosi 30 dni, ze skutkiem rozwiązującym na koniec miesiąca kalendarzowego. W związku z powyższym **Umowa ulega rozwiązaniu z dniem {{data_zakonczenia}}** (dalej: **„Dzień Zakończenia"**). *(Datę Dnia Zakończenia należy zweryfikować względem faktycznej daty doręczenia — decyduje doręczenie, nie data sporządzenia pisma.)* **[DO WERYFIKACJI PRZEZ PRAWNIKA: sposób liczenia terminu — 30 dni od doręczenia vs skutek na koniec miesiąca kalendarzowego; przy rozbieżności obowiązuje termin dalej idący zgodnie z Umową.]**

3. **Forma i doręczenie.** Oświadczenie składane jest w **formie dokumentowej ({{sposob_doreczenia}})**, zgodnie z Umową (dopuszczalna forma dokumentowa / e-mail). Za dzień doręczenia uznaje się dzień, w którym oświadczenie dotarło do adresata w sposób umożliwiający zapoznanie się z jego treścią. W przypadku doręczenia mailowego oświadczenie kierowane jest na adres **{{email_adresata}}**. **[DO WERYFIKACJI PRZEZ PRAWNIKA: czy dla skuteczności wystarcza forma dokumentowa/e-mail, czy — zależnie od finalnego brzmienia § 15 Umowy — wymagana jest forma pisemna; ustalić spójnie z Umową.]**

4. **Rozliczenie do Dnia Zakończenia.** Zgodnie z Umową wypowiedzenie nie zwalnia Zamawiającego z obowiązku zapłaty wynagrodzenia (w tym Abonamentu oraz opłat Overage / dodatkowych) należnego za okres świadczenia Usług **do Dnia Zakończenia włącznie**. Strony dokonają końcowego rozliczenia na zasadach § 4 Umowy. Ewentualne nadpłaty/niedopłaty za niepełny miesiąc zostaną rozliczone proporcjonalnie. **[DO WERYFIKACJI PRZEZ PRAWNIKA: proporcjonalne rozliczenie abonamentu za niepełny miesiąc — potwierdzić spójność z modelem płatności „z góry" z § 4 ust. 6 lit. b Umowy.]**

5. **Zwrot i eksport danych (RODO).** Zgodnie z § 7 ust. 4 Umowy oraz Załącznikiem nr 1 (powierzenie przetwarzania — RODO):

- Zamawiający może w terminie do Dnia Zakończenia złożyć wniosek o **eksport Danych Zamawiającego** w powszechnym formacie (CSV/JSON); Wykonawca przekaże je w terminie **14 dni**, **pod warunkiem uregulowania wszystkich należności**;
- po przekazaniu danych (a najpóźniej po Dniu Zakończenia i zakończeniu rozliczeń) Wykonawca **usunie lub zanonimizuje Dane Zamawiającego** przetwarzane jako podmiot przetwarzający, zgodnie z zasadami i terminami retencji z Załącznika nr 1 (m.in. nagrania rozmów, transkrypcje, historia rezerwacji, dane kontaktowe);
- administratorem danych klientów końcowych pozostaje Zamawiający — po zakończeniu Umowy to Zamawiający odpowiada za dalsze przechowywanie/usunięcie danych po swojej stronie.

6. **Zaprzestanie świadczenia Usług.** Z Dniem Zakończenia Wykonawca **zaprzestaje świadczenia Usług** objętych Umową (w szczególności wyłączenia Recepcji AI / Ada, chatbota oraz automatyzacji) i **wygasa licencja** na korzystanie z Silnika udzielona na czas obowiązywania Umowy (§ 7 ust. 2). Strony potwierdzą fakt zakończenia świadczenia na Trwałym nośniku (e-mail). Numer telefoniczny / przekierowania zostaną rozwiązane zgodnie z ustaleniami z etapu Wdrożenia (§ 3 ust. 4 Umowy).

7. **Postanowienia trwające po zakończeniu.** Zgodnie z Umową w mocy pozostają postanowienia dotyczące poufności (§ 13), ochrony danych osobowych (Załącznik nr 1), praw własności intelektualnej (§ 7) oraz ograniczenia odpowiedzialności (§ 11).

8. **Brak wpływu na inne roszczenia.** Niniejsze wypowiedzenie nie stanowi zrzeczenia się jakichkolwiek roszczeń powstałych do Dnia Zakończenia i nie wyłącza uprawnień Stron przewidzianych Umową i przepisami prawa.

9. *(informacyjnie)* Prawo do wypowiedzenia przysługuje **niezależnie od zawarcia Umowy na czas określony** oraz od ewentualnego aneksu re-startującego Okres Podstawowy. Wypowiedzenie skutkuje zakończeniem Umowy z upływem okresu wypowiedzenia, bez potrzeby oczekiwania na koniec Okresu Podstawowego.

---

Z poważaniem,

**{{wypowiadajacy}}**

Podpis: ...................................................

*(W imieniu Wykonawcy: Bartosz Gontarek, STRONEVO / w imieniu Zamawiającego: {{zamawiajacy_nazwa}} — zależnie od tego, która Strona składa oświadczenie.)*
`.trim();

export type TerminatingParty = 'Zamawiający' | 'Wykonawca';

// Dzień Zakończenia: 30 dni od doręczenia, ze skutkiem na koniec miesiąca
// kalendarzowego — stosujemy termin dalej idący (koniec miesiąca, w którym
// upływa 30 dni). Decyduje DORĘCZENIE — przy realnym użyciu zweryfikować datę.
export function terminationEndDate(deliveryDate: Date): Date {
  const plus30 = new Date(deliveryDate);
  plus30.setDate(plus30.getDate() + 30);
  // ostatni dzień miesiąca, w którym wypada plus30
  return new Date(plus30.getFullYear(), plus30.getMonth() + 1, 0);
}

export function renderTermination(
  contact: Contact,
  contract: Contract,
  opts: { wypowiadajacy: TerminatingParty; sposobDoreczenia?: string }
): string {
  const today = new Date();
  const endDate = terminationEndDate(today);

  // Adresatem jest druga Strona — e-mail zależnie od kierunku wypowiedzenia
  const emailAdresata =
    opts.wypowiadajacy === 'Zamawiający' ? 'kontakt@stronevo.pl' : (contact.email ?? '—');

  const fields: Record<string, string> = {
    data_wypowiedzenia: formatDatePl(today.toISOString()),
    wypowiadajacy: opts.wypowiadajacy,
    zamawiajacy_nazwa: escapeHtml(contact.firma ?? contact.imie),
    nr_umowy: contract.id,
    data_umowy: formatDatePl(contract.created_at),
    data_zakonczenia: formatDatePl(endDate.toISOString()),
    sposob_doreczenia: opts.sposobDoreczenia ?? 'e-mail',
    email_adresata: escapeHtml(emailAdresata),
  };

  return TERMINATION_TEMPLATE.replace(
    /\{\{(\w+)\}\}/g,
    (_, key: string) => fields[key] ?? `{{${key}}}`
  );
}
