-- STRONEVO OS — Kalendarz spotkań: przydział leada do handlowca.
-- null = przypisane do CEO („Ty"). Idempotentne.
alter table public.contacts add column if not exists przypisany_do text;
