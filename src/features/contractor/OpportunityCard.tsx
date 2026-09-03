import { Link } from 'react-router-dom';
import type { Opportunity } from '@/types/domain';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { OpportunityStatusBadge, UrgencyBadge } from '@/components/ui/StatusBadge';
import { useData } from '@/app/providers/DataProvider';
import { isPendingOffer, itemForOpportunity, requestForOpportunity } from '@/lib/selectors';
import { getTrade } from '@/data/trades';
import { generalLocation, relativeTime, shortDate } from '@/lib/format';

/**
 * Pre-acceptance the card shows the trade, a GENERAL location and the scope —
 * never the street address, agent name or inspection report. Those unlock on
 * acceptance (and Row Level Security enforces the same boundary server-side).
 */
export function OpportunityCard({
  opportunity,
  contractorId,
}: {
  opportunity: Opportunity;
  contractorId: string;
}) {
  const data = useData();
  const request = requestForOpportunity(data, opportunity);
  const item = itemForOpportunity(data, opportunity);
  const trade = getTrade(opportunity.trade);
  const offer = isPendingOffer(data, opportunity.id, contractorId);
  const accepted = opportunity.contractor_id === contractorId;

  return (
    <Card interactive className="opp-card">
      <div className="opp-card__head">
        <span className="trade-chip">{trade.code}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="text-semibold text-strong">{trade.label}</div>
          <div className="mono text-xs text-muted">{opportunity.code}</div>
        </div>
        {item && <UrgencyBadge level={item.urgency} />}
      </div>

      <div className="opp-card__body">
        <div className="row" style={{ gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' }}>
          <Icon name="mapPin" size={15} className="text-muted" />
          <span className="text-sm text-semibold text-strong">
            {accepted && request ? request.address_line1 : request ? generalLocation(request) : '—'}
          </span>
        </div>
        {!accepted && (
          <div style={{ marginBottom: 'var(--sp-3)' }}>
            <span className="masked">
              <Icon name="lock" size={12} /> Full address and agent contact unlock on acceptance
            </span>
          </div>
        )}

        <p className="text-sm" style={{ marginBottom: 'var(--sp-4)' }}>
          {item?.description.slice(0, 180)}
          {(item?.description.length ?? 0) > 180 ? '…' : ''}
        </p>

        <div className="row row--wrap" style={{ gap: 'var(--sp-5)' }}>
          <div>
            <div className="dl__term">Requested</div>
            <div className="text-sm text-semibold text-strong">{relativeTime(opportunity.created_at)}</div>
          </div>
          <div>
            <div className="dl__term">Estimate by</div>
            <div className="text-sm text-semibold text-strong">{shortDate(item?.estimate_deadline)}</div>
          </div>
          <div>
            <div className="dl__term">Status</div>
            <div style={{ marginTop: 2 }}>
              <OpportunityStatusBadge status={opportunity.status} />
            </div>
          </div>
        </div>
      </div>

      <div className="opp-card__foot">
        <Link to={`/contractor/opportunities/${opportunity.id}`} className="btn btn--primary btn--sm">
          {offer ? 'Review opportunity' : 'Open'}
        </Link>
        {offer && (
          <span className="row text-xs text-muted" style={{ gap: 'var(--sp-2)' }}>
            <Icon name="clock" size={13} />
            Respond {relativeTime(offer.expires_at)}
          </span>
        )}
      </div>
    </Card>
  );
}
