import type {
  Attachment,
  AttachmentKind,
  Contractor,
  AppNotification,
  Opportunity,
  OpportunityAssignment,
  OpportunityStatus,
  Profile,
  Quote,
  RepairItem,
  RepairRequest,
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

/**
 * Thrown when an operation is understood but not yet connected to the
 * database. Lets the UI say something honest instead of failing obscurely.
 */
export class NotYetLiveError extends Error {
  constructor(operation: string, phase: string) {
    super(`${operation} is not connected to the database yet — that lands in ${phase}.`);
    this.name = 'NotYetLiveError';
  }
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

  /** Mock only; a no-op against a real database. */
  resetDemoData(): Promise<void>;
}
