import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Profile, UserRole } from '@/types/domain';
import { profiles } from '@/data/seed';

/**
 * AUTHENTICATION
 * ---------------------------------------------------------------------------
 * Phase 1 uses a mock session so the whole product can be navigated without a
 * backend. The shape of this context is deliberately the shape Supabase Auth
 * gives us, so Phase 2 replaces the body of `signIn` / `signOut` / the session
 * bootstrap with `supabase.auth.*` calls and NOTHING in the UI changes:
 *
 *   const { data } = await supabase.auth.getSession()
 *   supabase.auth.onAuthStateChange((_e, session) => ...)
 *   await supabase.auth.signInWithPassword({ email, password })
 *
 * The `profile` (with its role) is loaded from the `profiles` table keyed by
 * `session.user.id` — exactly like the lookup below.
 */

const STORAGE_KEY = 'askcenla.session.v1';

interface AuthContextValue {
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string) => Promise<Profile>;
  signInAs: (profileId: string) => void;
  signOut: () => void;
  hasRole: (...roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Where each role lands after signing in. */
export const HOME_BY_ROLE: Record<UserRole, string> = {
  agent: '/agent',
  broker: '/broker',
  contractor: '/contractor',
  admin: '/admin',
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore the session on boot (Supabase does the same thing asynchronously).
  useEffect(() => {
    try {
      const savedId = window.localStorage.getItem(STORAGE_KEY);
      if (savedId) {
        const found = profiles.find((p) => p.id === savedId);
        if (found) setProfile(found);
      }
    } catch {
      /* localStorage can be unavailable in private mode — treat as signed out */
    }
    setLoading(false);
  }, []);

  const persist = useCallback((next: Profile | null) => {
    setProfile(next);
    try {
      if (next) window.localStorage.setItem(STORAGE_KEY, next.id);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const signIn = useCallback(
    async (email: string) => {
      const found = profiles.find((p) => p.email.toLowerCase() === email.trim().toLowerCase());
      if (!found) throw new Error('No account found for that email address.');
      persist(found);
      return found;
    },
    [persist],
  );

  const signInAs = useCallback(
    (profileId: string) => {
      const found = profiles.find((p) => p.id === profileId);
      if (found) persist(found);
    },
    [persist],
  );

  const signOut = useCallback(() => persist(null), [persist]);

  const hasRole = useCallback(
    (...roles: UserRole[]) => (profile ? roles.includes(profile.role) : false),
    [profile],
  );

  const value = useMemo(
    () => ({ profile, loading, signIn, signInAs, signOut, hasRole }),
    [profile, loading, signIn, signInAs, signOut, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
