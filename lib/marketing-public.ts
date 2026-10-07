import { demoStore } from './demo-store';
import { isSupabaseConfigured } from './supabase/config';
import { createClient } from './supabase/server';
import { createAdminClient, isAdminConfigured } from './supabase/admin';
import { FormDef, PageBlock, Site, SitePage } from './types';

// Publiczny odczyt stron marketingowych /s/[slug] (Faza 3 zaufania).
// Bez sesji (goście z reklam) → service role, jak /umowa; fallback sesyjny.

async function db() {
  return isAdminConfigured() ? createAdminClient() : await createClient();
}

export interface PublicPageData {
  site: Site;
  page: SitePage;
  blocks: PageBlock[];
  forms: Map<string, FormDef>;
}

export async function getPublicPage(
  slug: string,
  sciezka: string
): Promise<PublicPageData | null> {
  let site: Site | null;
  let page: SitePage | null;
  let blocks: PageBlock[];
  let formsList: FormDef[];

  if (!isSupabaseConfigured()) {
    site = demoStore.getSiteBySlug(slug);
    if (!site || site.status !== 'opublikowana') return null;
    page = demoStore.getSitePage(site.id, sciezka);
    if (!page) return null;
    blocks = demoStore.listPageBlocks(page.id);
    formsList = demoStore.listForms(site.contact_id);
  } else {
    const supabase = await db();
    const { data: s } = await supabase
      .from('sites')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'opublikowana')
      .maybeSingle();
    site = s as Site | null;
    if (!site) return null;
    const { data: pg } = await supabase
      .from('site_pages')
      .select('*')
      .eq('site_id', site.id)
      .eq('sciezka', sciezka)
      .maybeSingle();
    page = pg as SitePage | null;
    if (!page) return null;
    const [{ data: blks }, { data: fms }] = await Promise.all([
      supabase.from('page_blocks').select('*').eq('page_id', page.id).order('kolejnosc'),
      site.contact_id
        ? supabase.from('forms').select('*').eq('contact_id', site.contact_id)
        : supabase.from('forms').select('*').is('contact_id', null),
    ]);
    blocks = (blks ?? []) as PageBlock[];
    formsList = (fms ?? []) as FormDef[];
  }

  return {
    site,
    page,
    blocks,
    forms: new Map(formsList.map((f) => [f.id, f])),
  };
}
