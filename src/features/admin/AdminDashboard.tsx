import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Stat } from '@/components/ui/Stat';
import { DataTable } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { OpportunityStatusBadge } from '@/components/ui/StatusBadge';
import { useData } from '@/app/providers/DataProvider';
import { isThisMonth } from '@/lib/selectors';
import { money, relativeTime } from '@/lib/format';
import { tradeLabel } from '@/data/trades';
import { territoryName } from '@/data/seed';
import { quoteTotals } from '@/lib/quotes';

const MEMBERSHIP_FEE = 199;

export function AdminDashboard() {
  const data = useData();

  const requestsThisMonth = data.requests.filter((r) => isThisMonth(r.submitted_at));
  const opportunitiesThisMonth = data.opportunities.filter((o) => isThisMonth(o.created_at));
  const acceptedThisMonth = data.assignments.filter(
    (a) => a.outcome === 'accepted' && isThisMonth(a.responded_at),
  );
  const quotesThisMonth = data.quotes.filter((q) => isThisMonth(q.submitted_at));
  const unmatched = data.opportunities.filter((o) => o.status === 'awaiting_contractor');

  const responded = data.assignments.filter((a) => a.responded_at);
  const avgResponseHours =
    responded.length > 0
      ? responded.reduce(
          (sum, a) => sum + (new Date(a.responded_at!).getTime() - new Date(a.offered_at).getTime()) / 3_600_000,
          0,
        ) / responded.length
      : 0;

  const offers = data.assignments.filter((a) => a.outcome !== 'pending');
  const acceptanceRate =
    offers.length > 0
      ? Math.round((offers.filter((a) => a.outcome === 'accepted').length / offers.length) * 100)
      : 0;

  const jobsWon = data.opportunities.filter((o) => ['won', 'quote_accepted', 'completed'].includes(o.status));
  const payingMembers = data.contractors.filter((c) => c.membership_status === 'active');
  const pendingApproval = data.contractors.filter((c) => c.membership_status === 'pending_approval');
  const pastDue = data.contractors.filter((c) => c.membership_status === 'past_due');

  return (
    <>
      <PageHeader
        title="Marketplace Overview"
        description="The health of the network at a glance — designed so exceptions surface themselves."
      />

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
        <Stat label="Repair requests this month" value={requestsThisMonth.length} tone="accent" />
        <Stat label="Opportunities created" value={opportunitiesThisMonth.length} meta="This month" />
        <Stat label="Opportunities accepted" value={acceptedThisMonth.length} tone="success" meta="This month" />
        <Stat label="Quotes submitted" value={quotesThisMonth.length} meta="This month" />
      </div>

      <div className="grid grid--4" style={{ marginBottom: 'var(--sp-6)' }}>
        <Stat
          label="Unmatched opportunities"
          value={unmatched.length}
          tone={unmatched.length ? 'danger' : 'success'}
          meta="Need a contractor in that trade"
        />
        <Stat label="Avg. response time" value={`${avgResponseHours.toFixed(1)}h`} meta="Offer to answer" />
        <Stat label="Acceptance rate" value={`${acceptanceRate}%`} meta="Of all answered offers" />
        <Stat label="Jobs reported won" value={jobsWon.length} tone="success" />
      </div>

      <div className="grid grid--2" style={{ marginBottom: 'var(--sp-6)' }}>
        <Card>
          <CardHeader title="Membership" subtitle="Recurring revenue placeholder — live once Stripe is connected" />
          <CardBody>
            <div className="grid grid--3">
              <Stat label="Active members" value={payingMembers.length} tone="success" />
              <Stat label="Trial / pending" value={data.contractors.filter((c) => ['trial', 'pending_approval'].includes(c.membership_status)).length} />
              <Stat
                label="MRR (projected)"
                value={money(payingMembers.length * MEMBERSHIP_FEE, true)}
                meta={`${payingMembers.length} × $${MEMBERSHIP_FEE}`}
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
