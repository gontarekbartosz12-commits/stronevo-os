import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Klient admin (service role) — TYLKO po stronie serwera.
// Używany do zakładania/dezaktywacji kont klientów (Faza 2).
export function isAdminConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
