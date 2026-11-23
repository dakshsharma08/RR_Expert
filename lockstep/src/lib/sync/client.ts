/// <reference types="vite/client" />
/**
 * The Supabase client, created only when cloud sync is configured.
 *
 * Both values are PUBLIC by design: Vite copies every `VITE_*` variable into the
 * browser bundle. The anon key cannot read anything on its own; Row Level
 * Security (supabase/migrations/0001_lockstep.sql) decides what each signed-in
 * user may see. Never put the service-role key in a `VITE_*` variable.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Written exactly as `import.meta.env.VITE_…` because Vite swaps in the values at build time.
const url: string = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const anonKey: string = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

/** True only when the developer has set both env vars. The UI offers sync only then. */
export const cloudConfigured = /^https?:\/\/\S+$/.test(url) && anonKey.length > 0;

let client: SupabaseClient | null = null;

/**
 * Lazy: the client (and its token-refresh timer) starts the first time sync is
 * used, not on every page load for guests. Returns null when not configured.
 */
export function getSupabase(): SupabaseClient | null {
  if (!cloudConfigured) return null;
  client ??= createClient(url, anonKey, {
    auth: {
      persistSession: true, // stay signed in across reloads (kept in localStorage)
      autoRefreshToken: true,
      detectSessionInUrl: true, // finishes sign-in when the magic link brings you back
    },
  });
  return client;
}
