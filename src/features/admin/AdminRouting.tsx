import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { Tabs } from '@/components/ui/Tabs';
import { OpportunityStatusBadge } from '@/components/ui/StatusBadge';
import { useData } from '@/app/providers/DataProvider';
import { useAction } from '@/lib/useAction';
import { assignmentsForOpportunity, requestForOpportunity } from '@/lib/selectors';
import { evaluateContractors, findExpiredOffers, MAX_CONTRACTORS_PER_TRADE } from '@/lib/matching';
import { tradeLabel } from '@/data/trades';
import { territoryName } from '@/data/seed';
import { relativeTime } from '@/lib/format';
import type { AssignmentOutcome } from '@/types/domain';

const OUTCOME_TONE: Record<AssignmentOutcome, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  pending: 'info',
  accepted: 'success',
  declined: 'warning',
  expired: 'danger',
  withdrawn: 'neutral',
};

type Filter = 'attention' | 'routing' | 'all';

/**
 * The routing monitor exists so the platform owner manages EXCEPTIONS instead
 * of routing every job by hand. Each unmatched opportunity explains itself:
 * the eligibility table shows precisely which rule excluded each contractor.
 */
export function AdminRouting() {
  const data = useData();
  const { rerouteOpportunity } = useData();
  const [filter, setFilter] = useState<Filter>('attention');
  const [expanded, setExpanded] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  const unmatched = data.opportunities.filter((o) => o.status === 'awaiting_contractor');
  const routing = data.opportunities.filter((o) => ['offered', 'matching'].includes(o.status));
  const expired = findExpiredOffers(data.assignments);
  const shown = filter === 'attention' ? unmatched : filter === 'routing' ? routing : [...unmatched, ...routing];

  return (
    <>
      <PageHeader
        title="Routing Monitor"
        description={`Opportunities are offered to one contractor at a time, up to ${MAX_CONTRACTORS_PER_TRADE} per trade per territory. This screen shows anything the automation could not finish on its own.`}
      />

      {error && (
        <div style={{ marginBottom: 'var(--sp-5)' }}>
          <Alert tone="danger" title="That did not work">
            {error}
          </Alert>
        </div>
      )}

      {expired.length > 0 && (
        <div style={{ marginBottom: 'var(--sp-5)' }}>
          <Alert tone="warning" title={`${expired.length} offer${expired.length === 1 ? '' : 's'} past the response window`}>
            In Phase 9 a scheduled job advances these automatically. Until then you can advance them here.
          </Alert>
        </div>
      )}

      <Card>
        <CardBody tight>
          <Tabs<Filter>
            active={filter}
            onChange={setFilter}
            tabs={[
              { value: 'attention', label: 'Needs attention', count: unmatched.length },
              { value: 'routing', label: 'Currently routing', count: routing.length },
              { value: 'all', label: 'All open', count: unmatched.length + routing.length },
            ]}
          />
        </CardBody>
      </Card>

      <div style={{ height: 'var(--sp-5)' }} />

      {shown.length === 0 ? (
        <Card>
          <CardBody flush>
            <EmptyState
              icon="checkCircle"
              title="Nothing needs you right now"
              description="Every open opportunity is with a contractor. The routing engine is handling it."
            />
          </CardBody>
        </Card>
      ) : (
        <div className="stack stack-5">
          {shown.map((opportunity) => {
            const request = requestForOpportunity(data, opportunity);
            const ladder = assignmentsForOpportunity(data, opportunity.id);
            const alreadyOffered = ladder.map((a) => a.contractor_id);
            const evaluation = evaluateContractors({
              trade: opportunity.trade,
              territoryId: opportunity.territory_id,
              contractors: data.contractors,
              excludeContractorIds: alreadyOffered,
            }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score);
            const remaining = evaluation.filter((e) => e.eligible).length;
            const isOpen = expanded === opportunity.id;

            return (
              <Card key={opportunity.id}>
                <CardHeader
                  title={
                    <span className="row">
                      <span className="mono">{opportunity.code}</span>
                      <span>{tradeLabel(opportunity.trade)}</span>
                      <OpportunityStatusBadge status={opportunity.status} />
                    </span>
                  }
                  subtitle={`${request?.address_line1 ?? 'Unknown property'} · ${territoryName(
                    opportunity.territory_id,
                  )} · created ${relativeTime(opportunity.created_at)}`}
                  action={
                    <div className="row">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setExpanded(isOpen ? null : opportunity.id)}
                      >
                        {isOpen ? 'Hide matching detail' : 'Why?'}
                      </Button>
                      <Button
                        size="sm"
                        icon="route"
                        disabled={remaining === 0 || busy}
                        onClick={() => void run(() => rerouteOpportunity(opportunity.id))}
                      >
                        {remaining === 0 ? 'No one left' : 'Offer to next'}
                      </Button>
                    </div>
                  }
                />
                <CardBody>
                  <div className="eyebrow" style={{ marginBottom: 'var(--sp-3)' }}>
                    Routing ladder
                  </div>
                  {ladder.length === 0 ? (
                    <p className="text-muted text-sm" style={{ margin: 0 }}>
                      Never offered — no eligible contractor existed when this opportunity was created.
                    </p>
                  ) : (
                    <div className="stack stack-2">
                      {ladder.map((a) => {
                        const contractor = data.contractors.find((c) => c.id === a.contractor_id);
                        return (
                          <div
                            className={`routing-step${a.outcome === 'pending' ? ' routing-step--current' : ' routing-step--past'}`}
                            key={a.id}
                          >
                            <span className="routing-step__pos">{a.position + 1}</span>
                            <div style={{ flex: 1 }}>
                              <div className="text-semibold text-strong">{contractor?.business_name ?? 'Unknown'}</div>
                              <div className="text-xs text-muted">
                                Offered {relativeTime(a.offered_at)}
                                {a.responded_at ? ` · answered ${relativeTime(a.responded_at)}` : ''}
                              </div>
                            </div>
                            <Badge tone={OUTCOME_TONE[a.outcome]} dot>
                              {a.outcome}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {isOpen && (
                    <>
                      <div className="divider" />
                      <div className="eyebrow" style={{ marginBottom: 'var(--sp-3)' }}>
                        Eligibility check — every contractor in the network
                      </div>
                      <div className="table-wrap">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Contractor</th>
                              <th>Eligible</th>
                              <th>Score</th>
                              <th>Reason excluded</th>
                            </tr>
                          </thead>
                          <tbody>
                            {evaluation.map((e) => (
                              <tr key={e.contractor.id}>
                                <td className="table__primary">{e.contractor.business_name}</td>
                                <td>
                                  {e.eligible ? (
                                    <Badge tone="success" dot>
                                      Eligible
                                    </Badge>
                                  ) : (
                                    <Badge tone="neutral">No</Badge>
                                  )}
                                </td>
                                <td className="text-semibold">{e.eligible ? Math.round(e.score) : '—'}</td>
                                <td className="text-sm text-muted">{e.reasons.join(' · ') || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {remaining === 0 && (
                        <div style={{ marginTop: 'var(--sp-4)' }}>
                          <Alert tone="danger" title="Coverage gap">
                            <span className="row" style={{ gap: 'var(--sp-2)' }}>
                              <Icon name="alert" size={15} />
                              No eligible contractor remains for {tradeLabel(opportunity.trade)} in{' '}
                              {territoryName(opportunity.territory_id)}. Recruiting here would unblock this
                              request and every future one like it.
                            </span>
                          </Alert>
                        </div>
                      )}
                    </>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
