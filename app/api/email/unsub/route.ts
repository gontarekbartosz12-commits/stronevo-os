import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/demo-store';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';

// GET /api/email/unsub?c=<email_contact id> — RODO: 1-klik wypis (Faza 3).
// Bez logowania, bez potwierdzeń — kliknięcie w stopce maila = opt_out=true.

function page(tytul: string, tresc: string): NextResponse {
  return new NextResponse(
    `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="robots" content="noindex">
     <title>${tytul}</title></head>
     <body style="margin:0;background:#f5f5f4;font-family:Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;">
       <div style="background:#fff;border-radius:12px;padding:40px 32px;max-width:420px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.08);">
         <h1 style="font-size:20px;color:#1c1917;margin:0 0 10px;">${tytul}</h1>
         <p style="font-size:14px;color:#57534e;line-height:1.6;margin:0;">${tresc}</p>
       </div>
     </body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('c');
  if (!id) return page('Błędny link', 'Link wypisu jest niekompletny.');

  try {
    if (!isSupabaseConfigured()) {
      const contact = demoStore.getEmailContact(id);
      if (!contact) return page('Błędny link', 'Nie znaleziono subskrypcji.');
      if (contact.opt_out) {
        return page('Już wypisano', `Adres ${contact.email} jest już wypisany z tej listy.`);
      }
      demoStore.updateEmailContact(id, { opt_out: true });
      return page('Wypisano ✓', `Adres ${contact.email} nie będzie już otrzymywać wiadomości marketingowych z tej listy.`);
    }

    if (!isAdminConfigured()) return page('Błąd', 'Spróbuj ponownie później.');
    const supabase = createAdminClient();
    const { data: contact } = await supabase
      .from('email_contacts')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (!contact) return page('Błędny link', 'Nie znaleziono subskrypcji.');
    if (contact.opt_out) {
      return page('Już wypisano', `Adres ${contact.email} jest już wypisany z tej listy.`);
    }
    await supabase.from('email_contacts').update({ opt_out: true }).eq('id', id);
    return page('Wypisano ✓', `Adres ${contact.email} nie będzie już otrzymywać wiadomości marketingowych z tej listy.`);
  } catch {
    return page('Błąd', 'Spróbuj ponownie później.');
  }
}
