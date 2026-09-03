import type { Quote } from '@/types/domain';

export interface QuoteTotals {
  subtotal: number;
  tax: number;
  total: number;
}

/** Single source of truth for quote arithmetic — used by the builder and every viewer. */
export function quoteTotals(quote: Pick<Quote, 'items' | 'tax_rate'>): QuoteTotals {
  const subtotal = quote.items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
  const tax = subtotal * (quote.tax_rate / 100);
  return { subtotal, tax, total: subtotal + tax };
}

export function isExpired(quote: Pick<Quote, 'expires_on' | 'status'>): boolean {
  if (!quote.expires_on) return false;
  if (quote.status !== 'submitted') return false;
  return new Date(quote.expires_on).getTime() < Date.now();
}
