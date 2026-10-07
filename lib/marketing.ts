import { BlockType, EmailCampaign, PageBlock } from './types';

// MARKETING (Faza 3 zaufania) — wspólna logika bloków: domyślne propsy,
// szablony startowe stron i render e-maila (kampanie reużywają bloków).

// ===== Domyślne propsy nowego bloku (edytor) =====

export function defaultBlockProps(typ: BlockType): Record<string, unknown> {
  switch (typ) {
    case 'hero':
      return {
        naglowek: 'Nagłówek, który sprzedaje efekt',
        podtytul: 'Jedno zdanie o tym, co klient zyskuje.',
        cta_label: 'Skontaktuj się',
        cta_url: '#formularz',
      };
    case 'features':
      return {
        naglowek: 'Co zyskujesz',
        items: [
          { tytul: 'Atut 1', opis: 'Krótki opis korzyści.' },
          { tytul: 'Atut 2', opis: 'Krótki opis korzyści.' },
          { tytul: 'Atut 3', opis: 'Krótki opis korzyści.' },
        ],
      };
    case 'form':
      return { form_id: null, naglowek: 'Zostaw kontakt' };
    case 'cta':
      return {
        naglowek: 'Gotowy na start?',
        tresc: 'Odezwij się — odpowiadamy tego samego dnia.',
        cta_label: 'Napisz do nas',
        cta_url: '#formularz',
      };
    case 'testimonials':
      return {
        naglowek: 'Opinie klientów',
        items: [{ autor: 'Klient', tresc: 'Krótka opinia o współpracy.' }],
      };
    case 'text':
      return { naglowek: '', tresc: 'Treść sekcji...' };
    case 'image':
      return { url: '', podpis: '' };
    case 'pricing':
      return {
        naglowek: 'Cennik',
        items: [{ nazwa: 'Usługa podstawowa', cena: 'od 100 zł', opis: 'Co obejmuje.' }],
      };
  }
}

// ===== Szablony startowe (operator tworzy stronę 1 klikiem) =====

export interface SiteTemplate {
  key: string;
  nazwa: string;
  opis: string;
  bloki: { typ: BlockType; props: Record<string, unknown> }[];
}

export const SITE_TEMPLATES: SiteTemplate[] = [
  {
    key: 'lokalna-usluga',
    nazwa: 'Usługa lokalna (lead-gen)',
    opis: 'Hero + atuty + opinie + formularz + CTA telefoniczne — klasyczny lejek firmy usługowej.',
    bloki: [
      { typ: 'hero', props: defaultBlockProps('hero') },
      { typ: 'features', props: defaultBlockProps('features') },
      { typ: 'testimonials', props: defaultBlockProps('testimonials') },
      { typ: 'form', props: defaultBlockProps('form') },
      { typ: 'cta', props: defaultBlockProps('cta') },
    ],
  },
  {
    key: 'promo-landing',
    nazwa: 'Landing promocyjny',
    opis: 'Krótki: hero + cennik + formularz — pod kampanię reklamową.',
    bloki: [
      { typ: 'hero', props: defaultBlockProps('hero') },
      { typ: 'pricing', props: defaultBlockProps('pricing') },
      { typ: 'form', props: defaultBlockProps('form') },
    ],
  },
];

// ===== Render e-maila z bloków (kampanie) =====
// Prosty, mailowo-bezpieczny HTML (inline style, tabele zbędne przy prostym layoucie).
// Tracking: pixel open + linki przez /api/email/track/click + stopka RODO 1-klik wypis.

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderCampaignHtml(
  campaign: Pick<EmailCampaign, 'temat' | 'bloki'>,
  opts: { appUrl: string; token: string; unsubId: string; firma: string; accent?: string }
): string {
  const accent = opts.accent ?? '#9b2242';
  const track = (url: string) =>
    `${opts.appUrl}/api/email/track/click?send=${encodeURIComponent(opts.token)}&url=${encodeURIComponent(url)}`;

  const blocksHtml = campaign.bloki
    .map(({ typ, props }) => {
      const p = props as Record<string, unknown>;
      switch (typ) {
        case 'hero':
          return `<h1 style="font-size:24px;margin:0 0 8px;color:#1c1917;">${esc(p.naglowek)}</h1>
            <p style="font-size:15px;color:#57534e;margin:0 0 20px;">${esc(p.podtytul)}</p>`;
        case 'text':
          return `${p.naglowek ? `<h2 style="font-size:18px;margin:24px 0 8px;color:#1c1917;">${esc(p.naglowek)}</h2>` : ''}
            <p style="font-size:14px;line-height:1.6;color:#44403c;white-space:pre-wrap;margin:0 0 16px;">${esc(p.tresc)}</p>`;
        case 'cta':
          return `<div style="text-align:center;margin:24px 0;">
            ${p.naglowek ? `<p style="font-size:16px;font-weight:600;color:#1c1917;margin:0 0 12px;">${esc(p.naglowek)}</p>` : ''}
            <a href="${track(String(p.cta_url ?? '#'))}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">${esc(p.cta_label ?? 'Sprawdź')}</a>
          </div>`;
        case 'image':
          return p.url
            ? `<img src="${esc(p.url)}" alt="${esc(p.podpis)}" style="max-width:100%;border-radius:8px;margin:12px 0;" />`
            : '';
        default:
          return '';
      }
    })
    .join('\n');

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f5f5f4;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;">
    ${blocksHtml}
    <hr style="border:none;border-top:1px solid #e7e5e4;margin:28px 0 12px;" />
    <p style="font-size:11px;color:#a8a29e;line-height:1.5;">
      Otrzymujesz tę wiadomość, bo wyraziłeś/aś zgodę marketingową (${esc(opts.firma)}).
      <a href="${opts.appUrl}/api/email/unsub?c=${encodeURIComponent(opts.unsubId)}" style="color:#a8a29e;">Wypisz się jednym kliknięciem</a>.
    </p>
    <img src="${opts.appUrl}/api/email/track/open?send=${encodeURIComponent(opts.token)}" width="1" height="1" alt="" style="display:block;" />
  </div>
  </body></html>`;
}

export function newTrackingToken(): string {
  return `tk-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

// ===== Bloki dozwolone w kampaniach e-mail (podzbiór builderowych) =====
export const EMAIL_BLOCK_TYPES: BlockType[] = ['hero', 'text', 'cta', 'image'];

// Porządkowanie kolejności bloków strony po przeniesieniu (edytor ↑↓)
export function reorder(blocks: PageBlock[], id: string, dir: -1 | 1): { id: string; kolejnosc: number }[] {
  const sorted = [...blocks].sort((a, b) => a.kolejnosc - b.kolejnosc);
  const idx = sorted.findIndex((b) => b.id === id);
  if (idx === -1 || idx + dir < 0 || idx + dir >= sorted.length) return [];
  const swap = sorted[idx + dir];
  return [
    { id: sorted[idx].id, kolejnosc: swap.kolejnosc },
    { id: swap.id, kolejnosc: sorted[idx].kolejnosc },
  ];
}
