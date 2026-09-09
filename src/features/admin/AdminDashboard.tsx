import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Stat } from '@/components/ui/Stat';
import { DataTable } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { OpportunityStatusBadge } from '@/components/ui/StatusBadge';
import { useData } from '@/app/providers/DataProvider';
import type { MarketplaceMetrics } from '@/types/domain';
import { money, relativeTime } from '@/lib/format';
import { tradeLabel } from '@/data/trades';
import { territoryName } from '@/data/seed';
import { quoteTotals } from '@/lib/quotes';

export function AdminDashboard() {
  const data = useData();
  const { marketplaceMetrics } = useData();
  const [metrics, setMetrics] = useState<MarketplaceMetrics | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  // Counted in Postgres, not here. The browser used to derive all of this from
  // the whole workspace, which only worked because an admin can read every
  // row — and would mean downloading the entire marketplace to count it once
  // there are more than a few thousand.
  useEffect(() => {
    let active = true;
    marketplaceMetrics()
      .then((result) => {
        if (active) setMetrics(result);
      })
      .catch((err: unknown) => {
        if (active) setMetricsError(err instanceof Error ? err.message : 'Could not load metrics.');
      });
    // Re-read whenever the workspace changes, so an approval or a sweep is
    // reflected without a manual refresh.
  }, [marketplaceMetrics, data.contractors, data.opportunities, data.quotes]);

  // The lists below are small and already in the workspace, so they stay local.
  const unmatched = data.opportunities.filter((o) => o.status === 'awaiting_contractor');
  const pendingApproval = data.contractors.filter((c) => c.membership_status === 'pending_approval');
  const pastDue = data.contractors.filter((c) => c.membership_status === 'past_due');

  return (
    <>
      <PageHeader
        title="Marketplace Overview"
        description="The health of the network at a glance — designed so exceptions surface themselves."
      />

      {metricsError && (
        <div style={{ marginBottom: 'var(--sp-5)' }}>
          <Alert tone="danger" title="Could not load marketplace metrics">
            {metricsError}
          </Alert>
        </div>
      )}

      {(unmatched.length > 0 || pendingApproval.length > 0 || pastDue.length > 0) && (
        <div className="stack stack-3" style={{ marginBottom: 'var(--sp-6)' }}>
          {unmatched.length > 0 && (
            <Alert tone="warning" title={`${unmatched.length} unmatched opportunit${unmatched.length === 1 ? 'y' : 'ies'}`}>
              No eligible contractor was found. <Link to="/admin/routing">Open the routing monitor</Link> to see
              exactly why and recruit for the gap.
            </Alert>
          )}
          {pendingApproval.length > 0 && (
            <Alert tone="info" title={`${pendingApproval.length} contractor application awaiting review`}>
              <Link to="/admin/contractors">Review applications</Link>
            </Alert>
          )}
          {pastDue.length > 0 && (
            <Alert tone="danger" title={`${pastDue.length} contractor membership past due`}>
              Routing to these contractors is paused automatically. <Link to="/admin/contractors">View</Link>
            </Alert>
          )}
        </div>
      )}

      <div className="grid grid--4" style={{ marginBottom: 'var(--sp-5)' }}>
        <Stat label="Repair requests this month" value={metrics?.requests_this_month ?? '—'} tone="accent" />
        <Stat label="Opportunities created" value={metrics?.opportunities_this_month ?? '—'} meta="This month" />
        <Stat label="Opportunities accepted" value={metrics?.accepted_this_month ?? '—'} tone="success" meta="This month" />
        <Stat label="Quotes submitted" value={metrics?.quotes_this_month ?? '—'} meta="This month" />
      </div>

      <div className="grid grid--4" style={{ marginBottom: 'var(--sp-6)' }}>
        <Stat
          label="Unmatched opportunities"
          value={metrics?.unmatched_opportunities ?? '—'}
          tone={unmatched.length ? 'danger' : 'success'}
          meta="Need a contractor in that trade"
        />
        <Stat
          label="Avg. response time"
          value={metrics ? `${metrics.avg_response_hours.toFixed(1)}h` : '—'}
          meta="Offer to answer"
        />
        <Stat
          label="Acceptance rate"
          value={metrics ? `${metrics.acceptance_rate}%` : '—'}
          meta="Of all answered offers"
        />
        <Stat label="Jobs reported won" value={metrics?.jobs_won ?? '—'} tone="success" />
      </div>

      <div className="grid grid--2" style={{ marginBottom: 'var(--sp-6)' }}>
        <Card>
          <CardHeader title="Membership" subtitle="Recurring revenue placeholder — live once Stripe is connected" />
          <CardBody>
            <div className="grid grid--3">
              <Stat label="Active members" value={metrics?.active_members ?? '—'} tone="success" />
              <Stat
                label="Trial / pending"
                value={metrics ? metrics.trial_members + metrics.pending_members : '—'}
              />
              <Stat
                label="MRR (projected)"
                value={metrics ? money(metrics.monthly_recurring_revenue, true) : '—'}
                meta={metrics ? `${metrics.active_members} active memberships` : undefined}
                tone="accent"
              />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Coverage gaps" subtitle="Trades with no eligible contractor in a territory" />
          <CardBody flush>
            {unmatched.length === 0 ? (
              <div style={{ padding: 'var(--sp-6)' }} className="text-muted text-sm">
                Every opportunity found a contractor. No gaps to recruit for.
              </div>
            ) : (
              <DataTable head={['Opportunity', 'Trade', 'Territory', 'Waiting']}>
                {unmatched.map((o) => (
                  <tr key={o.id}>
                    <td className="mono text-sm">{o.code}</td>
                    <td className="table__primary">{tradeLabel(o.trade)}</td>
                    <td>{territoryName(o.territory_id)}</td>
                    <td className="text-sm text-muted">{relativeTime(o.created_at)}</td>
                  </tr>
                ))}
              </DataTable>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Latest activity"
          subtitle="Most recent opportunities across the whole marketplace"
          action={
            <Link to="/admin/requests" className="text-sm text-semibold">
              All requests
            </Link>
          }
        />
        <CardBody flush>
          <DataTable head={['Opportunity', 'Trade', 'Territory', 'Contractor', 'Status', 'Quote', 'Updated']}>
            {[...data.opportunities]
              .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
              .slice(0, 10)
              .map((o) => {
                const contractor = data.contractors.find((c) => c.id === o.contractor_id);
                const quote = data.quotes.find((q) => q.opportunity_id === o.id && q.status !== 'draft');
                return (
                  <tr key={o.id}>
                    <td className="mono text-sm">{o.code}</td>
                    <td className="table__primary">{tradeLabel(o.trade)}</td>
                    <td>{territoryName(o.territory_id)}</td>
                    <td>
                      {contractor?.business_name ?? <Badge tone="warning">Unassigned</Badge>}
                    </td>
                    <td>
                      <OpportunityStatusBadge status={o.status} />
                    </td>
                    <td className="text-semibold">{quote ? money(quoteTotals(quote).total) : '—'}</td>
                    <td className="text-sm text-muted">{relativeTime(o.updated_at)}</td>
                  </tr>
                );
              })}
          </DataTable>
        </CardBody>
      </Card>
    </>
  );
}
