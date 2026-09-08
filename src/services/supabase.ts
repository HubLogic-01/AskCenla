import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * SUPABASE CLIENT
 * ---------------------------------------------------------------------------
 * The app runs in one of two modes, decided entirely by whether credentials
 * are present in the environment:
 *
 *   mock      — no backend. Demo data lives in memory. This is what you get
 *               with a fresh clone and no .env file, and it is how the UI is
 *               developed and reviewed.
 *   supabase  — real database, real auth, real Row Level Security.
 *
 * Keeping mock mode working is deliberate: it means the project always runs
 * for a new developer, and it means a Supabase outage during development does
 * not block UI work.
 *
 * Only the ANON key belongs here. It is designed to be public — every request
 * it makes is still filtered by the RLS policies in supabase/migrations. The
 * service_role key bypasses RLS entirely and must never appear in this bundle.
 */

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

/** Explicit override, so you can force mock mode even with credentials present. */
const forcedSource = import.meta.env.VITE_DATA_SOURCE?.trim();

export const isSupabaseConfigured =
  forcedSource !== 'mock' && Boolean(url) && Boolean(anonKey);

if (forcedSource === 'supabase' && !isSupabaseConfigured) {
  // Fail loudly rather than silently serving demo data to someone who thinks
  // they are looking at their real database.
  throw new Error(
    'VITE_DATA_SOURCE is "supabase" but VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing. ' +
      'Copy .env.example to .env and fill them in.',
  );
}

export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/** Narrowing helper so call sites do not repeat the null check. */
export function requireSupabase(): SupabaseClient<Database> {
  if (!supabase) {
    throw new Error('Supabase is not configured. Running in mock mode.');
  }
  return supabase;
}

export const dataSourceLabel = isSupabaseConfigured ? 'supabase' : 'mock';

/**
 * Private files are NEVER given a permanent public URL. This asks Supabase for
 * a short-lived signed URL, which it only issues if the storage policies in
 * supabase/migrations/0003_storage.sql pass for the signed-in user.
 */
export async function signedAttachmentUrl(
  storagePath: string,
  expiresInSeconds = 60,
): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.storage
    .from('attachments')
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error) {
    console.error('Could not create signed URL', error.message);
    return null;
  }
  return data.signedUrl;
}
