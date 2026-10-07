-- STRONEVO OS — Faza 5: wrapper desktopowy (Tauri). Backend bez nowych tabel;
-- jedyna zmiana: klient musi móc odczytać flagę active WŁASNEGO konta,
-- żeby middleware egzekwował bramkę "login tylko z opłaconą fakturą"
-- (web i desktop — ta sama ścieżka). Uruchomić PO 0005_faza4.sql.

create policy "klient read own account" on public.client_accounts
  for select to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'klient'
    and contact_id = public.jwt_contact_id()
  );
