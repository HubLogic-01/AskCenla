import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { ButtonLink } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/Table';
import { EmptyState } from '@/components/ui/EmptyState';
import { RequestStatusBadge } from '@/components/ui/StatusBadge';
import { Tabs } from '@/components/ui/Tabs';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/app/providers/AuthProvider';
import { useData } from '@/app/providers/DataProvider';
import { isOpen, opportunitiesForRequest, requestsForAgent } from '@/lib/selectors';
import { getTrade } from '@/data/trades';
import { relativeTime } from '@/lib/format';

type Filter = 'all' | 'active' | 'completed';

export function AgentProperties() {
  const { profile } = useAuth();
  const data = useData();
  const [filter, setFilter] = useState<Filter>('active');
  if (!profile) return null;

  const all = requestsForAgent(data, profile.id);
  const active = all.filter((r) => r.status === 'submitted' || r.status === 'in_progress');
  const completed = all.filter((r) => r.status === 'completed');
  const shown = filter === 'all' ? all : filter === 'active' ? active : completed;

  return (
    <>
      <PageHeader
        title="Properties"
        description="Every property repair request you have submitted."
        actions={<ButtonLink to="/agent/requests/new" icon="plus">New Repair Request</ButtonLink>}
      />

      <Card>
        <CardBody tight>
          <Tabs<Filter>
            active={filter}
            onChange={setFilter}
            tabs={[
              { value: 'active', label: 'Active', count: active.length },
              { value: 'completed', label: 'Completed', count: completed.length },
              { value: 'all', label: 'All', count: all.length },
            ]}
          />
        </CardBody>
        <CardBody flush>
          {shown.length === 0 ? (
            <EmptyState
              icon="building"
              title="Nothing here yet"
              description="Properties you submit will be listed here with a live status for every trade."
              action={<ButtonLink to="/agent/requests/new" icon="plus">Create a repair request</ButtonLink>}
            />
          ) : (
            <DataTable head={['Ref', 'Property', 'Trades', 'Open items', 'Status', 'Submitted']}>
              {shown.map((r) => {
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
                        {r.mls_number ? ` · MLS ${r.mls_number}` : ''}
                      </div>
                    </td>
                    <td>
                      <div className="row row--wrap" style={{ gap: 'var(--sp-2)' }}>
                        {opps.map((o) => (
                          <Badge key={o.id} tone="neutral">
                            {getTrade(o.trade).label}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="text-semibold">{opps.filter(isOpen).length}</td>
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
    </>
  );
}
