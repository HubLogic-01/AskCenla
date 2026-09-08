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
 */

import type {
  AssignmentOutcome,
  AttachmentKind,
  AvailabilityStatus,
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

export interface ProfileRow {
  id: string;
  role: UserRole;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  brokerage_id: string | null;
  contractor_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrokerageRow {
  id: string;
  name: string;
  city: string;
  state: string;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface TradeRow {
  key: TradeKey;
  label: string;
  code: string;
  description: string;
  sort_order: number;
  is_active: boolean;
}

export interface TerritoryRow {
  id: string;
  name: string;
  parish: string;
  state: string;
  is_active: boolean;
  created_at: string;
}

export interface TerritoryZipRow {
  zip: string;
  territory_id: string;
}

export interface ContractorRow {
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

export interface RepairRequestRow {
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

export interface RepairItemRow {
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

export interface OpportunityRow {
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

export interface OpportunityAssignmentRow {
  id: string;
  opportunity_id: string;
  contractor_id: string;
  position: number;
  outcome: AssignmentOutcome;
  offered_at: string;
  responded_at: string | null;
  expires_at: string;
}

export interface QuoteRow {
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

export interface QuoteItemRow {
  id: string;
  quote_id: string;
  position: number;
  description: string;
  quantity: number;
  unit_price: number;
  created_at: string;
}

export interface AttachmentRow {
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

export interface NotificationRow {
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
export interface OfferedOpportunityRow {
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

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
};

export interface Database {
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
    };
    Views: {
      offered_opportunities: { Row: OfferedOpportunityRow };
    };
    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
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
