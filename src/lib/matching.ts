import type {
  Contractor,
  Opportunity,
  OpportunityAssignment,
  TradeKey,
} from '@/types/domain';
import { uuid } from './ids';

/**
 * CONTRACTOR MATCHING ENGINE
 * ---------------------------------------------------------------------------
 * This is deliberately a pure function library: it takes data in and returns a
 * ranked list out, with no database or React dependency. That means the exact
 * same logic can later run:
 *
 *   - in the browser (today, over mock data),
 *   - inside a Supabase Edge Function or a Postgres function (Phase 9),
 *   - inside a scheduled job that expires stale offers and advances rotation.
 *
 * Routing model: an opportunity is offered to ONE contractor at a time. If that
 * contractor declines — or the offer window lapses — the opportunity advances
 * to the next contractor in the ranked list. `MAX_CONTRACTORS_PER_TRADE`
 * enforces the "3 per trade per territory" network cap.
 */

/** Network cap: how many contractors may hold a slot for one trade in one territory. */
export const MAX_CONTRACTORS_PER_TRADE = 3;

/** How long a contractor has to respond before the offer rolls to the next one. */
export const OFFER_RESPONSE_HOURS = 24;

export interface EligibilityResult {
  contractor: Contractor;
  eligible: boolean;
  /** Higher is better. Only meaningful when `eligible` is true. */
  score: number;
  reasons: string[];
}

interface MatchInput {
  trade: TradeKey;
  territoryId: string | null;
  contractors: Contractor[];
  /** Contractors already offered this opportunity — never offer twice. */
  excludeContractorIds?: string[];
}

/**
 * Evaluates every contractor against the routing rules and explains the
 * verdict. The admin "matching status" screen renders these reasons directly,
 * which is what makes unmatched opportunities self-diagnosing.
 */
export function evaluateContractors({
  trade,
  territoryId,
  contractors,
  excludeContractorIds = [],
}: MatchInput): EligibilityResult[] {
  const excluded = new Set(excludeContractorIds);

  return contractors.map((contractor) => {
    const reasons: string[] = [];

    if (!contractor.trades.includes(trade)) reasons.push('Does not cover this trade');
    if (territoryId && !contractor.territory_ids.includes(territoryId)) {
      reasons.push('Outside service territory');
    }
    if (!contractor.is_active) reasons.push('Account inactive');
    if (!['active', 'trial'].includes(contractor.membership_status)) {
      reasons.push(`Membership ${contractor.membership_status.replace('_', ' ')}`);
    }
    if (!contractor.accepting_opportunities) reasons.push('Not accepting opportunities');
    if (contractor.availability === 'unavailable') reasons.push('Marked unavailable');
    if (excluded.has(contractor.id)) reasons.push('Already offered this opportunity');

    const eligible = reasons.length === 0;
    return { contractor, eligible, score: eligible ? scoreContractor(contractor) : 0, reasons };
  });
}

/**
 * Ranking score. Lower rotation_priority wins, then acceptance rate, then
 * responsiveness. Written as an additive score so new factors (rating, distance)
 * can be added without restructuring the caller.
 */
function scoreContractor(c: Contractor): number {
  const rotation = 100 - Math.min(c.rotation_priority, 100); // earlier in rotation = higher
  const acceptanceRate =
    c.stats.offers_received > 0 ? (c.stats.offers_accepted / c.stats.offers_received) * 100 : 60;
  const responsiveness = Math.max(0, 48 - c.stats.avg_response_hours) * 1.5;
  const availabilityBonus = c.availability === 'available' ? 20 : 0;

  return rotation * 2 + acceptanceRate + responsiveness + availabilityBonus;
}

/**
 * Returns the routing ladder for an opportunity: the ordered contractors who
 * will be offered it, capped at the network limit.
 */
export function buildRoutingLadder(input: MatchInput): Contractor[] {
  return evaluateContractors(input)
    .filter((r) => r.eligible)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CONTRACTORS_PER_TRADE)
    .map((r) => r.contractor);
}

export interface RoutingDecision {
  /** Null when nobody is eligible — the opportunity needs admin attention. */
  contractor: Contractor | null;
  assignment: OpportunityAssignment | null;
  nextStatus: Opportunity['status'];
  ladder: Contractor[];
}

/**
 * Decides who receives an opportunity next.
 *
 * Called when an opportunity is first created and again every time a
 * contractor declines or an offer expires — a single entry point so automatic
 * reassignment (Phase 9) is a scheduler calling this function on a timer
 * rather than new logic.
 */
export function routeOpportunity(
  opportunity: Opportunity,
  contractors: Contractor[],
  priorAssignments: OpportunityAssignment[],
  now: Date = new Date(),
): RoutingDecision {
  const alreadyOffered = priorAssignments
    .filter((a) => a.opportunity_id === opportunity.id)
    .map((a) => a.contractor_id);

  const ladder = buildRoutingLadder({
    trade: opportunity.trade,
    territoryId: opportunity.territory_id,
    contractors,
  });

  const next = ladder.find((c) => !alreadyOffered.includes(c.id)) ?? null;

  if (!next) {
    return { contractor: null, assignment: null, nextStatus: 'awaiting_contractor', ladder };
  }

  const expires = new Date(now.getTime() + OFFER_RESPONSE_HOURS * 3_600_000);

  return {
    contractor: next,
    ladder,
    nextStatus: 'offered',
    assignment: {
      id: uuid(),
      opportunity_id: opportunity.id,
      contractor_id: next.id,
      position: alreadyOffered.length,
      outcome: 'pending',
      offered_at: now.toISOString(),
      responded_at: null,
      expires_at: expires.toISOString(),
    },
  };
}

/**
 * Offers whose response window has lapsed. Phase 9 runs this on a schedule and
 * feeds each result back into `routeOpportunity` to advance the ladder.
 */
export function findExpiredOffers(
  assignments: OpportunityAssignment[],
  now: Date = new Date(),
): OpportunityAssignment[] {
  return assignments.filter((a) => a.outcome === 'pending' && new Date(a.expires_at) < now);
}
