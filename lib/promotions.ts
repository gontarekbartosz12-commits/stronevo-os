import { Promotion } from './types';

// Promocje wyświetlane w panelu klienta — do edycji ręcznej
// (docelowo tabela w bazie, gdy będzie potrzeba zarządzania z panelu CEO).
export const PROMOTIONS: Promotion[] = [
  {
    tytul: 'Pakiet rośnie — cena spada',
    opis: 'Każda kolejna automatyzacja w pakiecie to większy rabat na wdrożenie: 10% przy jednej, 15% przy dwóch, 20% przy trzech i więcej.',
    badge: 'DO -20%',
  },
  {
    tytul: 'Poleć STRONEVO',
    opis: 'Za skuteczne polecenie innej firmy otrzymasz miesiąc abonamentu gratis — naliczany po starcie usług u poleconego.',
    badge: '1 MC GRATIS',
  },
  {
    tytul: 'Pierwszy miesiąc zawsze gratis',
    opis: 'Każda nowa automatyzacja w Twoim pakiecie startuje z bezpłatnym pierwszym miesiącem abonamentu.',
    badge: '1. MC 0 zł',
  },
];

// Rabat na wdrożenie kolejnej automatyzacji wg wielkości posiadanego pakietu
export function upsellDiscount(ownedCount: number): number {
  if (ownedCount >= 3) return 20;
  if (ownedCount === 2) return 15;
  if (ownedCount === 1) return 10;
  return 0;
}
