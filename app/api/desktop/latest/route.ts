import { NextResponse } from 'next/server';

// GET /api/desktop/latest — manifest auto-update dla wrappera Tauri
// (tauri-plugin-updater odpytuje ten endpoint przy każdym starcie apki).
//
// Publikacja nowej wersji (robi Claude przy deployu / release):
//   1. desktop/: npm run build (patrz desktop/BUILD.md) → instalator NSIS
//      + plik .sig (createUpdaterArtifacts)
//   2. wgraj instalator na serwer (np. public/download/StronevoOS-setup.exe)
//   3. ustaw ENV: DESKTOP_VERSION, DESKTOP_UPDATE_URL (URL instalatora),
//      DESKTOP_SIGNATURE (zawartość pliku .sig), opcjonalnie DESKTOP_NOTES
//
// Bez ENV zwraca 204 No Content = "brak aktualizacji" (updater to honoruje),
// więc apka działa zanim opublikujesz pierwszy release.
export async function GET() {
  const version = process.env.DESKTOP_VERSION;
  const url = process.env.DESKTOP_UPDATE_URL;
  const signature = process.env.DESKTOP_SIGNATURE;

  if (!version || !url || !signature) {
    return new NextResponse(null, { status: 204 });
  }

  return NextResponse.json({
    version,
    notes: process.env.DESKTOP_NOTES ?? 'Aktualizacja STRONEVO OS',
    pub_date: process.env.DESKTOP_PUB_DATE ?? new Date().toISOString(),
    platforms: {
      'windows-x86_64': { signature, url },
    },
  });
}
