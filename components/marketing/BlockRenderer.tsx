import FormBlock from './FormBlock';
import { FormDef, PageBlock } from '@/lib/types';

// Render bloków strony publicznej (/s/[slug]) — neutralny, jasny motyw
// (strona KLIENTA, nie panel STRONEVO); akcent z sites.theme.
// Ten sam renderer zasila podgląd w edytorze operatora.

interface FeatureItem {
  tytul?: string;
  opis?: string;
}
interface TestimonialItem {
  autor?: string;
  tresc?: string;
}
interface PricingItem {
  nazwa?: string;
  cena?: string;
  opis?: string;
}

export default function BlockRenderer({
  blocks,
  forms,
  accent,
}: {
  blocks: PageBlock[];
  forms: Map<string, FormDef>;
  accent: string;
}) {
  return (
    <>
      {blocks.map((block) => {
        const p = block.props as Record<string, unknown>;
        switch (block.typ) {
          case 'hero':
            return (
              <section key={block.id} className="px-6 py-16 text-center sm:py-24" style={{ backgroundColor: accent }}>
                <h1 className="mx-auto max-w-2xl font-serif text-3xl font-bold leading-tight text-white sm:text-4xl">
                  {String(p.naglowek ?? '')}
                </h1>
                {p.podtytul != null && String(p.podtytul) !== '' && (
                  <p className="mx-auto mt-4 max-w-xl text-base text-white/85">{String(p.podtytul)}</p>
                )}
                {p.cta_label != null && String(p.cta_label) !== '' && (
                  <a
                    href={String(p.cta_url ?? '#')}
                    className="mt-8 inline-block rounded-lg bg-white px-7 py-3 text-sm font-bold shadow-lg transition hover:opacity-90"
                    style={{ color: accent }}
                  >
                    {String(p.cta_label)}
                  </a>
                )}
              </section>
            );
          case 'features':
            return (
              <section key={block.id} className="mx-auto max-w-4xl px-6 py-14">
                {p.naglowek != null && String(p.naglowek) !== '' && (
                  <h2 className="mb-8 text-center font-serif text-2xl font-bold text-stone-800">
                    {String(p.naglowek)}
                  </h2>
                )}
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                  {((p.items as FeatureItem[]) ?? []).map((it, i) => (
                    <div key={i} className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
                      <p className="font-semibold text-stone-800">{it.tytul}</p>
                      <p className="mt-1.5 text-sm leading-relaxed text-stone-500">{it.opis}</p>
                    </div>
                  ))}
                </div>
              </section>
            );
          case 'testimonials':
            return (
              <section key={block.id} className="bg-stone-100 px-6 py-14">
                <div className="mx-auto max-w-3xl">
                  {p.naglowek != null && String(p.naglowek) !== '' && (
                    <h2 className="mb-8 text-center font-serif text-2xl font-bold text-stone-800">
                      {String(p.naglowek)}
                    </h2>
                  )}
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    {((p.items as TestimonialItem[]) ?? []).map((it, i) => (
                      <blockquote key={i} className="rounded-xl bg-white p-5 shadow-sm">
                        <p className="text-sm italic leading-relaxed text-stone-600">„{it.tresc}"</p>
                        <footer className="mt-3 text-xs font-semibold" style={{ color: accent }}>
                          — {it.autor}
                        </footer>
                      </blockquote>
                    ))}
                  </div>
                </div>
              </section>
            );
          case 'form': {
            const form = p.form_id ? forms.get(String(p.form_id)) : undefined;
            return (
              <section key={block.id} id="formularz" className="mx-auto max-w-md px-6 py-14">
                {p.naglowek != null && String(p.naglowek) !== '' && (
                  <h2 className="mb-6 text-center font-serif text-2xl font-bold text-stone-800">
                    {String(p.naglowek)}
                  </h2>
                )}
                {form ? (
                  <FormBlock form={form} accent={accent} />
                ) : (
                  <p className="text-center text-sm text-stone-400">
                    (formularz w przygotowaniu)
                  </p>
                )}
              </section>
            );
          }
          case 'cta':
            return (
              <section key={block.id} className="px-6 py-14 text-center">
                <h2 className="font-serif text-2xl font-bold text-stone-800">{String(p.naglowek ?? '')}</h2>
                {p.tresc != null && String(p.tresc) !== '' && (
                  <p className="mx-auto mt-2 max-w-lg text-sm text-stone-500">{String(p.tresc)}</p>
                )}
                {p.cta_label != null && String(p.cta_label) !== '' && (
                  <a
                    href={String(p.cta_url ?? '#')}
                    className="mt-6 inline-block rounded-lg px-7 py-3 text-sm font-bold text-white transition hover:opacity-90"
                    style={{ backgroundColor: accent }}
                  >
                    {String(p.cta_label)}
                  </a>
                )}
              </section>
            );
          case 'text':
            return (
              <section key={block.id} className="mx-auto max-w-2xl px-6 py-10">
                {p.naglowek != null && String(p.naglowek) !== '' && (
                  <h2 className="mb-3 font-serif text-2xl font-bold text-stone-800">{String(p.naglowek)}</h2>
                )}
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-600">
                  {String(p.tresc ?? '')}
                </p>
              </section>
            );
          case 'image':
            return p.url ? (
              <section key={block.id} className="mx-auto max-w-3xl px-6 py-8 text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={String(p.url)}
                  alt={String(p.podpis ?? '')}
                  className="mx-auto max-w-full rounded-xl shadow-sm"
                />
                {p.podpis != null && String(p.podpis) !== '' && (
                  <p className="mt-2 text-xs text-stone-400">{String(p.podpis)}</p>
                )}
              </section>
            ) : null;
          case 'pricing':
            return (
              <section key={block.id} className="mx-auto max-w-3xl px-6 py-14">
                {p.naglowek != null && String(p.naglowek) !== '' && (
                  <h2 className="mb-8 text-center font-serif text-2xl font-bold text-stone-800">
                    {String(p.naglowek)}
                  </h2>
                )}
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  {((p.items as PricingItem[]) ?? []).map((it, i) => (
                    <div key={i} className="rounded-xl border border-stone-200 bg-white p-5 text-center shadow-sm">
                      <p className="font-semibold text-stone-800">{it.nazwa}</p>
                      <p className="mt-1 font-serif text-2xl font-bold" style={{ color: accent }}>
                        {it.cena}
                      </p>
                      <p className="mt-1.5 text-xs text-stone-500">{it.opis}</p>
                    </div>
                  ))}
                </div>
              </section>
            );
          default:
            return null;
        }
      })}
    </>
  );
}
