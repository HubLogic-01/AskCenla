import type {
  MembershipStatus,
  OpportunityStatus,
  QuoteStatus,
  RequestStatus,
  TransactionType,
  UrgencyLevel,
} from '@/types/domain';

/**
 * A single controlled vocabulary for every status in the product.
 *
 * `tone` maps to a Badge colour so status colours are consistent everywhere,
 * and `agentLabel` lets us show an agent-friendly phrase without changing the
 * value stored in the database.
 */
export type StatusTone = 'neutral' | 'info' | 'progress' | 'success' | 'warning' | 'danger';

export interface StatusMeta<T extends string> {
  value: T;
  label: string;
  tone: StatusTone;
  description: string;
}

export const OPPORTUNITY_STATUSES: Record<OpportunityStatus, StatusMeta<OpportunityStatus>> = {
  new: { value: 'new', label: 'New', tone: 'neutral', description: 'Created, not yet routed.' },
  matching: { value: 'matching', label: 'Matching', tone: 'info', description: 'Finding eligible contractors.' },
  offered: { value: 'offered', label: 'Offered', tone: 'info', description: 'Sent to a contractor, awaiting response.' },
  accepted: { value: 'accepted', label: 'Accepted', tone: 'progress', description: 'Contractor accepted the opportunity.' },
  declined: { value: 'declined', label: 'Declined', tone: 'warning', description: 'Contractor declined; re-routing.' },
  awaiting_contractor: { value: 'awaiting_contractor', label: 'Awaiting Contractor', tone: 'warning', description: 'No contractor has accepted yet.' },
  inspection_scheduled: { value: 'inspection_scheduled', label: 'Inspection Scheduled', tone: 'progress', description: 'Site visit is on the calendar.' },
  quote_in_progress: { value: 'quote_in_progress', label: 'Quote In Progress', tone: 'progress', description: 'Contractor is preparing a quote.' },
  quote_submitted: { value: 'quote_submitted', label: 'Quote Submitted', tone: 'info', description: 'Quote is waiting on the agent.' },
  quote_accepted: { value: 'quote_accepted', label: 'Quote Accepted', tone: 'success', description: 'Agent accepted the quote.' },
  quote_declined: { value: 'quote_declined', label: 'Quote Declined', tone: 'danger', description: 'Agent declined the quote.' },
  won: { value: 'won', label: 'Won', tone: 'success', description: 'Contractor reported the job as won.' },
  lost: { value: 'lost', label: 'Lost', tone: 'danger', description: 'Job went elsewhere.' },
  completed: { value: 'completed', label: 'Completed', tone: 'success', description: 'Work finished.' },
  cancelled: { value: 'cancelled', label: 'Cancelled', tone: 'neutral', description: 'No longer needed.' },
};

export const REQUEST_STATUSES: Record<RequestStatus, StatusMeta<RequestStatus>> = {
  draft: { value: 'draft', label: 'Draft', tone: 'neutral', description: 'Not submitted yet.' },
  submitted: { value: 'submitted', label: 'Submitted', tone: 'info', description: 'Routing to contractors.' },
  in_progress: { value: 'in_progress', label: 'In Progress', tone: 'progress', description: 'Work underway.' },
  completed: { value: 'completed', label: 'Completed', tone: 'success', description: 'All trades resolved.' },
  cancelled: { value: 'cancelled', label: 'Cancelled', tone: 'neutral', description: 'Request cancelled.' },
};

export const QUOTE_STATUSES: Record<QuoteStatus, StatusMeta<QuoteStatus>> = {
  draft: { value: 'draft', label: 'Draft', tone: 'neutral', description: 'Not sent to the agent.' },
  submitted: { value: 'submitted', label: 'Submitted', tone: 'info', description: 'Awaiting agent decision.' },
  accepted: { value: 'accepted', label: 'Accepted', tone: 'success', description: 'Agent accepted this quote.' },
  declined: { value: 'declined', label: 'Declined', tone: 'danger', description: 'Agent declined this quote.' },
  expired: { value: 'expired', label: 'Expired', tone: 'warning', description: 'Past its expiration date.' },
  withdrawn: { value: 'withdrawn', label: 'Withdrawn', tone: 'neutral', description: 'Pulled back by the contractor.' },
};

export const MEMBERSHIP_STATUSES: Record<MembershipStatus, StatusMeta<MembershipStatus>> = {
  pending_approval: { value: 'pending_approval', label: 'Pending Approval', tone: 'warning', description: 'Awaiting admin review.' },
  trial: { value: 'trial', label: 'Trial', tone: 'info', description: 'Trial membership.' },
  active: { value: 'active', label: 'Active', tone: 'success', description: 'Membership in good standing.' },
  past_due: { value: 'past_due', label: 'Past Due', tone: 'danger', description: 'Payment failed — routing paused.' },
  cancelled: { value: 'cancelled', label: 'Cancelled', tone: 'neutral', description: 'Membership ended.' },
};

export const URGENCY_LEVELS: Record<UrgencyLevel, StatusMeta<UrgencyLevel>> = {
  emergency: { value: 'emergency', label: 'Emergency', tone: 'danger', description: 'Active damage or safety issue.' },
  urgent: { value: 'urgent', label: 'Urgent', tone: 'warning', description: 'Needed within a few days.' },
  standard: { value: 'standard', label: 'Standard', tone: 'info', description: 'Normal transaction timeline.' },
  flexible: { value: 'flexible', label: 'Flexible', tone: 'neutral', description: 'No hard deadline.' },
};

export const TRANSACTION_TYPES: Record<TransactionType, { value: TransactionType; label: string; hint: string }> = {
  buyer_side: { value: 'buyer_side', label: 'Buyer Side', hint: 'Repairs requested after inspection' },
  seller_side: { value: 'seller_side', label: 'Seller Side', hint: 'Repairs negotiated by the seller' },
  listing_prep: { value: 'listing_prep', label: 'Listing Preparation', hint: 'Getting the property market ready' },
  property_owner: { value: 'property_owner', label: 'Property Owner', hint: 'Owner-directed maintenance' },
  other: { value: 'other', label: 'Other', hint: 'Anything else' },
};

/** Statuses that mean "this opportunity still needs someone to act". */
export const OPEN_OPPORTUNITY_STATUSES: OpportunityStatus[] = [
  'new',
  'matching',
  'offered',
  'accepted',
  'awaiting_contractor',
  'inspection_scheduled',
  'quote_in_progress',
  'quote_submitted',
];

/** Statuses that need the platform owner or agent to look at them. */
export const ATTENTION_OPPORTUNITY_STATUSES: OpportunityStatus[] = [
  'awaiting_contractor',
  'declined',
  'quote_declined',
];
