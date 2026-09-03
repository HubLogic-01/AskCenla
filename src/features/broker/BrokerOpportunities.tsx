import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { OpportunityStatusBadge } from '@/components/ui/StatusBadge';
import { useAuth } from '@/app/providers/AuthProvider';
import { useData } from '@/app/providers/DataProvider';
import { contractorById, isOpen, itemForOpportunity, needsAttention, requestsForBrokerage } from '@/lib/selectors';
import { profiles } from '@/data/seed';
import { tradeLabel } from '@/data/trades';
import { shortDate } from '@/lib/format';

type Filter = 'open' | 'attention' | 'all';

export function BrokerOpportunities() {
  const { profile } = useAuth();
  const data = useData();
  const [filter, setFilter] = useState<Filter>('open');
  if (!profile?.brokerage_id) return null;

  const requests = requestsForBrokerage(data, profile.brokerage_id);
  const requestIds = new Set(requests.map((r) => r.id));
  const all = data.opportunities.filter((o) => requestIds.has(o.request_id));
  const open = all.filter(isOpen);
  const attention = all.filter(needsAttention);
  const shown = filter === 'open' ? open : filter === 'attention' ? attention : all;

  return (
    <>
      <PageHeader
        title="All Opportunities"
        description="Every trade across every property in your brokerage, in one table."
      />
      <Card>
        <CardBody tight>
          <Tabs<Filter>
            active={filter}
            onChange={setFilter}
            tabs={[
              { value: 'open', label: 'Open', count: open.length },
              { value: 'attention', label: 'Need attention', count: attention.length },
              { value: 'all', label: 'All', count: all.length },
            ]}
          />
        </CardBody>
        <CardBody flush>
          {shown.length === 0 ? (
            <EmptyState icon="clipboard" title="Nothing in this view" />
          ) : (
            <DataTable head={['Opportunity', 'Property', 'Agent', 'Trade', 'Contractor', 'Status', 'Deadline']}>
              {shown.map((o) => {
                const request = requests.find((r) => r.id === o.request_id)!;
                const agent = profiles.find((p) => p.id === request.created_by);
                const contractor = contractorById(data, o.contractor_id);
                const item = itemForOpportunity(data, o);
                return (
                  <tr key={o.id}>
                    <td className="mono text-sm">{o.code}</td>
                    <td>
                      <span className="table__primary">{request.address_line1}</span>
                      <div className="text-xs text-muted">
                        {request.city}, {request.state}
                      </div>
                    </td>
                    <td>{agent?.full_name ?? '—'}</td>
                    <td>{tradeLabel(o.trade)}</td>
                    <td>{contractor?.business_name ?? <span className="text-muted">Unassigned</span>}</td>
                    <td>
                      <OpportunityStatusBadge status={o.status} />
                    </td>
                    <td className="text-sm text-muted">{shortDate(item?.estimate_deadline)}</td>
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
