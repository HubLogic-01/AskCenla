import { Badge } from './Badge';
import {
  MEMBERSHIP_STATUSES,
  OPPORTUNITY_STATUSES,
  QUOTE_STATUSES,
  REQUEST_STATUSES,
  URGENCY_LEVELS,
} from '@/data/statuses';
import type {
  MembershipStatus,
  OpportunityStatus,
  QuoteStatus,
  RequestStatus,
  UrgencyLevel,
} from '@/types/domain';

/**
 * Status colour is decided in one place (src/data/statuses.ts) so the same
 * status never shows up as two different colours on two different screens.
 */
export function OpportunityStatusBadge({ status }: { status: OpportunityStatus }) {
  const meta = OPPORTUNITY_STATUSES[status];
  return <Badge tone={meta.tone} dot>{meta.label}</Badge>;
}

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const meta = REQUEST_STATUSES[status];
  return <Badge tone={meta.tone} dot>{meta.label}</Badge>;
}

export function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  const meta = QUOTE_STATUSES[status];
  return <Badge tone={meta.tone} dot>{meta.label}</Badge>;
}

export function MembershipBadge({ status }: { status: MembershipStatus }) {
  const meta = MEMBERSHIP_STATUSES[status];
  return <Badge tone={meta.tone} dot>{meta.label}</Badge>;
}

export function UrgencyBadge({ level }: { level: UrgencyLevel }) {
  const meta = URGENCY_LEVELS[level];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}
