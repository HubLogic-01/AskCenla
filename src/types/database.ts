/**
 * Database types.
 *
 * Hand-maintained to match supabase/migrations. Once your project is live you
 * can regenerate this file from the real schema instead of editing it:
 *
 *     npx supabase gen types typescript --project-id <ref> > src/types/database.ts
 *
 * The row shapes intentionally match src/types/domain.ts, so the UI keeps
 * using the domain types and only the data layer touches these.
 *
 * These are `type` aliases, not `interface`s, and must stay that way. An
 * interface has no implicit index signature, so it does not satisfy
 * postgrest-js's `Record<string, unknown>` constraint — every table silently
 * collapses to `never` and query results lose their types. Generated Supabase
 * types use aliases for the same reason.
 */

import type {
  AssignmentOutcome,
  AttachmentKind,
  AvailabilityStatus,
  EmailMode,
  MembershipStatus,
  NotificationKind,
  OpportunityStatus,
  QuoteStatus,
  RequestStatus,
  TradeKey,
  TransactionType,
  UrgencyLevel,
  UserRole,
} from './domain';

export type ProfileRow = {
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
  updated_at: string;
}

export type BrokerageRow = {
  id: string;
  name: string;
  city: string;
  state: string;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

export type TradeRow = {
  key: TradeKey;
  label: string;
  code: string;
  description: string;
  sort_order: number;
  is_active: boolean;
}

export type TerritoryRow = {
  id: string;
  name: string;
  parish: string;
  state: string;
  is_active: boolean;
  created_at: string;
}

export type TerritoryZipRow = {
  zip: string;
  territory_id: string;
}

export type ContractorRow = {
  id: string;
  business_name: string;
  contact_name: string;
  email: string;
  phone: string;
  address_line1: string;
  city: string;
  state: string;
  zip: string | null;
  license_number: string | null;
  license_expires_on: string | null;
  insurance_carrier: string | null;
  insurance_expires_on: string | null;
  availability: AvailabilityStatus;
  membership_status: MembershipStatus;
  is_active: boolean;
  accepting_opportunities: boolean;
  rotation_priority: number;
  offers_received: number;
  offers_accepted: number;
  avg_response_hours: number;
  jobs_won: number;
  created_at: string;
  updated_at: string;
}

export type RepairRequestRow = {
  id: string;
  reference: number;
  created_by: string;
  brokerage_id: string | null;
  address_line1: string;
  city: string;
  state: string;
  zip: string;
  territory_id: string | null;
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

export type RepairItemRow = {
  id: string;
  request_id: string;
  trade_key: TradeKey;
  description: string;
  urgency: UrgencyLevel;
  estimate_deadline: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type OpportunityRow = {
  id: string;
  code: string;
  request_id: string;
  repair_item_id: string;
  trade_key: TradeKey;
  territory_id: string | null;
  status: OpportunityStatus;
  contractor_id: string | null;
  routing_position: number;
  offered_at: string | null;
  offer_expires_at: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

export type OpportunityAssignmentRow = {
  id: string;
  opportunity_id: string;
  contractor_id: string;
  position: number;
  outcome: AssignmentOutcome;
  offered_at: string;
  responded_at: string | null;
  expires_at: string;
}

export type QuoteRow = {
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
}

export type QuoteItemRow = {
  id: string;
  quote_id: string;
  position: number;
  description: string;
  quantity: number;
  unit_price: number;
  created_at: string;
}

export type AttachmentRow = {
  id: string;
  request_id: string | null;
  quote_id: string | null;
  kind: AttachmentKind;
  file_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string;
  created_at: string;
}

export type StatusHistoryRow = {
  id: string;
  entity_type: 'repair_request' | 'opportunity' | 'quote';
  entity_id: string;
  from_status: string | null;
  to_status: string;
  actor_id: string | null;
  note: string | null;
  created_at: string;
};

/** One row from public.marketplace_metrics. Counts arrive as strings. */
export type MarketplaceMetricsRow = {
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
};

export type NotificationRow = {
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
 * The pre-acceptance contractor feed (public.offered_opportunities).
 *
 * Note what is ABSENT: address_line1, mls_number and every contact_* column.
 * That omission is the privacy guarantee, enforced by the view definition in
 * supabase/migrations/0002_rls.sql rather than by frontend code.
 */
export type OfferedOpportunityRow = {
  opportunity_id: string;
  code: string;
  status: OpportunityStatus;
  trade_key: TradeKey;
  territory_id: string | null;
  created_at: string;
  offered_at: string | null;
  offer_expires_at: string | null;
  contractor_id: string;
  routing_position: number;
  respond_by: string;
  city: string;
  state: string;
  zip: string;
  description: string;
  urgency: UrgencyLevel;
  estimate_deadline: string | null;
}

/**
 * `Relationships` is required by postgrest-js's generic table shape. We do not
 * use embedded-resource selects (`select('*, contractors(*)')`), so an empty
 * list is accurate — every join in this codebase is done explicitly.
 */
/** Argument shape of public.submit_repair_request(). */
export type SubmitRepairRequestPayload = {
  address_line1: string;
  city: string;
  state: string;
  zip: string;
  mls_number: string | null;
  transaction_type: TransactionType;
  contact_name: string;
  contact_brokerage: string;
  contact_phone: string;
  contact_email: string;
  items: {
    trade: TradeKey;
    description: string;
    urgency: UrgencyLevel;
    estimate_deadline: string | null;
    notes: string | null;
  }[];
}

/** Return shape of public.submit_repair_request(). */
export type SubmitRepairRequestResult = {
  request_id: string;
  reference: number;
  opportunities: { id: string; code: string; trade: TradeKey; status: OpportunityStatus }[];
}

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow>;
      brokerages: Table<BrokerageRow>;
      trades: Table<TradeRow>;
      territories: Table<TerritoryRow>;
      territory_zips: Table<TerritoryZipRow>;
      contractors: Table<ContractorRow>;
      contractor_trades: Table<{ contractor_id: string; trade_key: TradeKey }>;
      contractor_territories: Table<{ contractor_id: string; territory_id: string }>;
      repair_requests: Table<RepairRequestRow>;
      repair_items: Table<RepairItemRow>;
      opportunities: Table<OpportunityRow>;
      opportunity_assignments: Table<OpportunityAssignmentRow>;
      quotes: Table<QuoteRow>;
      quote_items: Table<QuoteItemRow>;
      attachments: Table<AttachmentRow>;
      notifications: Table<NotificationRow>;
      status_history: Table<StatusHistoryRow>;
    };
    Views: {
      offered_opportunities: { Row: OfferedOpportunityRow; Relationships: [] };
      /** Admin-only; returns zero rows for anyone else. */
      marketplace_metrics: { Row: MarketplaceMetricsRow; Relationships: [] };
    };
    Functions: {
      /** supabase/migrations/0006_functions.sql */
      submit_repair_request: {
        Args: { p_payload: SubmitRepairRequestPayload };
        Returns: SubmitRepairRequestResult;
      };
      /** Admin-only manual run of the offer expiry sweep. Returns the count advanced. */
      run_offer_sweep: {
        Args: Record<string, never>;
        Returns: number;
      };
      /** supabase/migrations/0008_contractor_actions.sql */
      accept_opportunity: {
        Args: { p_opportunity_id: string };
        Returns: { opportunity_id: string; status: OpportunityStatus; contractor_id: string };
      };
      decline_opportunity: {
        Args: { p_opportunity_id: string };
        Returns: { opportunity_id: string; next_contractor: string | null };
      };
      /** Admin-only. Withdraws the live offer and offers to the next contractor. */
      reroute_opportunity: {
        Args: { p_opportunity_id: string };
        Returns: { opportunity_id: string; next_contractor: string | null };
      };
      /** supabase/migrations/0009_quotes.sql */
      create_draft_quote: {
        Args: { p_opportunity_id: string };
        Returns: { quote_id: string; quote_number: string };
      };
      save_quote: {
        Args: {
          p_quote_id: string;
          p_quote: { notes: string; exclusions: string; tax_rate: string; expires_on: string };
          p_items: { description: string; quantity: string; unit_price: string }[];
        };
        Returns: undefined;
      };
      submit_quote: {
        Args: { p_quote_id: string };
        Returns: { quote_id: string; status: QuoteStatus };
      };
      decide_quote: {
        Args: { p_quote_id: string; p_decision: 'accepted' | 'declined' };
        Returns: { quote_id: string; status: QuoteStatus };
      };
      /** supabase/migrations/0010_admin.sql */
      set_contractor_trades: {
        Args: { p_contractor_id: string; p_trades: string[] };
        Returns: undefined;
      };
      set_contractor_territories: {
        Args: { p_contractor_id: string; p_territories: string[] };
        Returns: undefined;
      };
      set_contractor_membership: {
        Args: { p_contractor_id: string; p_status: MembershipStatus; p_is_active: boolean };
        Returns: { contractor_id: string; membership_status: MembershipStatus; is_active: boolean };
      };
      /** supabase/migrations/0013_billing.sql */
      my_membership: {
        Args: Record<string, never>;
        Returns: {
          membership_status: MembershipStatus;
          is_active: boolean;
          monthly_fee: number;
          has_subscription: boolean;
          stripe_status: string | null;
          current_period_end: string | null;
          cancel_at_period_end: boolean;
        };
      };
    };
    Enums: {
      user_role: UserRole;
      email_mode: EmailMode;
      transaction_type: TransactionType;
      urgency_level: UrgencyLevel;
      request_status: RequestStatus;
      opportunity_status: OpportunityStatus;
      assignment_outcome: AssignmentOutcome;
      quote_status: QuoteStatus;
      membership_status: MembershipStatus;
      availability_status: AvailabilityStatus;
      attachment_kind: AttachmentKind;
      notification_kind: NotificationKind;
    };
  };
}
