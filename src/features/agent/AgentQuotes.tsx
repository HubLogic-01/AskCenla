import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/Table';
import { EmptyState } from '@/components/ui/EmptyState';
import { QuoteStatusBadge } from '@/components/ui/StatusBadge';
import { useAuth } from '@/app/providers/AuthProvider';
import { useData } from '@/app/providers/DataProvider';
import { contractorById, requestsForAgent } from '@/lib/selectors';
import { money, shortDate } from '@/lib/format';
import { quoteTotals } from '@/lib/quotes';
import { tradeLabel } from '@/data/trades';

export function AgentQuotes() {
  const { profile } = useAuth();
  const data = useData();
  if (!profile) return null;

  const myRequests = requestsForAgent(data, profile.id);
  const myRequestIds = new Set(myRequests.map((r) => r.id));
  const myOpportunityIds = new Map(
    data.opportunities.filter((o) => myRequestIds.has(o.request_id)).map((o) => [o.id, o]),
  );

  // Agents never see contractor drafts — only quotes that were actually sent.
  const quotes = data.quotes
    .filter((q) => myOpportunityIds.has(q.opportunity_id) && q.status !== 'draft')
    .sort((a, b) => (b.submitted_at ?? '').localeCompare(a.submitted_at ?? ''));

  return (
    <>
      <PageHeader title="Quotes" description="Every quote submitted to you, across all of your properties." />

      <Card>
        <CardBody flush>
          {quotes.length === 0 ? (
            <EmptyState
              icon="file"
              title="No quotes yet"
              description="Once a contractor accepts a trade and prices the work, their quote appears here."
            />
          ) : (
            <DataTable head={['Quote', 'Property', 'Trade', 'Contractor', 'Total', 'Expires', 'Status', '']}>
              {quotes.map((q) => {
                const opportunity = myOpportunityIds.get(q.opportunity_id)!;
                const request = myRequests.find((r) => r.id === opportunity.request_id)!;
                const contractor = contractorById(data, q.contractor_id);
                return (
                  <tr key={q.id}>
                    <td className="mono text-sm">{q.quote_number}</td>
                    <td>
                      <Link to={`/agent/properties/${request.id}`} className="table__primary">
                        {request.address_line1}
                      </Link>
                      <div className="text-xs text-muted">{request.city}</div>
                    </td>
                    <td>{tradeLabel(opportunity.trade)}</td>
                    <td>{contractor?.business_name ?? '—'}</td>
                    <td className="text-semibold">{money(quoteTotals(q).total)}</td>
                    <td className="text-sm text-muted">{shortDate(q.expires_on)}</td>
                    <td>
                      <QuoteStatusBadge status={q.status} />
                    </td>
                    <td className="text-right">
                      <Link to={`/agent/quotes/${q.id}`} className="text-sm text-semibold">
                        Open
                      </Link>
                    </td>
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
