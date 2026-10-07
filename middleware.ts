import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieToSet = { name: string; value: string; options?: CookieOptions };

// Ochrona tras wg ról:
//   ceo        → pełny panel
//   pracownik  → tylko /zadania (kolejka pracy)
//   klient     → /klient + własne faktury/umowy; najpierw wymuszona
//                zmiana hasła (konto powstaje automatem "dostęp po opłacie")
// Bez skonfigurowanego Supabase panel działa w trybie demo (bez logowania).
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const path = request.nextUrl.pathname;

  // API ma własną autoryzację (Bearer NOTIFY_API_TOKEN)
  if (path.startsWith('/api/')) {
    return NextResponse.next();
  }

  if (!url || !anonKey) {
    // Tryb demo — /login dostępny (przycisk wejścia demo + link pobierania .exe)
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const role = (user?.user_metadata?.role as string | undefined) ?? null;

  if (!user) {
    // Umowa dostępna PUBLICZNIE (link z maila = nieodgadywalny UUID pełni rolę
    // tokenu) — prospekt czyta i akceptuje bez zakładania konta (standard e-podpisu).
    // Twarde zabezpieczenia: brak indeksowania w wyszukiwarkach + brak wycieku referera.
    if (path.startsWith('/umowa/')) {
      response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
      response.headers.set('Referrer-Policy', 'no-referrer');
      return response;
    }
    if (path === '/login') {
      return response;
    }
    // Reset hasła z linku mailowego: sesja recovery przychodzi w URL (nie w cookie),
    // więc strona MUSI być dostępna bez zalogowania — inaczej odbilibyśmy token.
    if (path.startsWith('/reset-haslo')) {
      return response;
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (role === 'ceo') {
    if (path === '/login') return NextResponse.redirect(new URL('/', request.url));
    return response;
  }

  if (role === 'pracownik') {
    if (path.startsWith('/zadania')) return response;
    return NextResponse.redirect(new URL('/zadania', request.url));
  }

  if (role === 'klient') {
    // BRAMKA OPŁAT (Faza 2/5): konto klienta powstaje po opłaconej fakturze,
    // a "Wyłącz dostęp" ustawia active=false — tu odcinamy sesję także wtedy,
    // gdy ban w auth nie został nałożony (np. brak service role przy deaktywacji).
    const contactId = user.user_metadata?.contact_id as string | undefined;
    if (contactId) {
      const { data: account } = await supabase
        .from('client_accounts')
        .select('active')
        .eq('contact_id', contactId)
        .maybeSingle();
      if (account && account.active === false) {
        await supabase.auth.signOut();
        return NextResponse.redirect(new URL('/login?blocked=1', request.url));
      }
    }

    // Wymuszona zmiana hasła tymczasowego przed wejściem do panelu
    if (user.user_metadata?.must_change_password === true) {
      if (path.startsWith('/zmiana-hasla')) return response;
      return NextResponse.redirect(new URL('/zmiana-hasla', request.url));
    }
    // Panel klienta + własne faktury/umowy (RLS pilnuje zakresu danych)
    if (
      path.startsWith('/klient') ||
      path.startsWith('/faktura') ||
      path.startsWith('/umowa') ||
      path.startsWith('/zmiana-hasla')
    ) {
      return response;
    }
    return NextResponse.redirect(new URL('/klient', request.url));
  }

  // Zalogowany bez znanej roli — brak dostępu
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|ico|webp)).*)'],
};
