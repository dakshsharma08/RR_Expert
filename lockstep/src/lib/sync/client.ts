/**
 * The Supabase client, created only when cloud sync is configured.
 *
 * Both values are PUBLIC by design: Vite copies every `VITE_*` variable into the
 * browser bundle. The anon key cannot read anything on its own; Row Level
 * Security (supabase/migrations/0001_lockstep.sql) decides what each signed-in
 * user may see. Never put the service-role key in a `VITE_*` variable.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Read through a narrow type so this file also type-checks outside Vite (tests).
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const url = env.VITE_SUPABASE_URL?.trim() ?? '';
const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

/** True when the developer has set both env vars. The UI shows sync only then. */
export const cloudConfigured = /^https?:\/\/\S+$/.test(url) && anonKey.length > 0;

let client: SupabaseClient | null = null;

/**
 * Lazy: the client (and its auth refresh timer) starts the first time sync is
 * actually used, not on every page load for guests. Returns null if not configured.
 */
export function getSupabase(): SupabaseClient | null {
  if (!cloudConfigured) return null;
  client ??= createClient(url, anonKey, {
    auth: {
      persistSession: true, // stay signed in across reloads (stored in localStorage)
      autoRefreshToken: true,
      detectSessionInUrl: true, // finishes sign-in when the magic link brings you back
    },
  });
  return client;
}
