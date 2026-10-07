// STRONEVO OS — desktopowy wrapper (thin shell).
// Okno ładuje ZDALNY frontend (https://crm.stronevo.pl) — ten sam kod co web,
// bramka logowania (rola + opłacona faktura) egzekwowana po stronie serwera.
//
// AUTO-UPDATE: przy starcie sprawdzany jest manifest
// GET https://crm.stronevo.pl/api/desktop/latest (tauri-plugin-updater).
// Nowsza wersja → cicha instalacja → restart aplikacji. Podpis instalatora
// weryfikowany kluczem publicznym z tauri.conf.json (plugins.updater.pubkey).

use tauri_plugin_updater::UpdaterExt;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // Błędy update'u są ignorowane — wrapper ma zawsze wstać,
                // nawet gdy endpoint manifestu jest niedostępny (204 = brak update'u).
                if let Ok(updater) = handle.updater() {
                    if let Ok(Some(update)) = updater.check().await {
                        let _ = update
                            .download_and_install(|_downloaded, _total| {}, || {})
                            .await
                            .map(|_| handle.restart());
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Nie udało się uruchomić STRONEVO OS");
}
