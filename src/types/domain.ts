/**
 * Domain model for AskCENLA Repair Network.
 *
 * These types intentionally mirror the planned Supabase schema (see
 * docs/ARCHITECTURE.md). When Phase 2 lands, the shapes below become the
 * generated database row types with almost no change to the UI layer.
 *
 * Every id is a UUID string in production; the mock data uses readable ids
 * so the prototype is easy to reason about.
 */

// ---------------------------------------------------------------------------
// Roles & identity
// ---------------------------------------------------------------------------

export type UserRole = 'agent' | 'broker' | 'contractor' | 'admin';

/**
 * How a person wants notifications delivered by email. In-app notifications
 * are always created regardless — this only controls what leaves the platform.
 */
export type EmailMode = 'immediate' | 'daily' | 'off';

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  brokerage_id: string | null;
  contractor_id: string | null;
  email_mode: EmailMode;
  created_at: string;
}

export interface Brokerage {
  id: string;
  name: string;
  city: string;
  state: string;
  phone: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Trades & territories
// ---------------------------------------------------------------------------

/** Stable machine keys. Never rename — they are stored on every opportunity. */
export type TradeKey =
  | 'plumbing'
  | 'electrical'
  | 'hvac'
  | 'roofing'
  | 'handyman'
  | 'carpentry'
  | 'painting'
  | 'foundation'
  | 'tree_landscaping'
  | 'pest_control'
  | 'septic'
  | 'flooring'
  | 'general_contractor'
  | 'other';

export interface Trade {
  key: TradeKey;
  label: string;
  /** Single letter used to build opportunity codes, e.g. 1042-P. */
  code: string;
  description: string;
}

export interface Territory {
  id: string;
  name: string;
  parish: string;
  state: string;
  zip_codes: string[];
}

// ---------------------------------------------------------------------------
// Contractors
// ---------------------------------------------------------------------------

export type MembershipStatus = 'trial' | 'active' | 'past_due' | 'cancelled' | 'pending_approval';
export type AvailabilityStatus = 'available' | 'limited' | 'unavailable';

export interface Contractor {
  id: string;
  business_name: string;
  contact_name: string;
  email: string;
  phone: string;
  address_line1: string;
  city: string;
  state: string;
  zip: string;
  trades: TradeKey[];
  territory_ids: string[];
  license_number: string | null;
  license_expires_on: string | null;
  insurance_carrier: string | null;
  insurance_expires_on: string | null;
  availability: AvailabilityStatus;
  membership_status: MembershipStatus;
  is_active: boolean;
  accepting_opportunities: boolean;
  /** Lower number = earlier in the rotation. Updated after each offer. */
  rotation_priority: number;
  /** Rolling stats used by the matching engine's response history factor. */
  stats: {
    offers_received: number;
    offers_accepted: number;
    avg_response_hours: number;
    jobs_won: number;
  };
  created_at: string;
}

// ---------------------------------------------------------------------------
// Repair requests (the parent "property / transaction" record)
// ---------------------------------------------------------------------------

export type TransactionType =
  | 'buyer_side'
  | 'seller_side'
  | 'listing_prep'
  | 'property_owner'
  | 'other';

export type UrgencyLevel = 'emergency' | 'urgent' | 'standard' | 'flexible';

export type RequestStatus = 'draft' | 'submitted' | 'in_progress' | 'completed' | 'cancelled';

export interface RepairRequest {
  id: string;
  /** Human-facing sequential number, e.g. 1042. */
  reference: number;
  created_by: string;
  brokerage_id: string | null;
  address_line1: string;
  city: string;
  state: string;
  zip: string;
  mls_number: string | null;
  transaction_type: TransactionType;
  status: RequestStatus;
  contact_name: string;
  contact_brokerage: string;
  contact_phone: string;
  contact_email: string;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RepairItem {
  id: string;
  request_id: string;
  trade: TradeKey;
  description: string;
  urgency: UrgencyLevel;
  estimate_deadline: string | null;
  notes: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export type AttachmentKind = 'inspection_report' | 'photo' | 'supporting_document' | 'quote_attachment';

export interface Attachment {
  id: string;
  request_id: string | null;
  quote_id: string | null;
  kind: AttachmentKind;
  file_name: string;
  /** Path inside the private Supabase Storage bucket — never a public URL. */
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Opportunities (one per trade, generated from a repair request)
// ---------------------------------------------------------------------------

export type OpportunityStatus =
  | 'new'
  | 'matching'
  | 'offered'
  | 'accepted'
  | 'declined'
  | 'awaiting_contractor'
  | 'inspection_scheduled'
  | 'quote_in_progress'
  | 'quote_submitted'
  | 'quote_accepted'
  | 'quote_declined'
  | 'won'
  | 'lost'
  | 'completed'
  | 'cancelled';

export interface Opportunity {
  id: string;
  /** Display code such as "1042-P". */
  code: string;
  request_id: string;
  repair_item_id: string;
  trade: TradeKey;
  territory_id: string | null;
  status: OpportunityStatus;
  /** Contractor who accepted. Null while the opportunity is still routing. */
  contractor_id: string | null;
  /** How far through the rotation we are (0 = first contractor offered). */
  routing_position: number;
  offered_at: string | null;
  /** Offers auto-advance to the next contractor after this timestamp. */
  offer_expires_at: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

export type AssignmentOutcome = 'pending' | 'accepted' | 'declined' | 'expired' | 'withdrawn';

/** One row per contractor an opportunity was offered to — the routing audit trail. */
export interface OpportunityAssignment {
  id: string;
  opportunity_id: string;
  contractor_id: string;
  position: number;
  outcome: AssignmentOutcome;
  offered_at: string;
  responded_at: string | null;
  expires_at: string;
}

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

export type QuoteStatus = 'draft' | 'submitted' | 'accepted' | 'declined' | 'expired' | 'withdrawn';

export interface QuoteLineItem {
  id: string;
  quote_id: string;
  position: number;
  description: string;
  quantity: number;
  unit_price: number;
}

export interface Quote {
  id: string;
  quote_number: string;
  opportunity_id: string;
  contractor_id: string;
  status: QuoteStatus;
  notes: string | null;
  exclusions: string | null;
  tax_rate: number;
  expires_on: string | null;
  submitted_at: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
  items: QuoteLineItem[];
}

// ---------------------------------------------------------------------------
// Notifications & audit
// ---------------------------------------------------------------------------

export type NotificationKind =
  | 'opportunity_offered'
  | 'opportunity_accepted'
  | 'quote_submitted'
  | 'quote_accepted'
  | 'quote_declined'
  | 'reminder'
  | 'system';

export interface AppNotification {
  id: string;
  recipient_id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

/**
 * The admin marketplace roll-up. Computed by public.marketplace_metrics in the
 * database rather than by counting a downloaded workspace in the browser.
 */
export interface MarketplaceMetrics {
  requests_this_month: number;
  opportunities_this_month: number;
  accepted_this_month: number;
  quotes_this_month: number;
  unmatched_opportunities: number;
  avg_response_hours: number;
  acceptance_rate: number;
  jobs_won: number;
  active_members: number;
  trial_members: number;
  pending_members: number;
  past_due_members: number;
  monthly_recurring_revenue: number;
}

export interface StatusHistoryEntry {
  id: string;
  entity_type: 'repair_request' | 'opportunity' | 'quote';
  entity_id: string;
  from_status: string | null;
  to_status: string;
  actor_id: string | null;
  note: string | null;
  created_at: string;
}
