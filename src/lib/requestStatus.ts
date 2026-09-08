import type { Opportunity, RequestStatus } from '@/types/domain';

/**
 * Derives a repair request's status from its opportunities.
 *
 * This is the TypeScript twin of `app.sync_request_status()` in
 * supabase/migrations/0007_routing_automation.sql. The database is
 * authoritative for live data; this exists so demo mode behaves identically
 * rather than showing "Submitted" forever.
 *
 * Keep the two in step — the rule is deliberately simple so that is easy.
 */

/** Trades that have reached an end state, one way or another. */
const FINISHED: Opportunity['status'][] = [
  'completed',
  'won',
  'lost',
  'cancelled',
  'quote_accepted',
];

/** Trades still waiting for a contractor to take them on. */
const UNENGAGED: Opportunity['status'][] = ['new', 'matching', 'offered', 'awaiting_contractor'];

export function deriveRequestStatus(
  current: RequestStatus,
  opportunities: Opportunity[],
): RequestStatus {
  // Cancelling is a human decision and is never undone by the automation.
  if (current === 'cancelled') return current;
  if (opportunities.length === 0) return current;

  const finished = opportunities.filter((o) => FINISHED.includes(o.status)).length;
  const engaged = opportunities.filter((o) => !UNENGAGED.includes(o.status)).length;

  if (finished === opportunities.length) return 'completed';
  if (engaged > 0) return 'in_progress';
  return 'submitted';
}
