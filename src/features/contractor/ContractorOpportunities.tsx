import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/app/providers/AuthProvider';
import { useData } from '@/app/providers/DataProvider';
import { isPendingOffer, opportunitiesForContractor } from '@/lib/selectors';
import { OpportunityCard } from './OpportunityCard';

type Filter = 'new' | 'active' | 'closed';

export function ContractorOpportunities() {
  const { profile } = useAuth();
  const data = useData();
  const [filter, setFilter] = useState<Filter>('new');

  const contractor = data.contractors.find((c) => c.id === profile?.contractor_id);
  if (!contractor) return null;

  const mine = opportunitiesForContractor(data, contractor.id);
  const pending = mine.filter((o) => isPendingOffer(data, o.id, contractor.id));
  const active = mine.filter(
    (o) => o.contractor_id === contractor.id && !['completed', 'won', 'lost', 'cancelled', 'quote_declined'].includes(o.status),
  );
  const closed = mine.filter(
    (o) => o.contractor_id === contractor.id && ['completed', 'won', 'lost', 'cancelled', 'quote_declined'].includes(o.status),
  );
  const shown = filter === 'new' ? pending : filter === 'active' ? active : closed;

  return (
    <>
      <PageHeader
        title="Opportunities"
        description="You only see opportunities offered to you. AskCENLA does not publish a shared job board."
      />

      <Card>
        <CardBody tight>
          <Tabs<Filter>
            active={filter}
            onChange={setFilter}
            tabs={[
              { value: 'new', label: 'New offers', count: pending.length },
              { value: 'active', label: 'Active', count: active.length },
              { value: 'closed', label: 'Closed', count: closed.length },
            ]}
          />
        </CardBody>
        <CardBody flush={shown.length === 0}>
          {shown.length === 0 ? (
            <EmptyState
              icon="inbox"
              title={filter === 'new' ? 'No new offers' : filter === 'active' ? 'No active jobs' : 'Nothing closed yet'}
              description={
                filter === 'new'
                  ? 'Opportunities matching your trades and territories will land here first, one at a time.'
                  : undefined
              }
            />
          ) : (
            <div className="grid grid--2">
              {shown.map((o) => (
                <OpportunityCard key={o.id} opportunity={o} contractorId={contractor.id} />
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}
