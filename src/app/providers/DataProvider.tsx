import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  Attachment,
  Contractor,
  MarketplaceMetrics,
  OpportunityStatus,
  Quote,
} from '@/types/domain';
import { useAuth } from './AuthProvider';
import { supabase } from '@/services/supabase';
import { createMockRepository } from '@/services/mockRepository';
import { createSupabaseRepository } from '@/services/supabaseRepository';
import {
  EMPTY_WORKSPACE,
  type NewRequestDraft,
  type Repository,
  type SubmitResult,
  type Workspace,
} from '@/services/repository';

export type { NewRequestDraft, SubmitResult } from '@/services/repository';
export type { DraftRepairItem, DraftAttachment } from '@/services/repository';

/**
 * DATA LAYER
 * ---------------------------------------------------------------------------
 * Holds the signed-in user's workspace and exposes the operations that change
 * it. All the actual work happens in a Repository (src/services/), chosen once
 * at startup: mock data or Supabase.
 *
 * Every action follows the same shape — call the repository, then reload. A
 * reload is one round trip over a small dataset, and it guarantees the screen
 * matches what the database actually accepted rather than what the client
 * hoped it would. Optimistic patching would be faster and, on a permission
 * failure, silently wrong.
 */

interface DataContextValue extends Workspace {
  /** True during the first load, or while a reload is in flight. */
  loading: boolean;
  /** Set when the workspace could not be loaded at all. */
  error: string | null;
  /** Whether a real database is behind this data. */
  isLive: boolean;

  refresh: () => Promise<void>;

  submitRepairRequest: (draft: NewRequestDraft) => Promise<SubmitResult>;
  acceptOpportunity: (opportunityId: string, contractorId: string) => Promise<void>;
  declineOpportunity: (opportunityId: string, contractorId: string) => Promise<void>;
  setOpportunityStatus: (opportunityId: string, status: OpportunityStatus) => Promise<void>;
  rerouteOpportunity: (opportunityId: string) => Promise<void>;
  createDraftQuote: (opportunityId: string, contractorId: string) => Promise<Quote>;
  uploadQuoteAttachment: (quoteId: string, file: File) => Promise<void>;
  removeAttachment: (attachment: Attachment) => Promise<void>;
  saveQuote: (quote: Quote) => Promise<void>;
  submitQuote: (quoteId: string) => Promise<void>;
  decideQuote: (quoteId: string, decision: 'accepted' | 'declined') => Promise<void>;
  updateContractor: (contractorId: string, patch: Partial<Contractor>) => Promise<void>;
  /** Advances every lapsed offer. Returns how many moved on. */
  runOfferSweep: () => Promise<number>;
  /** Admin marketplace roll-up, or null if the viewer is not entitled to it. */
  marketplaceMetrics: () => Promise<MarketplaceMetrics | null>;
  markNotificationRead: (notificationId: string) => Promise<void>;
  markAllNotificationsRead: (recipientId: string) => Promise<void>;
  attachmentUrl: (attachment: Attachment) => Promise<string | null>;
  resetDemoData: () => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

/**
 * One repository for the lifetime of the tab. The mock one owns mutable state,
 * so it must not be rebuilt on every render or edits would vanish.
 */
const repository: Repository = supabase
  ? createSupabaseRepository(supabase)
  : createMockRepository();

export function DataProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [workspace, setWorkspace] = useState<Workspace>(EMPTY_WORKSPACE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guards against a slow response for a previous user overwriting a newer
  // one — e.g. signing out and back in as somebody else mid-request.
  const loadToken = useRef(0);

  const load = useCallback(async () => {
    if (!profile) {
      setWorkspace(EMPTY_WORKSPACE);
      setError(null);
      return;
    }
    const token = ++loadToken.current;
    setLoading(true);
    try {
      const next = await repository.loadWorkspace(profile);
      if (token !== loadToken.current) return;
      setWorkspace(next);
      setError(null);
    } catch (err) {
      if (token !== loadToken.current) return;
      setError(err instanceof Error ? err.message : 'Could not load your data.');
    } finally {
      if (token === loadToken.current) setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Runs a write, then reloads. Errors are re-thrown so the calling screen can
   * show them — swallowing a failed write would leave the user believing
   * something was saved when it was not.
   */
  const mutate = useCallback(
    async <T,>(operation: () => Promise<T>): Promise<T> => {
      const result = await operation();
      await load();
      return result;
    },
    [load],
  );

  const submitRepairRequest = useCallback(
    async (draft: NewRequestDraft) => {
      if (!profile) throw new Error('You must be signed in to submit a repair request.');
      return mutate(() => repository.submitRepairRequest(draft, profile));
    },
    [mutate, profile],
  );

  const value = useMemo<DataContextValue>(
    () => ({
      ...workspace,
      loading,
      error,
      isLive: repository.kind === 'supabase',
      refresh: load,
      submitRepairRequest,
      acceptOpportunity: (opportunityId, contractorId) =>
        mutate(() => repository.acceptOpportunity(opportunityId, contractorId)),
      declineOpportunity: (opportunityId, contractorId) =>
        mutate(() => repository.declineOpportunity(opportunityId, contractorId)),
      setOpportunityStatus: (opportunityId, status) =>
        mutate(() => repository.setOpportunityStatus(opportunityId, status)),
      rerouteOpportunity: (opportunityId) =>
        mutate(() => repository.rerouteOpportunity(opportunityId)),
      createDraftQuote: (opportunityId, contractorId) =>
        mutate(() => repository.createDraftQuote(opportunityId, contractorId)),
      uploadQuoteAttachment: (quoteId, file) =>
        mutate(() => repository.uploadQuoteAttachment(quoteId, file)),
      removeAttachment: (attachment) => mutate(() => repository.removeAttachment(attachment)),
      saveQuote: (quote) => mutate(() => repository.saveQuote(quote)),
      submitQuote: (quoteId) => mutate(() => repository.submitQuote(quoteId)),
      decideQuote: (quoteId, decision) => mutate(() => repository.decideQuote(quoteId, decision)),
      updateContractor: (contractorId, patch) =>
        mutate(() => repository.updateContractor(contractorId, patch)),
      runOfferSweep: () => mutate(() => repository.runOfferSweep()),
      marketplaceMetrics: () => repository.marketplaceMetrics(),
      markNotificationRead: (notificationId) =>
        mutate(() => repository.markNotificationRead(notificationId)),
      markAllNotificationsRead: (recipientId) =>
        mutate(() => repository.markAllNotificationsRead(recipientId)),
      attachmentUrl: (attachment) => repository.attachmentUrl(attachment),
      resetDemoData: () => mutate(() => repository.resetDemoData()),
    }),
    [workspace, loading, error, load, mutate, submitRepairRequest],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside <DataProvider>');
  return ctx;
}
