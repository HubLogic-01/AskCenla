/**
 * Id helpers.
 *
 * The prototype generates ids client-side. In Phase 2 Postgres issues real
 * UUIDs (`gen_random_uuid()`), and this helper is only used for optimistic
 * local rows before the insert round-trips.
 */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Builds the human-facing opportunity code, e.g. request 1042 + "P" => "1042-P". */
export function opportunityCode(reference: number, tradeCode: string): string {
  return `${reference}-${tradeCode}`;
}

export function quoteNumber(reference: number, tradeCode: string, sequence: number): string {
  return `Q-${reference}${tradeCode}-${String(sequence).padStart(2, '0')}`;
}
