'use client';

import { createBrowserClient } from '@supabase/ssr';

// Klient Supabase dla komponentów klienckich (logowanie).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
