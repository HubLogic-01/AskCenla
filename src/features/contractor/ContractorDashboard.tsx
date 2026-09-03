import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Stat } from '@/components/ui/Stat';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { DataTable } from '@/components/ui/Table';
import { OpportunityStatusBadge, MembershipBadge } from '@/components/ui/StatusBadge';
import { Toggle } from '@/components/ui/Toggle';
import { useAuth } from '@/app/providers/AuthProvider';
import { useData } from '@/app/providers/DataProvider';
import { isPendingOffer, isThisMonth, opportunitiesForContractor, requestForOpportunity } from '@/lib/selectors';
import { tradeLabel } from '@/data/trades';
import { generalLocation, money, relativeTime } from '@/lib/format';
import { quoteTotals } from '@/lib/quotes';
import { OpportunityCard } from './OpportunityCard';

export function ContractorDashboard() {
  const { profile } = useAuth();
  const data = useData();
  const { updateContractor } = useData();

  const contractor = data.contractors.find((c) => c.id === profile?.contractor_id);
  if (!contractor) return null;

  const mine = opportunitiesForContractor(data, contractor.id);
  const pending = mine.filter((o) => isPendingOffer(data, o.id, contractor.id));
  const accepted = mine.filter((o) => o.contractor_id === contractor.id);
  const myQuotes = data.quotes.filter((q) => q.contractor_id === contractor.id);

  const quotesDraft = myQuotes.filter((q) => q.status === 'draft');
  const quotesSubmitted = myQuotes.filter((q) => q.status === 'submitted');
  const jobsWon = accepted.filter((o) => ['quote_accepted', 'won', 'completed'].includes(o.status));
  const jobsLost = accepted.filter((o) => ['quote_declined', 'lost'].includes(o.status));
  const receivedThisMonth = data.assignments.filter(
    (a) => a.contractor_id === contractor.id && isThisMonth(a.offered_at),
  ).length;

  const membershipBlocked = !['active', 'trial'].includes(contractor.membership_status);

  return (
    <>
      <PageHeader
        title={contractor.business_name}
        description="Opportunities offered to you, and the jobs you are working."
        actions={
          <Toggle
            checked={contractor.accepting_opportunities}
            label={contractor.accepting_opportunities ? 'Accepting opportunities' : 'Paused'}
            onChange={(next) => updateContractor(contractor.id, { accepting_opportunities: next })}
          />
        }
      />

      {membershipBlocked && (
        <div style={{ marginBottom: 'var(--sp-5)' }}>
          <Alert tone="danger" title="Your membership is not active">
            New opportunities are paused until your membership is current.{' '}
            <Link to="/contractor/membership">Review membership</Link>
          </Alert>
        </div>
      )}
      {!contractor.accepting_opportunities && !membershipBlocked && (
        <div style={{ marginBottom: 'var(--sp-5)' }}>
          <Alert tone="warning" title="You are not receiving new opportunities">
            Turn the toggle above back on when you are ready for new work.
          </Alert>
        </div>
      )}

      <div className="grid grid--4" style={{ marginBottom: 'var(--sp-6)' }}>
        <Stat label="New opportunities" value={pending.length} tone={pending.length ? 'accent' : undefined} meta="Awaiting your response" />
        <Stat label="Accepted" value={accepted.filter((o) => !['completed', 'lost', 'won'].includes(o.status)).length} meta="Active jobs" />
        <Stat label="Quotes in progress" value={quotesDraft.length} meta="Drafts not yet sent" />
        <Stat label="Quotes submitted" value={quotesSubmitted.length} tone={quotesSubmitted.length ? 'success' : undefined} meta="Awaiting agent decision" />
      </div>

      <div className="grid grid--4" style={{ marginBottom: 'var(--sp-6)' }}>
        <Stat label="Jobs won" value={jobsWon.length} tone="success" />
        <Stat label="Jobs lost" value={jobsLost.length} />
        <Stat label="Received this month" value={receivedThisMonth} meta="Opportunities offered" />
        <Card flat>
          <CardBody tight>
            <div className="stat__label">Membership</div>
            <div style={{ marginTop: 'var(--sp-3)' }}>
              <MembershipBadge status={contractor.membership_status} />
            </div>
            <div className="stat__meta">$199 / month</div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="New opportunities"
          subtitle="Offered to you first. Property and agent details unlock when you accept."
          action={
            <Link to="/contractor/opportunities" className="text-sm text-semibold">
              View all
            </Link>
          }
        />
        <CardBody flush={pending.length === 0}>
          {pending.length === 0 ? (
            <EmptyState
              icon="inbox"
              title="No new opportunities right now"
              description="When a request in one of your trades and territories comes in, it will appear here first."
            />
          ) : (
            <div className="grid grid--2">
              {pending.map((o) => (
                <OpportunityCard key={o.id} opportunity={o} contractorId={contractor.id} />
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <div style={{ height: 'var(--sp-6)' }} />

      <Card>
        <CardHeader title="Your active jobs" subtitle="Opportunities you accepted" />
        <CardBody flush>
          {accepted.length === 0 ? (
            <EmptyState icon="briefcase" title="No accepted jobs yet" />
          ) : (
            <DataTable head={['Opportunity', 'Trade', 'Location', 'Status', 'Quote', 'Updated']}>
              {accepted.map((o) => {
                const request = requestForOpportunity(data, o);
                const quote = myQuotes.find((q) => q.opportunity_id === o.id);
                return (
                  <tr key={o.id}>
                    <td>
                      <Link to={`/contractor/opportunities/${o.id}`} className="mono text-sm text-semibold">
                        {o.code}
                      </Link>
                    </td>
                    <td>{tradeLabel(o.trade)}</td>
                    <td className="table__primary">
                      {request ? request.address_line1 : '—'}
                      <div className="text-xs text-muted">{request ? generalLocation(request) : ''}</div>
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
          )}
        </CardBody>
      </Card>
    </>
  );
}
