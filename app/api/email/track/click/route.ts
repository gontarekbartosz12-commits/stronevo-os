import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/demo-store';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';

// GET /api/email/track/click?send=<token>&url=<cel> — tracking kliknięć (Faza 3).
// Oznacza klik (i otwarcie) i przekierowuje 302 na docelowy URL.

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('send');
  const url = request.nextUrl.searchParams.get('url') ?? '/';

  // tylko http(s) i kotwice względne — bez open-redirectów na dziwne schematy
  const safe = /^https?:\/\//i.test(url) || url.startsWith('/') ? url : '/';

  if (token) {
    try {
      const now = new Date().toISOString();
      if (!isSupabaseConfigured()) {
        const send = demoStore.getEmailSendByToken(token);
        if (send) {
          demoStore.updateEmailSend(send.id, {
            clicked_at: send.clicked_at ?? now,
            opened_at: send.opened_at ?? now,
          });
        }
      } else if (isAdminConfigured()) {
        const supabase = createAdminClient();
        await supabase
          .from('email_sends')
          .update({ clicked_at: now })
          .eq('token', token)
          .is('clicked_at', null);
        await supabase
          .from('email_sends')
          .update({ opened_at: now })
          .eq('token', token)
          .is('opened_at', null);
      }
    } catch {
      // redirect ma zadziałać zawsze
    }
  }
  return NextResponse.redirect(safe, 302);
}
