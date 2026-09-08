/// <reference types="vite/client" />

/**
 * Typed environment variables. Declaring them here means a typo in
 * `import.meta.env.VITE_SUPBASE_URL` is a build error rather than an
 * `undefined` that only shows up at runtime.
 *
 * Only VITE_-prefixed variables reach the browser bundle. Never add a secret
 * (a service_role key, a Stripe secret key) to this list.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string;
  /** 'mock' forces the in-memory demo store even when credentials are present. */
  readonly VITE_DATA_SOURCE?: 'mock' | 'supabase';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
