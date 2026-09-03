/** Formatting helpers. Kept in one place so dates and money look the same everywhere. */

const CURRENCY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const CURRENCY_WHOLE = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export function money(value: number, whole = false): string {
  return whole ? CURRENCY_WHOLE.format(value) : CURRENCY.format(value);
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "3 days ago", "in 2 days", "just now". */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diffMs = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (abs < minute) return 'just now';
  const rtf = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });
  if (abs < hour) return rtf.format(Math.round(diffMs / minute), 'minute');
  if (abs < day) return rtf.format(Math.round(diffMs / hour), 'hour');
  if (abs < 30 * day) return rtf.format(Math.round(diffMs / day), 'day');
  return shortDate(iso);
}

export function phone(value: string | null | undefined): string {
  if (!value) return '—';
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return value;
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fullAddress(a: { address_line1: string; city: string; state: string; zip: string }): string {
  return `${a.address_line1}, ${a.city}, ${a.state} ${a.zip}`;
}

/** Contractors see only an approximate location until they accept. */
export function generalLocation(a: { city: string; state: string; zip: string }): string {
  return `${a.city}, ${a.state} ${a.zip}`;
}

export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}
