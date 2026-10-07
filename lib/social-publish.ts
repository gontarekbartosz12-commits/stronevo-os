import { demoStore } from './demo-store';
import { isSupabaseConfigured } from './supabase/config';
import { createAdminClient, isAdminConfigured } from './supabase/admin';
import { SocialPost } from './types';

// Publikacja postów social (Faza 3) — wspólna logika dla crona
// /api/social/publish-due i akcji „Opublikuj teraz". Kredencjały kanałów
// (FB/IG/GBP/LinkedIn) trzyma OPERATOR w n8n — tu tylko router.

export interface PublishResult {
  post_id: string;
  status: 'opublikowany' | 'blad';
  via: string;
  reason?: string; // dlaczego 'blad' (np. kanał niewpięty) — do pokazania w UI
}

// Czy kanały social są realnie podłączone (router n8n → FB/IG/GBP/LinkedIn).
// Bez tego publikacja NIE nastąpi — UI ma o tym mówić uczciwie, nie udawać sukcesu.
export function socialPublishWired(): boolean {
  return Boolean(process.env.SOCIAL_PUBLISH_WEBHOOK_URL);
}

export async function publishDuePosts(now = new Date()): Promise<PublishResult[]> {
  const demo = !isSupabaseConfigured();
  if (!demo && !isAdminConfigured()) {
    throw new Error('Brak SUPABASE_SERVICE_ROLE_KEY — publikacja wymaga service role.');
  }
  const nowIso = now.toISOString();

  let due: SocialPost[];
  if (demo) {
    due = demoStore
      .listSocialPosts()
      .filter((p) => p.status === 'zaplanowany' && p.zaplanowano && p.zaplanowano <= nowIso);
  } else {
    const { data } = await createAdminClient()
      .from('social_posts')
      .select('*')
      .eq('status', 'zaplanowany')
      .lte('zaplanowano', nowIso);
    due = (data ?? []) as SocialPost[];
  }

  const results: PublishResult[] = [];
  for (const post of due) {
    const publish = await publishPost(post);
    const patch = {
      status: publish.ok ? ('opublikowany' as const) : ('blad' as const),
      wynik: publish.wynik,
    };
    if (demo) {
      demoStore.updateSocialPost(post.id, patch);
    } else {
      await createAdminClient().from('social_posts').update(patch).eq('id', post.id);
    }
    results.push({ post_id: post.id, status: patch.status, via: publish.via, reason: publish.reason });
  }
  return results;
}

async function publishPost(
  post: SocialPost
): Promise<{ ok: boolean; wynik: Record<string, unknown>; via: string; reason?: string }> {
  const webhook = process.env.SOCIAL_PUBLISH_WEBHOOK_URL;
  if (!webhook) {
    // BRAK routera kanałów = NIC nie zostało opublikowane. Nie udajemy sukcesu:
    // post → status 'blad' z jawnym powodem (operator wie, że trzeba wpiąć kanał).
    const reason =
      'Kanały social (FB/IG/GBP/LinkedIn) nie są jeszcze podłączone — publikacja ruszy po wpięciu przez opiekuna STRONEVO.';
    return {
      ok: false,
      wynik: Object.fromEntries(post.kanaly.map((k) => [k, 'kanał niewpięty'])),
      via: 'niewpięty',
      reason,
    };
  }
  const key = process.env.SOCIAL_PUBLISH_WEBHOOK_KEY;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) {
    headers['Authorization'] = `Bearer ${key}`;
    headers['x-api-key'] = key;
  }
  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        post_id: post.id,
        contact_id: post.contact_id,
        kanaly: post.kanaly,
        tresc: post.tresc,
        media: post.media,
      }),
    });
    const json = await res.json().catch(() => ({}));
    return {
      ok: res.ok,
      wynik: json?.wynik ?? { http: res.status },
      via: 'n8n router',
      reason: res.ok ? undefined : `Router publikacji zwrócił błąd (HTTP ${res.status}).`,
    };
  } catch {
    return {
      ok: false,
      wynik: { error: 'router nieosiągalny' },
      via: 'n8n router',
      reason: 'Router publikacji (n8n) nieosiągalny — spróbuj ponownie za chwilę.',
    };
  }
}
