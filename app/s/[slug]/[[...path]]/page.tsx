import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import BlockRenderer from '@/components/marketing/BlockRenderer';
import { getPublicPage } from '@/lib/marketing-public';

// Publiczna strona klienta z buildera: /s/[slug] i /s/[slug]/[podstrona].
// Jasny, neutralny motyw (to strona FIRMY KLIENTA, nie panel) + SEO z
// site_pages.seo. Renderują się tylko strony w statusie „opublikowana".
export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string; path?: string[] }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, path } = await params;
  const data = await getPublicPage(slug, (path ?? []).join('/'));
  if (!data) return { title: 'Strona nie istnieje' };
  return {
    title: data.page.seo.title ?? data.site.nazwa,
    description: data.page.seo.description,
  };
}

export default async function PublicSitePage({ params }: { params: Params }) {
  const { slug, path } = await params;
  const data = await getPublicPage(slug, (path ?? []).join('/'));
  if (!data) notFound();

  const accent = data.site.theme?.accent ?? '#9b2242';

  return (
    <div className="min-h-screen bg-stone-50 font-sans">
      <BlockRenderer blocks={data.blocks} forms={data.forms} accent={accent} />
      <footer className="border-t border-stone-200 bg-white px-6 py-6 text-center">
        <p className="text-xs text-stone-400">
          {data.site.nazwa} · strona: <span style={{ color: accent }}>STRONEVO</span>
        </p>
      </footer>
    </div>
  );
}
