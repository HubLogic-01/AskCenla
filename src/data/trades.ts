import type { Trade, TradeKey } from '@/types/domain';

/**
 * The trade catalogue. `code` drives the opportunity number suffix
 * (request 1042 + plumbing => "1042-P"), so codes must stay unique.
 */
export const TRADES: Trade[] = [
  { key: 'plumbing', label: 'Plumbing', code: 'P', description: 'Leaks, water heaters, supply and drain lines' },
  { key: 'electrical', label: 'Electrical', code: 'E', description: 'Panels, wiring, outlets, fixtures' },
  { key: 'hvac', label: 'HVAC', code: 'H', description: 'Heating, cooling, ductwork, thermostats' },
  { key: 'roofing', label: 'Roofing', code: 'R', description: 'Shingles, flashing, leaks, decking' },
  { key: 'handyman', label: 'Handyman', code: 'M', description: 'Small mixed repairs and punch lists' },
  { key: 'carpentry', label: 'Carpentry', code: 'C', description: 'Framing, trim, doors, decks, siding' },
  { key: 'painting', label: 'Painting', code: 'N', description: 'Interior and exterior paint and prep' },
  { key: 'foundation', label: 'Foundation', code: 'F', description: 'Piers, settling, slab and structural' },
  { key: 'tree_landscaping', label: 'Tree / Landscaping', code: 'L', description: 'Tree removal, grading, drainage, yard' },
  { key: 'pest_control', label: 'Pest Control', code: 'X', description: 'Termite letters, treatment, WDIR items' },
  { key: 'septic', label: 'Septic', code: 'S', description: 'Tanks, field lines, inspections, pumping' },
  { key: 'flooring', label: 'Flooring', code: 'O', description: 'Carpet, tile, vinyl, hardwood repair' },
  { key: 'general_contractor', label: 'General Contractor', code: 'G', description: 'Multi-trade or larger scopes of work' },
  { key: 'other', label: 'Other', code: 'Z', description: 'Anything that does not fit the list above' },
];

const TRADE_BY_KEY = new Map<TradeKey, Trade>(TRADES.map((t) => [t.key, t]));

export function getTrade(key: TradeKey): Trade {
  const trade = TRADE_BY_KEY.get(key);
  if (!trade) throw new Error(`Unknown trade: ${key}`);
  return trade;
}

export function tradeLabel(key: TradeKey): string {
  return TRADE_BY_KEY.get(key)?.label ?? 'Unknown';
}
