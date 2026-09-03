import type {
  Contractor,
  Opportunity,
  OpportunityAssignment,
  Quote,
  RepairItem,
  RepairRequest,
} from '@/types/domain';
import { ATTENTION_OPPORTUNITY_STATUSES, OPEN_OPPORTUNITY_STATUSES } from '@/data/statuses';

/**
 * Read-model helpers.
 *
 * These are pure functions over the store so dashboards stay declarative and
 * the same "what counts as active" rule is not re-implemented on five screens.
 * In Phase 2 several of these become Postgres views.
 */

export interface DataSlice {
  requests: RepairRequest[];
  items: RepairItem[];
  opportunities: Opportunity[];
  assignments: OpportunityAssignment[];
  quotes: Quote[];
  contractors: Contractor[];
}

export function requestsForAgent(data: DataSlice, agentId: string): RepairRequest[] {
  return data.requests
    .filter((r) => r.created_by === agentId)
    .sort((a, b) => (b.submitted_at ?? b.created_at).localeCompare(a.submitted_at ?? a.created_at));
}

export function requestsForBrokerage(data: DataSlice, brokerageId: string): RepairRequest[] {
  return data.requests
    .filter((r) => r.brokerage_id === brokerageId)
    .sort((a, b) => (b.submitted_at ?? b.created_at).localeCompare(a.submitted_at ?? a.created_at));
}

export function opportunitiesForRequest(data: DataSlice, requestId: string): Opportunity[] {
  return data.opportunities.filter((o) => o.request_id === requestId);
}

export function itemForOpportunity(data: DataSlice, opportunity: Opportunity): RepairItem | undefined {
  return data.items.find((i) => i.id === opportunity.repair_item_id);
}

export function requestForOpportunity(data: DataSlice, opportunity: Opportunity): RepairRequest | undefined {
  return data.requests.find((r) => r.id === opportunity.request_id);
}

export function contractorById(data: DataSlice, id: string | null): Contractor | undefined {
  if (!id) return undefined;
  return data.contractors.find((c) => c.id === id);
}

export function quotesForOpportunity(data: DataSlice, opportunityId: string): Quote[] {
  return data.quotes.filter((q) => q.opportunity_id === opportunityId);
}

/** The quote an agent should see: the latest one that has actually been sent. */
export function visibleQuoteForOpportunity(data: DataSlice, opportunityId: string): Quote | undefined {
  return data.quotes
    .filter((q) => q.opportunity_id === opportunityId && q.status !== 'draft')
    .sort((a, b) => (b.submitted_at ?? '').localeCompare(a.submitted_at ?? ''))[0];
}

/**
 * Opportunities a contractor is allowed to see.
 *
 * A contractor sees an opportunity only if it is currently offered to them or
 * they already accepted it. This mirrors the Row Level Security policy that
 * enforces the same rule in Postgres — the UI filter is a convenience, the
 * database is the guarantee.
 */
export function opportunitiesForContractor(data: DataSlice, contractorId: string): Opportunity[] {
  const offeredIds = new Set(
    data.assignments
      .filter((a) => a.contractor_id === contractorId && a.outcome === 'pending')
      .map((a) => a.opportunity_id),
  );
  return data.opportunities.filter((o) => o.contractor_id === contractorId || offeredIds.has(o.id));
}

/** True while the contractor still has a pending, unanswered offer. */
export function isPendingOffer(
  data: DataSlice,
  opportunityId: string,
  contractorId: string,
): OpportunityAssignment | undefined {
  return data.assignments.find(
    (a) => a.opportunity_id === opportunityId && a.contractor_id === contractorId && a.outcome === 'pending',
  );
}

export function assignmentsForOpportunity(data: DataSlice, opportunityId: string): OpportunityAssignment[] {
  return data.assignments
    .filter((a) => a.opportunity_id === opportunityId)
    .sort((a, b) => a.position - b.position);
}

export function isOpen(opportunity: Opportunity): boolean {
  return OPEN_OPPORTUNITY_STATUSES.includes(opportunity.status);
}

export function needsAttention(opportunity: Opportunity): boolean {
  return ATTENTION_OPPORTUNITY_STATUSES.includes(opportunity.status);
}

export function countBy<T>(list: T[], predicate: (item: T) => boolean): number {
  return list.reduce((n, item) => n + (predicate(item) ? 1 : 0), 0);
}

/** Month-to-date filter used across the admin and contractor metric tiles. */
export function isThisMonth(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}
