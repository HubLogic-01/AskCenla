import type { StatusHistoryEntry } from '@/types/domain';
import { OPPORTUNITY_STATUSES, REQUEST_STATUSES, QUOTE_STATUSES } from '@/data/statuses';
import { dateTime, relativeTime } from '@/lib/format';

/**
 * Renders the audit trail recorded by `app.record_status_change()`.
 *
 * The database writes these by trigger rather than from a call site, so the
 * timeline is correct regardless of what caused the change — an agent, a
 * contractor, or the scheduled sweep advancing an offer at 3am. That last case
 * is the reason this screen is worth having: it is the only way to see what
 * the automation did while nobody was watching.
 */

/** Statuses come from three different vocabularies; look up whichever applies. */
function labelFor(entry: StatusHistoryEntry, status: string | null): string {
  if (!status) return 'Created';
  const table =
    entry.entity_type === 'opportunity'
      ? OPPORTUNITY_STATUSES
      : entry.entity_type === 'repair_request'
        ? REQUEST_STATUSES
        : QUOTE_STATUSES;
  const meta = (table as Record<string, { label: string } | undefined>)[status];
  return meta?.label ?? status.replace(/_/g, ' ');
}

export function ActivityTimeline({
  entries,
  labelForEntity,
  limit = 40,
}: {
  entries: StatusHistoryEntry[];
  /** Turns an entity id into something a person recognises, e.g. "1042-P Plumbing". */
  labelForEntity?: (entry: StatusHistoryEntry) => string | null;
  limit?: number;
}) {
  const shown = [...entries]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);

  if (shown.length === 0) {
    return (
      <p className="text-muted text-sm" style={{ margin: 0 }}>
        Nothing has happened on this property yet.
      </p>
    );
  }

  return (
    <ol className="timeline">
      {shown.map((entry, index) => {
        const subject = labelForEntity?.(entry);
        return (
          <li className={`timeline__item${index === 0 ? ' timeline__item--current' : ''}`} key={entry.id}>
            <span className="timeline__dot" />
            <div className="timeline__label">
              {subject && <span className="mono text-sm">{subject} · </span>}
              {labelFor(entry, entry.to_status)}
              {entry.from_status && (
                <span className="text-muted text-sm"> (was {labelFor(entry, entry.from_status)})</span>
              )}
            </div>
            {entry.note && <div className="timeline__meta">{entry.note}</div>}
            <div className="timeline__meta" title={dateTime(entry.created_at)}>
              {relativeTime(entry.created_at)}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
