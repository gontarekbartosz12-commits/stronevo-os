import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/demo-store';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';

// GET /api/email/track/open?send=<token> — pixel otwarcia kampanii (Faza 3).
// Zwraca 1×1 GIF zawsze (nawet przy złym tokenie — bez wycieku informacji).

const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('send');
  if (token) {
    try {
      if (!isSupabaseConfigured()) {
        const send = demoStore.getEmailSendByToken(token);
        if (send && !send.opened_at) {
          demoStore.updateEmailSend(send.id, { opened_at: new Date().toISOString() });
        }
      } else if (isAdminConfigured()) {
        await createAdminClient()
          .from('email_sends')
          .update({ opened_at: new Date().toISOString() })
          .eq('token', token)
          .is('opened_at', null);
      }
    } catch {
      // tracking nigdy nie może zwrócić błędu do klienta poczty
    }
  }
  return new NextResponse(GIF, {
    headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' },
  });
}
