import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Stat } from '@/components/ui/Stat';
import { ButtonLink } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/Table';
import { EmptyState } from '@/components/ui/EmptyState';
import { OpportunityStatusBadge, RequestStatusBadge } from '@/components/ui/StatusBadge';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/app/providers/AuthProvider';
import { useData } from '@/app/providers/DataProvider';
import {
  contractorById,
  isOpen,
  needsAttention,
  opportunitiesForRequest,
  requestsForAgent,
  visibleQuoteForOpportunity,
} from '@/lib/selectors';
import { tradeLabel } from '@/data/trades';
import { money, relativeTime, shortDate } from '@/lib/format';
import { quoteTotals } from '@/lib/quotes';

export function AgentDashboard() {
  const { profile } = useAuth();
  const data = useData();
  if (!profile) return null;

  const myRequests = requestsForAgent(data, profile.id);
  const myRequestIds = new Set(myRequests.map((r) => r.id));
  const myOpportunities = data.opportunities.filter((o) => myRequestIds.has(o.request_id));

  const activeProperties = myRequests.filter((r) => r.status === 'submitted' || r.status === 'in_progress');
  const awaitingAcceptance = myOpportunities.filter(
    (o) => o.status === 'offered' || o.status === 'matching' || o.status === 'awaiting_contractor',
  );
  const quotesReceived = myOpportunities.filter((o) => o.status === 'quote_submitted');
  const attention = myOpportunities.filter(needsAttention);
  const completed = myOpportunities.filter((o) => o.status === 'completed' || o.status === 'won');

  return (
    <>
      <PageHeader
        title={`Welcome back, ${profile.full_name.split(' ')[0]}`}
        description="Every property you have submitted, and exactly where each trade stands right now."
        actions={
          <ButtonLink to="/agent/requests/new" icon="plus" size="lg">
            New Repair Request
          </ButtonLink>
        }
      />

      <div className="grid grid--4" style={{ marginBottom: 'var(--sp-6)' }}>
        <Stat label="Active properties" value={activeProperties.length} tone="accent" meta={`${myRequests.length} total submitted`} />
        <Stat label="Awaiting contractor" value={awaitingAcceptance.length} tone={awaitingAcceptance.length ? 'warning' : undefined} meta="Offers out for acceptance" />
        <Stat label="Quotes received" value={quotesReceived.length} tone={quotesReceived.length ? 'success' : undefined} meta="Ready for your review" />
        <Stat label="Completed repairs" value={completed.length} meta="Across all properties" />
      </div>

      {attention.length > 0 && (
        <Card>
          <CardHeader
            title={
              <span className="row">
                <Icon name="alert" size={17} /> {attention.length} item{attention.length === 1 ? ' needs' : 's need'} attention
              </span>
            }
            subtitle="These trades have not landed with a contractor yet. AskCENLA is still working them."
          />
          <CardBody flush>
            <DataTable head={['Opportunity', 'Property', 'Trade', 'Status', '']}>
              {attention.map((o) => {
                const request = myRequests.find((r) => r.id === o.request_id)!;
                return (
                  <tr key={o.id}>
                    <td className="mono text-sm">{o.code}</td>
                    <td className="table__primary">{request.address_line1}</td>
                    <td>{tradeLabel(o.trade)}</td>
                    <td>
                      <OpportunityStatusBadge status={o.status} />
                    </td>
                    <td className="text-right">
                      <Link to={`/agent/properties/${request.id}`} className="text-sm text-semibold">
                        View property
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </DataTable>
          </CardBody>
        </Card>
      )}

      <div style={{ height: 'var(--sp-6)' }} />

      <div className="grid" style={{ gridTemplateColumns: '1fr', gap: 'var(--sp-6)' }}>
        <Card>
          <CardHeader
            title="Recent repair requests"
            subtitle="Your most recently submitted properties"
            action={
              <Link to="/agent/properties" className="text-sm text-semibold">
                View all
              </Link>
            }
          />
          <CardBody flush>
            {myRequests.length === 0 ? (
              <EmptyState
                icon="building"
                title="No repair requests yet"
                description="Submit a property once and AskCENLA will split it into separate opportunities for each trade."
                action={<ButtonLink to="/agent/requests/new" icon="plus">Create your first request</ButtonLink>}
              />
            ) : (
              <DataTable head={['Ref', 'Property', 'Trades', 'Open', 'Status', 'Submitted']}>
                {myRequests.slice(0, 6).map((r) => {
                  const opps = opportunitiesForRequest(data, r.id);
                  return (
                    <tr key={r.id}>
                      <td className="mono text-sm">#{r.reference}</td>
                      <td>
                        <Link to={`/agent/properties/${r.id}`} className="table__primary">
                          {r.address_line1}
                        </Link>
                        <div className="text-xs text-muted">
                          {r.city}, {r.state} {r.zip}
                        </div>
                      </td>
                      <td>{opps.length}</td>
                      <td>{opps.filter(isOpen).length}</td>
                      <td>
                        <RequestStatusBadge status={r.status} />
                      </td>
                      <td className="text-sm text-muted">{relativeTime(r.submitted_at)}</td>
                    </tr>
                  );
                })}
              </DataTable>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Quotes waiting on you" subtitle="Submitted by contractors and ready to review" />
          <CardBody flush>
            {quotesReceived.length === 0 ? (
              <EmptyState icon="file" title="No quotes awaiting review" description="When a contractor submits a quote it will show up here." />
            ) : (
              <DataTable head={['Opportunity', 'Property', 'Contractor', 'Amount', 'Expires', '']}>
                {quotesReceived.map((o) => {
                  const quote = visibleQuoteForOpportunity(data, o.id);
                  const request = myRequests.find((r) => r.id === o.request_id)!;
                  const contractor = contractorById(data, quote?.contractor_id ?? null);
                  return (
                    <tr key={o.id}>
                      <td>
                        <span className="mono text-sm">{o.code}</span>
                        <div className="text-xs text-muted">{tradeLabel(o.trade)}</div>
                      </td>
                      <td className="table__primary">{request.address_line1}</td>
                      <td>{contractor?.business_name ?? '—'}</td>
                      <td className="text-semibold">{quote ? money(quoteTotals(quote).total) : '—'}</td>
                      <td className="text-sm text-muted">{shortDate(quote?.expires_on)}</td>
                      <td className="text-right">
                        {quote && (
                          <Link to={`/agent/quotes/${quote.id}`} className="text-sm text-semibold">
                            Review quote
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </DataTable>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
