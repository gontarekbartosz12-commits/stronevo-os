import { NextResponse } from 'next/server';

// GET /api/desktop/download — pobranie instalatora .exe (link ze strony
// logowania). Przekierowuje na DESKTOP_DOWNLOAD_URL (instalator NSIS na
// serwerze/CDN). Bez ENV — czytelny komunikat zamiast martwego linku.
export async function GET() {
  const url = process.env.DESKTOP_DOWNLOAD_URL;

  if (!url) {
    return NextResponse.json(
      {
        error: 'Instalator nie został jeszcze opublikowany.',
        info: 'Build: desktop/BUILD.md → wgraj .exe → ustaw DESKTOP_DOWNLOAD_URL w ENV.',
      },
      { status: 404 }
    );
  }

  return NextResponse.redirect(url, 302);
}
