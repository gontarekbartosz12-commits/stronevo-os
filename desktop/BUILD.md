# STRONEVO OS — budowanie aplikacji desktop (.exe)

Wrapper Tauri v2 (thin shell): natywne okno Windows ładujące **https://crm.stronevo.pl** —
ten sam frontend co web, zero duplikacji kodu. Logowanie i bramka „tylko z opłaconą
fakturą" egzekwowane po stronie serwera (middleware), identycznie jak w przeglądarce.
Auto-update przez `tauri-plugin-updater` → `GET /api/desktop/latest`.

## Wymagania (jednorazowo, na maszynie budującej)

1. **Rust** — https://rustup.rs (`rustup default stable`)
2. **Microsoft Visual Studio Build Tools** z workloadem „Desktop development with C++"
   (linker MSVC) — https://visualstudio.microsoft.com/visual-cpp-build-tools/
3. **Node.js 18+** (jest, skoro działa web)
4. **WebView2 Runtime** — na Windows 10/11 zwykle już jest; instalator NSIS
   doinstaluje go użytkownikowi automatycznie, jeśli brakuje
5. NSIS pobiera się automatycznie przy pierwszym `tauri build` — nic nie instaluj

## Krok 1 — zależności i ikony

```powershell
cd C:\Users\gonta\stronevo-os\desktop
npm install
npm run icon    # generuje src-tauri/icons/* z app-icon.png (już w repo)
```

## Krok 2 — klucze auto-update (JEDNORAZOWO, klucz prywatny trzymać poza repo!)

```powershell
npx tauri signer generate -w $env:USERPROFILE\.tauri\stronevo-os.key
```

- Wypisany **klucz publiczny** wklej do `src-tauri/tauri.conf.json` →
  `plugins.updater.pubkey` (zastąp `WSTAW_PUBKEY_Z_tauri_signer_generate`).
- Klucz prywatny (`~/.tauri/stronevo-os.key`) + hasło zapisz w menedżerze haseł.
  Bez niego nie podpiszesz kolejnych wersji = auto-update przestanie działać.

## Krok 3 — build

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content $env:USERPROFILE\.tauri\stronevo-os.key -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "<haslo-klucza>"
npm run build
```

Artefakty w `src-tauri/target/release/bundle/nsis/`:

| Plik | Co to |
|---|---|
| `STRONEVO OS_1.0.0_x64-setup.exe` | instalator dla klientów (link na loginie) |
| `STRONEVO OS_1.0.0_x64-setup.exe.sig` | podpis dla auto-update (treść → ENV `DESKTOP_SIGNATURE`) |

Test lokalny bez builda: `npm run dev` (otwiera okno z crm.stronevo.pl;
do testów na localhost zmień tymczasowo `app.windows[0].url` w tauri.conf.json
na `http://localhost:3050`).

## Krok 4 — publikacja (pierwszy release)

1. Wgraj `...-setup.exe` na serwer, np. do `public/download/StronevoOS-setup.exe`
   w projekcie web (Coolify zbuduje go do obrazu) albo na dowolny CDN.
2. Ustaw ENV aplikacji web:
   - `DESKTOP_DOWNLOAD_URL=https://crm.stronevo.pl/download/StronevoOS-setup.exe`
     → ożywa przycisk „Pobierz aplikację na Windows (.exe)" na stronie logowania.

## Krok 5 — publikacja aktualizacji (każda kolejna wersja)

1. Podbij `version` w `src-tauri/tauri.conf.json` **i** `src-tauri/Cargo.toml`
   (np. 1.0.1) → `npm run build` (z kluczem jak w kroku 3).
2. Wgraj nowy `...-setup.exe` na serwer (nowa nazwa pliku lub nadpisz).
3. Ustaw ENV:
   - `DESKTOP_VERSION=1.0.1`
   - `DESKTOP_UPDATE_URL=<URL nowego setup.exe>`
   - `DESKTOP_SIGNATURE=<zawartość pliku .exe.sig>`
   - `DESKTOP_NOTES=co się zmieniło` (opcjonalnie)
4. Gotowe — każda uruchomiona apka przy starcie odpyta `/api/desktop/latest`,
   pobierze, zainstaluje i zrestartuje się sama. Bez ENV endpoint zwraca 204
   („brak aktualizacji"), więc nic nie wybucha przed pierwszym releasem.

## Jak to działa (architektura)

- `src-tauri/src/lib.rs` — cały „backend" wrappera: okno + cichy update-check
  przy starcie. Frontend NIE jest bundlowany — okno wskazuje na produkcyjny URL,
  więc deploy weba = natychmiastowa zmiana także w desktopie (wrapper aktualizuje
  się tylko, gdy zmieniasz sam wrapper: ikonę, okno, wersję Tauri).
- Bramka dostępu: middleware web sprawdza rolę + `client_accounts.active`
  (opłacona faktura → konto aktywne). Desktop niczego nie omija — to ta sama sesja.
- `capabilities/default.json` — brak uprawnień IPC (thin shell = mała
  powierzchnia ataku).
