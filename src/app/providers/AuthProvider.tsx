import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { EmailMode, Profile, UserRole } from '@/types/domain';
import type { ProfileRow } from '@/types/database';
import { profiles as demoProfiles } from '@/data/seed';
import { isSupabaseConfigured, supabase } from '@/services/supabase';

/**
 * AUTHENTICATION
 * ---------------------------------------------------------------------------
 * Two implementations behind one interface:
 *
 *   Supabase mode  — real sign-up, sign-in and sessions, with the profile row
 *                    (and therefore the ROLE) read from public.profiles. The
 *                    profile is created database-side by the on_auth_user_created
 *                    trigger, so it can never be missing because a client call
 *                    failed halfway through registration.
 *
 *   Mock mode      — the Phase 1 demo accounts, used when no credentials are
 *                    configured so the app always runs from a fresh clone.
 *
 * Nothing outside this file knows which mode is active. Screens call
 * `useAuth()` and get the same shape either way.
 */

const STORAGE_KEY = 'askcenla.session.v1';

export interface SignUpDetails {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  phone?: string;
  businessName?: string;
}

interface AuthContextValue {
  profile: Profile | null;
  loading: boolean;
  /** True when a real backend is behind this session. */
  isLive: boolean;
  signIn: (email: string, password: string) => Promise<Profile>;
  signUp: (details: SignUpDetails) => Promise<{ needsEmailConfirmation: boolean }>;
  /** Demo-account shortcut. Only available in mock mode. */
  signInAs: (profileId: string) => void;
  signOut: () => Promise<void>;
  hasRole: (...roles: UserRole[]) => boolean;
  refreshProfile: () => Promise<void>;
  /**
   * How this person wants to be emailed. Lives on the profile rather than in
   * the data layer because it is part of who you are, not part of the
   * marketplace, and the profile is what AuthProvider owns.
   */
  setEmailMode: (mode: EmailMode) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Where each role lands after signing in. */
export const HOME_BY_ROLE: Record<UserRole, string> = {
  agent: '/agent',
  broker: '/broker',
  contractor: '/contractor',
  admin: '/admin',
};

function rowToProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    role: row.role,
    full_name: row.full_name,
    email: row.email,
    phone: row.phone,
    avatar_url: row.avatar_url,
    brokerage_id: row.brokerage_id,
    contractor_id: row.contractor_id,
    email_mode: row.email_mode,
    created_at: row.created_at,
  };
}

/**
 * Reads the signed-in user's own profile row. RLS guarantees this returns
 * their row and no one else's, so there is no user id to pass in.
 */
async function fetchProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('Could not load profile:', error.message);
    return null;
  }
  return data ? rowToProfile(data) : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // -------------------------------------------------------------------------
  // Session bootstrap
  // -------------------------------------------------------------------------
  useEffect(() => {
    let active = true;

    if (!supabase) {
      // Mock mode: restore the demo account chosen last time.
      try {
        const savedId = window.localStorage.getItem(STORAGE_KEY);
        const found = savedId ? demoProfiles.find((p) => p.id === savedId) : undefined;
        if (found) setProfile(found);
      } catch {
        /* localStorage is unavailable in private mode — treat as signed out */
      }
      setLoading(false);
      return;
    }

    // Supabase mode: resolve the existing session, then follow auth changes
    // (token refresh, sign-out in another tab, magic-link return).
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      if (data.session?.user) {
        setProfile(await fetchProfile(data.session.user.id));
      }
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!active) return;
      setProfile(session?.user ? await fetchProfile(session.user.id) : null);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------
  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      // Mock mode ignores the password; there is nothing to authenticate against.
      const found = demoProfiles.find((p) => p.email.toLowerCase() === email.trim().toLowerCase());
      if (!found) throw new Error('No account found for that email address.');
      setProfile(found);
      try {
        window.localStorage.setItem(STORAGE_KEY, found.id);
      } catch {
        /* ignore */
      }
      return found;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('Sign in failed. Please try again.');

    const loaded = await fetchProfile(data.user.id);
    if (!loaded) {
      throw new Error('Your account has no profile yet. Please contact AskCENLA support.');
    }
    setProfile(loaded);
    return loaded;
  }, []);

  const signUp = useCallback(async (details: SignUpDetails) => {
    if (!supabase) {
      throw new Error(
        'Account creation needs a database. Connect Supabase, or use a demo account below.',
      );
    }

    // The metadata below is read by the on_auth_user_created trigger, which
    // creates the profile (and, for a contractor, a pending contractor record).
    // The trigger refuses to grant 'admin' from this metadata no matter what
    // is sent, so this call cannot be used to self-promote.
    const { data, error } = await supabase.auth.signUp({
      email: details.email.trim(),
      password: details.password,
      options: {
        data: {
          role: details.role,
          full_name: details.fullName,
          phone: details.phone ?? '',
          business_name: details.businessName ?? '',
        },
      },
    });
    if (error) throw new Error(error.message);

    // With "Confirm email" enabled, Supabase returns a user but no session.
    const needsEmailConfirmation = Boolean(data.user) && !data.session;
    if (data.session?.user) {
      setProfile(await fetchProfile(data.session.user.id));
    }
    return { needsEmailConfirmation };
  }, []);

  const signInAs = useCallback((profileId: string) => {
    if (supabase) {
      console.warn('signInAs is a mock-mode helper and does nothing against a real database.');
      return;
    }
    const found = demoProfiles.find((p) => p.id === profileId);
    if (!found) return;
    setProfile(found);
    try {
      window.localStorage.setItem(STORAGE_KEY, found.id);
    } catch {
      /* ignore */
    }
  }, []);

  const signOut = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    setProfile(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const setEmailMode = useCallback(
    async (mode: EmailMode) => {
      if (!profile) return;

      if (supabase) {
        const { error } = await supabase
          .from('profiles')
          .update({ email_mode: mode })
          .eq('id', profile.id);
        if (error) throw new Error(error.message);
      }

      // Applied locally either way, so the control responds immediately and
      // mock mode behaves the same as a live one.
      setProfile({ ...profile, email_mode: mode });
    },
    [profile],
  );

  const refreshProfile = useCallback(async () => {
    if (!supabase || !profile) return;
    setProfile(await fetchProfile(profile.id));
  }, [profile]);

  const hasRole = useCallback(
    (...roles: UserRole[]) => (profile ? roles.includes(profile.role) : false),
    [profile],
  );

  const value = useMemo(
    () => ({
      profile,
      loading,
      isLive: isSupabaseConfigured,
      signIn,
      signUp,
      signInAs,
      signOut,
      hasRole,
      refreshProfile,
      setEmailMode,
    }),
    [profile, loading, signIn, signUp, signInAs, signOut, hasRole, refreshProfile, setEmailMode],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
