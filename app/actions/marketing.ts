'use server';

import { revalidatePath } from 'next/cache';
import { demoStore } from '@/lib/demo-store';
import { sendOpsAlert } from '@/lib/alerts';
import { callLLM, isLlmConfigured } from '@/lib/llm/provider';
import { CampaignSendResult, sendCampaignNow } from '@/lib/email-campaign-send';
import { sendEmail } from '@/lib/integrations/email';
import { sendSms } from '@/lib/integrations/sms';
import { SITE_TEMPLATES, defaultBlockProps, reorder } from '@/lib/marketing';
import { PublishResult, publishDuePosts } from '@/lib/social-publish';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';
import {
  BlockType,
  EmailCampaign,
  EmailList,
  EmailSend,
  FormDef,
  FormSubmission,
  PageBlock,
  Review,
  ReviewRequest,
  Site,
  SitePage,
  SocialChannel,
  SocialPost,
} from '@/lib/types';

// MARKETING (Faza 3 zaufania) — akcje panelu.
// OPERATOR-FIRST: struktury/publikacja/wysyłki/AI-szkice = operator (CEO);
// klient (hybryda) edytuje treść, planuje posty i odpowiada na opinie —
// w trybie live pilnuje tego RLS (0018/0019).

async function sessionRole(): Promise<'ceo' | 'pracownik' | 'klient'> {
  if (!isSupabaseConfigured()) return 'ceo';
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const role = user?.user_metadata?.role;
  return role === 'klient' ? 'klient' : role === 'pracownik' ? 'pracownik' : 'ceo';
}

async function requireOperator(co: string): Promise<void> {
  if ((await sessionRole()) === 'klient') {
    throw new Error(`${co} konfiguruje opiekun STRONEVO — napisz, a zajmiemy się tym od ręki.`);
  }
}

// ===== A. Strony (builder) =====

export interface SiteWithMeta extends Site {
  ownerName: string;
  pages: SitePage[];
}

export async function listSitesWithMeta(): Promise<SiteWithMeta[]> {
  if (!isSupabaseConfigured()) {
    const contacts = demoStore.listContacts();
    return demoStore.listSites().map((s) => ({
      ...s,
      ownerName: s.contact_id
        ? contacts.find((c) => c.id === s.contact_id)?.firma ?? 'klient'
        : 'STRONEVO',
      pages: demoStore.listSitePages(s.id),
    }));
  }
  const supabase = await createClient();
  const [{ data: sites }, { data: pages }, { data: contacts }] = await Promise.all([
    supabase.from('sites').select('*').order('created_at', { ascending: false }),
    supabase.from('site_pages').select('*'),
    supabase.from('contacts').select('id, firma, imie'),
  ]);
  return ((sites ?? []) as Site[]).map((s) => ({
    ...s,
    ownerName: s.contact_id
      ? (contacts ?? []).find((c) => c.id === s.contact_id)?.firma ?? 'klient'
      : 'STRONEVO',
    pages: ((pages ?? []) as SitePage[]).filter((p) => p.site_id === s.id),
  }));
}

export async function getPageBlocks(pageId: string): Promise<PageBlock[]> {
  if (!isSupabaseConfigured()) return demoStore.listPageBlocks(pageId);
  const supabase = await createClient();
  const { data } = await supabase
    .from('page_blocks')
    .select('*')
    .eq('page_id', pageId)
    .order('kolejnosc');
  return (data ?? []) as PageBlock[];
}

export async function createSiteFromTemplate(input: {
  contactId: string | null;
  nazwa: string;
  slug: string;
  templateKey: string;
}): Promise<Site> {
  await requireOperator('Nowe strony');
  const template = SITE_TEMPLATES.find((t) => t.key === input.templateKey) ?? SITE_TEMPLATES[0];
  const slug = input.slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!slug) throw new Error('Podaj poprawny slug (adres strony).');

  if (!isSupabaseConfigured()) {
    if (demoStore.getSiteBySlug(slug)) throw new Error(`Slug "${slug}" jest zajęty.`);
    const site = demoStore.createSite({
      contact_id: input.contactId,
      nazwa: input.nazwa,
      slug,
      domena: null,
      status: 'szkic',
      theme: { accent: '#9b2242' },
    });
    const page = demoStore.createSitePage({
      site_id: site.id,
      contact_id: input.contactId,
      sciezka: '',
      seo: { title: input.nazwa },
    });
    template.bloki.forEach((b, i) =>
      demoStore.createPageBlock({
        page_id: page.id,
        contact_id: input.contactId,
        typ: b.typ,
        props: { ...b.props },
        kolejnosc: i,
      })
    );
    revalidatePath('/marketing');
    return site;
  }

  const supabase = await createClient();
  const { data: site, error } = await supabase
    .from('sites')
    .insert({ contact_id: input.contactId, nazwa: input.nazwa, slug, status: 'szkic' })
    .select('*')
    .single();
  if (error) throw new Error(`Nie udało się utworzyć strony: ${error.message}`);
  const { data: page } = await supabase
    .from('site_pages')
    .insert({ site_id: site.id, contact_id: input.contactId, sciezka: '', seo: { title: input.nazwa } })
    .select('*')
    .single();
  if (page) {
    await supabase.from('page_blocks').insert(
      template.bloki.map((b, i) => ({
        page_id: page.id,
        contact_id: input.contactId,
        typ: b.typ,
        props: b.props,
        kolejnosc: i,
      }))
    );
  }
  revalidatePath('/marketing');
  return site as Site;
}

export async function setSiteStatus(siteId: string, status: Site['status']): Promise<string> {
  await requireOperator('Publikację stron');
  if (!isSupabaseConfigured()) {
    demoStore.updateSite(siteId, { status });
  } else {
    const supabase = await createClient();
    const { error } = await supabase.from('sites').update({ status }).eq('id', siteId);
    if (error) throw new Error(error.message);
  }
  revalidatePath('/marketing');
  return status === 'opublikowana'
    ? 'Strona opublikowana — działa pod /s/[slug].'
    : `Status strony: ${status}.`;
}

export async function addBlock(pageId: string, typ: BlockType): Promise<PageBlock> {
  await requireOperator('Strukturę strony');
  const existing = await getPageBlocks(pageId);
  const kolejnosc = existing.length > 0 ? Math.max(...existing.map((b) => b.kolejnosc)) + 1 : 0;
  const props = defaultBlockProps(typ);
  const contactId = existing[0]?.contact_id ?? null;

  let block: PageBlock;
  if (!isSupabaseConfigured()) {
    block = demoStore.createPageBlock({ page_id: pageId, contact_id: contactId, typ, props, kolejnosc });
  } else {
    const supabase = await createClient();
    const { data: page } = await supabase
      .from('site_pages')
      .select('contact_id')
      .eq('id', pageId)
      .maybeSingle();
    const { data, error } = await supabase
      .from('page_blocks')
      .insert({ page_id: pageId, contact_id: page?.contact_id ?? contactId, typ, props, kolejnosc })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    block = data as PageBlock;
  }
  revalidatePath('/marketing');
  return block;
}

// Edycja TREŚCI bloku — dostępna też dla klienta (hybryda; RLS pilnuje own)
export async function updateBlockProps(
  blockId: string,
  props: Record<string, unknown>
): Promise<void> {
  if (!isSupabaseConfigured()) {
    demoStore.updatePageBlock(blockId, { props });
  } else {
    const supabase = await createClient();
    const { error } = await supabase.from('page_blocks').update({ props }).eq('id', blockId);
    if (error) throw new Error(error.message);
  }
  revalidatePath('/marketing');
}

export async function moveBlock(pageId: string, blockId: string, dir: -1 | 1): Promise<void> {
  await requireOperator('Strukturę strony');
  const blocks = await getPageBlocks(pageId);
  const updates = reorder(blocks, blockId, dir);
  for (const u of updates) {
    if (!isSupabaseConfigured()) {
      demoStore.updatePageBlock(u.id, { kolejnosc: u.kolejnosc });
    } else {
      const supabase = await createClient();
      await supabase.from('page_blocks').update({ kolejnosc: u.kolejnosc }).eq('id', u.id);
    }
  }
  revalidatePath('/marketing');
}

export async function removeBlock(blockId: string): Promise<void> {
  await requireOperator('Strukturę strony');
  if (!isSupabaseConfigured()) {
    demoStore.deletePageBlock(blockId);
  } else {
    const supabase = await createClient();
    await supabase.from('page_blocks').delete().eq('id', blockId);
  }
  revalidatePath('/marketing');
}

// ===== B. Formularze =====

export interface FormWithMeta extends FormDef {
  ownerName: string;
  zgloszenia: number;
  ostatnie: FormSubmission[];
}

export async function listFormsWithMeta(): Promise<FormWithMeta[]> {
  if (!isSupabaseConfigured()) {
    const contacts = demoStore.listContacts();
    return demoStore.listForms().map((f) => {
      const subs = demoStore.listFormSubmissions(f.id);
      return {
        ...f,
        ownerName: f.contact_id
          ? contacts.find((c) => c.id === f.contact_id)?.firma ?? 'klient'
          : 'STRONEVO',
        zgloszenia: subs.length,
        ostatnie: subs.slice(0, 5),
      };
    });
  }
  const supabase = await createClient();
  const [{ data: forms }, { data: subs }, { data: contacts }] = await Promise.all([
    supabase.from('forms').select('*'),
    supabase.from('form_submissions').select('*').order('created_at', { ascending: false }).limit(200),
    supabase.from('contacts').select('id, firma, imie'),
  ]);
  return ((forms ?? []) as FormDef[]).map((f) => {
    const own = ((subs ?? []) as FormSubmission[]).filter((s) => s.form_id === f.id);
    return {
      ...f,
      ownerName: f.contact_id
        ? (contacts ?? []).find((c) => c.id === f.contact_id)?.firma ?? 'klient'
        : 'STRONEVO',
      zgloszenia: own.length,
      ostatnie: own.slice(0, 5),
    };
  });
}

// ===== C. E-mail marketing =====

export interface CampaignWithStats extends EmailCampaign {
  ownerName: string;
  wyslane: number;
  otwarcia: number;
  klikniecia: number;
}

export async function listCampaignsWithStats(): Promise<CampaignWithStats[]> {
  let campaigns: EmailCampaign[];
  let sends: EmailSend[];
  let ownerName: (id: string | null) => string;

  if (!isSupabaseConfigured()) {
    campaigns = demoStore.listEmailCampaigns();
    sends = demoStore.listEmailSends();
    const contacts = demoStore.listContacts();
    ownerName = (id) =>
      id ? contacts.find((c) => c.id === id)?.firma ?? 'klient' : 'STRONEVO';
  } else {
    const supabase = await createClient();
    const [{ data: cps }, { data: sds }, { data: contacts }] = await Promise.all([
      supabase.from('email_campaigns').select('*').order('created_at', { ascending: false }),
      supabase.from('email_sends').select('*'),
      supabase.from('contacts').select('id, firma, imie'),
    ]);
    campaigns = (cps ?? []) as EmailCampaign[];
    sends = (sds ?? []) as EmailSend[];
    ownerName = (id) =>
      id ? (contacts ?? []).find((c) => c.id === id)?.firma ?? 'klient' : 'STRONEVO';
  }

  return campaigns.map((c) => {
    const own = sends.filter((s) => s.campaign_id === c.id);
    return {
      ...c,
      ownerName: ownerName(c.contact_id),
      wyslane: own.length,
      otwarcia: own.filter((s) => s.opened_at).length,
      klikniecia: own.filter((s) => s.clicked_at).length,
    };
  });
}

export async function listEmailListsAction(): Promise<EmailList[]> {
  if (!isSupabaseConfigured()) return demoStore.listEmailLists();
  const supabase = await createClient();
  const { data } = await supabase.from('email_lists').select('*');
  return (data ?? []) as EmailList[];
}

// Treść kampanii (temat + bloki) — edytuje też klient (hybryda; RLS own)
export async function saveCampaign(input: {
  id?: string;
  contact_id: string | null;
  list_id: string | null;
  temat: string;
  bloki: { typ: BlockType; props: Record<string, unknown> }[];
}): Promise<EmailCampaign> {
  if (!input.temat.trim()) throw new Error('Podaj temat kampanii.');

  if (!isSupabaseConfigured()) {
    const saved = input.id
      ? demoStore.updateEmailCampaign(input.id, {
          temat: input.temat,
          bloki: input.bloki,
          list_id: input.list_id,
        })
      : demoStore.createEmailCampaign({
          contact_id: input.contact_id,
          list_id: input.list_id,
          temat: input.temat,
          bloki: input.bloki,
          status: 'szkic',
          zaplanowano: null,
          wyslano_at: null,
        });
    if (!saved) throw new Error('Kampania nie istnieje.');
    revalidatePath('/marketing');
    return saved;
  }

  const supabase = await createClient();
  if (input.id) {
    const { data, error } = await supabase
      .from('email_campaigns')
      .update({ temat: input.temat, bloki: input.bloki, list_id: input.list_id })
      .eq('id', input.id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    revalidatePath('/marketing');
    return data as EmailCampaign;
  }
  const { data, error } = await supabase
    .from('email_campaigns')
    .insert({
      contact_id: input.contact_id,
      list_id: input.list_id,
      temat: input.temat,
      bloki: input.bloki,
      status: 'szkic',
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  revalidatePath('/marketing');
  return data as EmailCampaign;
}

// Wysyłka = OPERATOR (klient edytuje treść; „wyślij" u klienta → prośba do opiekuna)
export async function sendCampaignAction(campaignId: string): Promise<CampaignSendResult> {
  await requireOperator('Wysyłkę kampanii');
  const result = await sendCampaignNow(campaignId);
  if (!result.ok) throw new Error(result.error ?? 'Błąd wysyłki');
  revalidatePath('/marketing');
  return result;
}

// ===== D. Social planner =====

export async function listSocialPostsAction(contactId?: string): Promise<SocialPost[]> {
  if (!isSupabaseConfigured()) {
    return demoStore.listSocialPosts(contactId === undefined ? undefined : contactId);
  }
  const supabase = await createClient(); // RLS: klient tylko własne
  let q = supabase.from('social_posts').select('*').order('zaplanowano', { ascending: false });
  if (contactId !== undefined) q = q.eq('contact_id', contactId);
  const { data } = await q;
  return (data ?? []) as SocialPost[];
}

// Planowanie posta = funkcja UŻYTKOWA (klient może; RLS insert own)
export async function saveSocialPost(input: {
  id?: string;
  contact_id: string | null;
  kanaly: SocialChannel[];
  tresc: string;
  zaplanowano: string | null; // ISO
}): Promise<SocialPost> {
  if (!input.tresc.trim()) throw new Error('Wpisz treść posta.');
  if (input.kanaly.length === 0) throw new Error('Wybierz co najmniej jeden kanał.');
  const status = input.zaplanowano ? ('zaplanowany' as const) : ('szkic' as const);

  if (!isSupabaseConfigured()) {
    const saved = input.id
      ? demoStore.updateSocialPost(input.id, {
          kanaly: input.kanaly,
          tresc: input.tresc,
          zaplanowano: input.zaplanowano,
          status,
        })
      : demoStore.createSocialPost({
          contact_id: input.contact_id,
          kanaly: input.kanaly,
          tresc: input.tresc,
          media: [],
          zaplanowano: input.zaplanowano,
          status,
          wynik: {},
        });
    if (!saved) throw new Error('Post nie istnieje.');
    revalidatePath('/marketing');
    return saved;
  }

  const supabase = await createClient();
  const row = {
    contact_id: input.contact_id,
    kanaly: input.kanaly,
    tresc: input.tresc,
    zaplanowano: input.zaplanowano,
    status,
  };
  const { data, error } = input.id
    ? await supabase.from('social_posts').update(row).eq('id', input.id).select('*').single()
    : await supabase.from('social_posts').insert(row).select('*').single();
  if (error) throw new Error(error.message);
  revalidatePath('/marketing');
  return data as SocialPost;
}

// „Opublikuj teraz" = operator (publikacja przez router n8n / cron)
export async function publishSocialNow(postId: string): Promise<PublishResult[]> {
  await requireOperator('Publikację postów');
  const nowIso = new Date().toISOString();
  if (!isSupabaseConfigured()) {
    demoStore.updateSocialPost(postId, { status: 'zaplanowany', zaplanowano: nowIso });
  } else {
    const supabase = await createClient();
    await supabase
      .from('social_posts')
      .update({ status: 'zaplanowany', zaplanowano: nowIso })
      .eq('id', postId);
  }
  const results = await publishDuePosts();
  revalidatePath('/marketing');
  return results.filter((r) => r.post_id === postId);
}

// ===== E. Reputacja =====

export async function listReviewsAction(contactId?: string): Promise<Review[]> {
  if (!isSupabaseConfigured()) {
    return demoStore.listReviews(contactId === undefined ? undefined : contactId);
  }
  const supabase = await createClient();
  let q = supabase.from('reviews').select('*').order('created_at', { ascending: false });
  if (contactId !== undefined) q = q.eq('contact_id', contactId);
  const { data } = await q;
  return (data ?? []) as Review[];
}

export async function listReviewRequestsAction(contactId?: string): Promise<ReviewRequest[]> {
  if (!isSupabaseConfigured()) {
    return demoStore.listReviewRequests(contactId === undefined ? undefined : contactId);
  }
  const supabase = await createClient();
  let q = supabase.from('review_requests').select('*').order('created_at', { ascending: false });
  if (contactId !== undefined) q = q.eq('contact_id', contactId);
  const { data } = await q;
  return (data ?? []) as ReviewRequest[];
}

// Prośba o opinię po usłudze = funkcja UŻYTKOWA (klient może; RLS insert own)
export async function sendReviewRequest(input: {
  contact_id: string | null;
  imie: string;
  telefon?: string;
  email?: string;
  kanal: 'sms' | 'email';
  review_link: string;
}): Promise<string> {
  if (!input.review_link.trim()) throw new Error('Podaj link do wystawienia opinii.');
  const cel = input.kanal === 'sms' ? input.telefon : input.email;
  if (!cel) throw new Error(input.kanal === 'sms' ? 'Podaj telefon.' : 'Podaj e-mail.');

  const tresc = `Dziękujemy za skorzystanie z naszych usług! Będzie nam bardzo miło, jeśli zostawisz opinię (to 30 sekund): ${input.review_link}`;
  let ok = false;
  if (input.kanal === 'sms') {
    const r = await sendSms(cel, tresc);
    ok = r.source === 'live' && r.data.sent;
  } else {
    const r = await sendEmail({
      to: cel,
      subject: 'Podzielisz się opinią? To 30 sekund',
      html: `<p>Dzień dobry ${input.imie},</p><p>${tresc.replace(input.review_link, `<a href="${input.review_link}">${input.review_link}</a>`)}</p>`,
    });
    ok = r.source === 'live' && r.data.sent;
  }

  const row = {
    contact_id: input.contact_id,
    external: { imie: input.imie, telefon: input.telefon ?? null, email: input.email ?? null },
    kanal: input.kanal,
    review_link: input.review_link,
    status: 'wyslana' as const,
  };
  if (!isSupabaseConfigured()) {
    demoStore.createReviewRequest(row);
  } else {
    const supabase = await createClient();
    const { error } = await supabase.from('review_requests').insert(row);
    if (error) throw new Error(error.message);
  }
  revalidatePath('/marketing');
  return ok
    ? `Prośba o opinię wysłana (${input.kanal}) do: ${input.imie}.`
    : `Prośba zapisana — wysyłka w trybie mock (brak kluczy ${input.kanal === 'sms' ? 'bramy SMS' : 'e-mail'}).`;
}

// AI-szkic odpowiedzi na opinię = narzędzie OPERATORA (Claude / fallback szablon)
export async function aiReviewDraft(reviewId: string): Promise<string> {
  await requireOperator('Szkice AI');
  let review: Review | null;
  let firma = 'firma';
  if (!isSupabaseConfigured()) {
    review = demoStore.getReview(reviewId);
    const c = review?.contact_id ? demoStore.getContact(review.contact_id) : null;
    firma = c?.firma ?? firma;
  } else {
    const supabase = await createClient();
    const { data } = await supabase.from('reviews').select('*').eq('id', reviewId).maybeSingle();
    review = data as Review | null;
    if (review?.contact_id) {
      const { data: c } = await supabase
        .from('contacts')
        .select('firma, imie')
        .eq('id', review.contact_id)
        .maybeSingle();
      firma = c?.firma ?? firma;
    }
  }
  if (!review) throw new Error('Opinia nie istnieje.');

  let draft: string;
  if (isLlmConfigured()) {
    const res = await callLLM({
      system: `Piszesz krótkie (2-3 zdania), profesjonalne odpowiedzi firmy "${firma}" na opinie Google/Facebook po polsku. Zasady: podziękuj, odnieś się konkretnie do treści, przy krytyce — przeproś bez wymówek i zaproś do kontaktu; zero szablonowej sztampy i emotek.`,
      prompt: `Opinia (${review.ocena ?? '?'}★) od ${review.autor ?? 'klienta'}: "${review.tresc ?? ''}"\nOdpowiedź:`,
      maxTokens: 250,
    });
    draft =
      res.provider !== 'mock' && res.text.trim()
        ? res.text.trim()
        : fallbackReviewReply(review, firma);
  } else {
    draft = fallbackReviewReply(review, firma);
  }

  if (!isSupabaseConfigured()) {
    demoStore.updateReview(reviewId, { odpowiedz: draft, status: 'szkic' });
  } else {
    const supabase = await createClient();
    await supabase.from('reviews').update({ odpowiedz: draft, status: 'szkic' }).eq('id', reviewId);
  }
  revalidatePath('/marketing');
  return draft;
}

function fallbackReviewReply(review: Review, firma: string): string {
  if ((review.ocena ?? 5) <= 3) {
    return `Dziękujemy za szczerą opinię — przepraszamy za niedogodność, o której Pan/Pani pisze. Traktujemy to jako konkretną wskazówkę do poprawy. Prosimy o kontakt z ${firma}, chcemy to naprawić.`;
  }
  return `Dziękujemy za miłe słowa i zaufanie! Cieszymy się, że współpraca z ${firma} spełniła oczekiwania — do zobaczenia następnym razem.`;
}

// Zapis/publikacja odpowiedzi — klient też może (codzienny ruch; RLS update own)
export async function saveReviewReply(reviewId: string, tresc: string): Promise<string> {
  const odpowiedz = tresc.trim();
  if (!odpowiedz) throw new Error('Wpisz treść odpowiedzi.');

  if (!isSupabaseConfigured()) {
    demoStore.updateReview(reviewId, { odpowiedz, status: 'odpowiedziano' });
  } else {
    const supabase = await createClient();
    const { error } = await supabase
      .from('reviews')
      .update({ odpowiedz, status: 'odpowiedziano' })
      .eq('id', reviewId);
    if (error) throw new Error(error.message);
  }

  // Publikacja odpowiedzi w GBP przez n8n (kredencjały operatora); mock = zapis lokalny
  const webhook = process.env.REVIEWS_REPLY_WEBHOOK_URL;
  if (webhook) {
    try {
      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_id: reviewId, odpowiedz }),
      });
    } catch {
      // publikacja przez n8n nie może blokować zapisu
    }
  }
  revalidatePath('/marketing');
  return webhook
    ? 'Odpowiedź zapisana i przekazana do publikacji (Google).'
    : 'Odpowiedź zapisana — publikacja w Google po wpięciu REVIEWS_REPLY_WEBHOOK_URL (n8n).';
}

// „Chcę więcej marketingu" (klient) → alert operatora (operator-first)
export async function requestMarketingHelp(contactId: string, temat: string): Promise<string> {
  let firma = 'klient';
  if (!isSupabaseConfigured()) {
    firma = demoStore.getContact(contactId)?.firma ?? firma;
  }
  await sendOpsAlert(`Marketing: ${firma} prosi o pomoc/rozbudowę — "${temat.slice(0, 120)}"`);
  const notif = {
    typ: 'biznes' as const,
    severity: 'info' as const,
    tytul: `Marketing: ${firma} prosi o kontakt`,
    opis: temat.slice(0, 300),
    related_typ: 'contact',
    related_id: contactId,
    status: 'nowe' as const,
    akcje: [],
  };
  if (!isSupabaseConfigured()) {
    demoStore.createNotification(notif);
  } else if (isAdminConfigured()) {
    await createAdminClient().from('notifications').insert(notif);
  }
  return 'Przekazane! Opiekun STRONEVO odezwie się, żeby to ustawić.';
}
