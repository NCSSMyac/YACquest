/**
 * The Supabase client, created on first use so the browser-only demo (no env vars)
 * can import this module without crashing.
 *
 * VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY come from `.env.local` locally and from
 * GitHub Actions repository variables in the deploy workflow. The anon key is public
 * by design — Row Level Security on the database is what protects the data.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const supabaseConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  if (!supabaseConfigured) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing).');
  client = createClient(import.meta.env.VITE_SUPABASE_URL!, import.meta.env.VITE_SUPABASE_ANON_KEY!, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return client;
}

/** Lazily-created client: `supabase.from(...)` works, but nothing is created until first use. */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const c = getSupabase();
    const value = Reflect.get(c, prop, c);
    return typeof value === 'function' ? value.bind(c) : value;
  },
});

/**
 * The app's own URL without the hash, used for email links. The app uses HashRouter,
 * so Supabase redirects back with a query string (`?confirmed=1`, `?reset=1`).
 */
export function siteUrl(): string {
  return window.location.origin + window.location.pathname;
}
