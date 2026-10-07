import type { Metadata } from 'next';
import { Playfair_Display, Inter } from 'next/font/google';
import './globals.css';

const playfair = Playfair_Display({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-playfair',
});

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'STRONEVO OS',
  description: 'Wewnętrzny panel operacyjny STRONEVO.AI',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" className={`${playfair.variable} ${inter.variable}`}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
