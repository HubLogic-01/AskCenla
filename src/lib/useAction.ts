import { useCallback, useState } from 'react';

/**
 * Runs a user-initiated async action, tracking whether it is in flight and
 * capturing any failure as a message the screen can show.
 *
 * Data actions became asynchronous when the repository seam landed, and a
 * rejected promise from an onClick handler is invisible to the user. That
 * matters most in live mode: an operation the database refuses — a permission
 * failure, or something not yet wired up — must say so rather than appear to
 * work and quietly change nothing.
 */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (operation: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { busy, error, run, clearError };
}
