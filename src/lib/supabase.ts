/**
 * The Supabase client, created on first use so the browser-only demo (no env vars)
 * can import this module without crashing.
 *
 * VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY come from `.env.local` locally and from
 * GitHub Actions repository variables in the deploy workflow. The anon key is public
 * by design — Row Level Security on the database is what protects the data.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cleans up common copy-paste mistakes in the settings (stray spaces/newlines, or a dashboard
 * link like "https://<ref>/settings/api-keys.supabase.co") so the app still finds the project.
 */
function normalizeUrl(raw: string | undefined): string {
  const v = (raw ?? '').trim().replace(/\/+$/, '');
  if (!v) return '';
  const ref = /^https?:\/\/([a-z0-9]{20})(?:[./]|$)/i.exec(v)?.[1];
  return ref ? `https://${ref.toLowerCase()}.supabase.co` : v;
}

const SUPABASE_URL = normalizeUrl(import.meta.env.VITE_SUPABASE_URL);
const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

/** Non-secret summary of which server this build talks to (shown on the Help page for troubleshooting). */
export const serverInfo = supabaseConfigured
  ? `${SUPABASE_URL.replace(/^https?:\/\//, '')} · key ${SUPABASE_KEY.slice(0, 18)}…`
  : 'demo mode (no server)';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  if (!supabaseConfigured) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing).');
  client = createClient(SUPABASE_URL, SUPABASE_KEY, {
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
