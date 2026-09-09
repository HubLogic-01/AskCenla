import type {
  Attachment,
  AttachmentKind,
  Contractor,
  AppNotification,
  MarketplaceMetrics,
  Membership,
  Opportunity,
  OpportunityAssignment,
  OpportunityStatus,
  Profile,
  Quote,
  RepairItem,
  RepairRequest,
  StatusHistoryEntry,
  TradeKey,
  TransactionType,
  UrgencyLevel,
} from '@/types/domain';

/**
 * THE DATA SEAM
 * ---------------------------------------------------------------------------
 * Everything the application can read or write, expressed once. Two
 * implementations satisfy it:
 *
 *   mockRepository      — in-memory demo data. Always available, so a fresh
 *                         clone runs with no backend and UI work is never
 *                         blocked on a database.
 *   supabaseRepository  — real queries against PostgreSQL, filtered by Row
 *                         Level Security.
 *
 * `DataProvider` picks one at startup and no screen knows which.
 *
 * Note the shape of the write methods: they are OPERATIONS ("accept this
 * opportunity"), not table mutations. That is what allows the Supabase
 * implementation to route a call through a SECURITY DEFINER function while the
 * mock one just edits an array.
 */

export interface Workspace {
  contractors: Contractor[];
  requests: RepairRequest[];
  items: RepairItem[];
  opportunities: Opportunity[];
  assignments: OpportunityAssignment[];
  quotes: Quote[];
  attachments: Attachment[];
  notifications: AppNotification[];
  /** Audit trail of every status change the viewer is allowed to see. */
  statusHistory: StatusHistoryEntry[];
}

export const EMPTY_WORKSPACE: Workspace = {
  contractors: [],
  requests: [],
  items: [],
  opportunities: [],
  assignments: [],
  quotes: [],
  attachments: [],
  notifications: [],
  statusHistory: [],
};

export interface DraftRepairItem {
  trade: TradeKey;
  description: string;
  urgency: UrgencyLevel;
  estimate_deadline: string;
  notes: string;
}

export interface DraftAttachment {
  file_name: string;
  size_bytes: number;
  mime_type: string;
  kind: AttachmentKind;
  /**
   * The real browser File. Present whenever the user actually picked a file;
   * the mock repository ignores it, the Supabase one uploads it.
   */
  file?: File;
}

export interface NewRequestDraft {
  address_line1: string;
  city: string;
  state: string;
  zip: string;
  mls_number: string;
  transaction_type: TransactionType;
  items: DraftRepairItem[];
  files: DraftAttachment[];
  contact_name: string;
  contact_brokerage: string;
  contact_phone: string;
  contact_email: string;
}

export interface SubmitResult {
  request: RepairRequest;
  opportunities: Opportunity[];
  /**
   * Non-fatal problems, e.g. the request saved but one file failed to upload.
   * Surfaced on the confirmation screen rather than swallowed — losing an
   * inspection report silently would be worse than an ugly message.
   */
  warnings: string[];
}

export interface Repository {
  readonly kind: 'mock' | 'supabase';

  /** Everything the signed-in user is allowed to see. */
  loadWorkspace(profile: Profile): Promise<Workspace>;

  submitRepairRequest(draft: NewRequestDraft, profile: Profile): Promise<SubmitResult>;

  acceptOpportunity(opportunityId: string, contractorId: string): Promise<void>;
  declineOpportunity(opportunityId: string, contractorId: string): Promise<void>;
  setOpportunityStatus(opportunityId: string, status: OpportunityStatus): Promise<void>;
  rerouteOpportunity(opportunityId: string): Promise<void>;

  createDraftQuote(opportunityId: string, contractorId: string): Promise<Quote>;
  /** Attaches a file to a quote (a spec sheet, a warranty, a photo of the fault). */
  uploadQuoteAttachment(quoteId: string, file: File): Promise<void>;
  removeAttachment(attachment: Attachment): Promise<void>;
  saveQuote(quote: Quote): Promise<void>;
  submitQuote(quoteId: string): Promise<void>;
  decideQuote(quoteId: string, decision: 'accepted' | 'declined'): Promise<void>;

  updateContractor(contractorId: string, patch: Partial<Contractor>): Promise<void>;

  /**
   * Expires offers whose response window has lapsed and advances each one to
   * the next contractor. Runs on a schedule server-side; this is the manual
   * trigger for an administrator. Returns how many offers were advanced.
   */
  runOfferSweep(): Promise<number>;

  markNotificationRead(notificationId: string): Promise<void>;
  markAllNotificationsRead(recipientId: string): Promise<void>;

  /**
   * A short-lived URL for a private file, or null if the repository cannot
   * produce one (mock mode has no real storage).
   */
  attachmentUrl(attachment: Attachment): Promise<string | null>;

  /**
   * The admin marketplace roll-up, or null for anyone not entitled to it.
   * Counted in the database rather than by downloading the marketplace and
   * counting it in the browser.
   */
  marketplaceMetrics(): Promise<MarketplaceMetrics | null>;

  /** The signed-in contractor's membership and billing state. */
  membership(): Promise<Membership | null>;

  /**
   * Starts Stripe Checkout, or opens the billing portal for an existing
   * subscription. Returns the URL to send the browser to, or null when billing
   * is not configured.
   */
  billingSession(mode: 'checkout' | 'portal'): Promise<string | null>;

  /** Mock only; a no-op against a real database. */
  resetDemoData(): Promise<void>;
}
