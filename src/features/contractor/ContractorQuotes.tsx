import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/Table';
import { EmptyState } from '@/components/ui/EmptyState';
import { QuoteStatusBadge } from '@/components/ui/StatusBadge';
import { useAuth } from '@/app/providers/AuthProvider';
import { useData } from '@/app/providers/DataProvider';
import { generalLocation, money, relativeTime, shortDate } from '@/lib/format';
import { quoteTotals } from '@/lib/quotes';
import { tradeLabel } from '@/data/trades';

export function ContractorQuotes() {
  const { profile } = useAuth();
  const data = useData();

  const contractor = data.contractors.find((c) => c.id === profile?.contractor_id);
  if (!contractor) return null;

  const quotes = data.quotes
    .filter((q) => q.contractor_id === contractor.id)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  return (
    <>
      <PageHeader title="My Quotes" description="Drafts, submitted quotes and their outcomes." />
      <Card>
        <CardBody flush>
          {quotes.length === 0 ? (
            <EmptyState
              icon="file"
              title="No quotes yet"
              description="Accept an opportunity, then build a quote from the opportunity screen."
            />
          ) : (
            <DataTable head={['Quote', 'Opportunity', 'Trade', 'Location', 'Total', 'Status', 'Updated', '']}>
              {quotes.map((q) => {
                const opportunity = data.opportunities.find((o) => o.id === q.opportunity_id);
                const request = data.requests.find((r) => r.id === opportunity?.request_id);
                return (
                  <tr key={q.id}>
                    <td className="mono text-sm">{q.quote_number}</td>
                    <td className="mono text-sm">{opportunity?.code ?? '—'}</td>
                    <td>{opportunity ? tradeLabel(opportunity.trade) : '—'}</td>
                    <td className="table__primary">
                      {request
                        ? opportunity?.contractor_id === contractor.id
                          ? request.address_line1
                          : generalLocation(request)
                        : '—'}
                    </td>
                    <td className="text-semibold">{money(quoteTotals(q).total)}</td>
                    <td>
                      <QuoteStatusBadge status={q.status} />
                    </td>
                    <td className="text-sm text-muted">
                      {q.status === 'draft' ? relativeTime(q.updated_at) : shortDate(q.submitted_at)}
                    </td>
                    <td className="text-right">
                      <Link to={`/contractor/quotes/${q.id}`} className="text-sm text-semibold">
                        {q.status === 'draft' ? 'Continue' : 'View'}
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
