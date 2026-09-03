import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Stat } from '@/components/ui/Stat';
import { DataTable } from '@/components/ui/Table';
import { EmptyState } from '@/components/ui/EmptyState';
import { OpportunityStatusBadge } from '@/components/ui/StatusBadge';
import { useAuth } from '@/app/providers/AuthProvider';
import { useData } from '@/app/providers/DataProvider';
import {
  contractorById,
  isOpen,
  itemForOpportunity,
  needsAttention,
  requestsForBrokerage,
} from '@/lib/selectors';
import { brokerages, profiles } from '@/data/seed';
import { tradeLabel } from '@/data/trades';
import { shortDate } from '@/lib/format';

export function BrokerDashboard() {
  const { profile } = useAuth();
  const data = useData();
  if (!profile?.brokerage_id) return null;

  const brokerage = brokerages.find((b) => b.id === profile.brokerage_id);
  const requests = requestsForBrokerage(data, profile.brokerage_id);
  const requestIds = new Set(requests.map((r) => r.id));
  const opportunities = data.opportunities.filter((o) => requestIds.has(o.request_id));

  const activeProperties = requests.filter((r) => r.status === 'submitted' || r.status === 'in_progress');
  const assigned = opportunities.filter((o) => o.contractor_id);
  const awaitingQuotes = opportunities.filter((o) =>
    ['accepted', 'inspection_scheduled', 'quote_in_progress'].includes(o.status),
  );
  const attention = opportunities.filter(needsAttention);

  return (
    <>
      <PageHeader
        eyebrow="Brokerage"
        title={brokerage?.name ?? 'Brokerage Overview'}
        description="Every property and repair opportunity belonging to agents in your brokerage."
      />

      <div className="grid grid--4" style={{ marginBottom: 'var(--sp-6)' }}>
        <Stat label="Active properties" value={activeProperties.length} tone="accent" meta={`${requests.length} total`} />
        <Stat label="Repair opportunities" value={opportunities.length} meta={`${opportunities.filter(isOpen).length} still open`} />
        <Stat label="Contractors assigned" value={assigned.length} tone="success" />
        <Stat
          label="Need attention"
          value={attention.length}
          tone={attention.length ? 'danger' : undefined}
          meta={`${awaitingQuotes.length} awaiting quotes`}
        />
      </div>

      <Card>
        <CardHeader
          title="All repair opportunities"
          subtitle="Across every agent in the brokerage"
          action={
            <Link to="/broker/opportunities" className="text-sm text-semibold">
              Full list
            </Link>
          }
        />
        <CardBody flush>
          {opportunities.length === 0 ? (
            <EmptyState icon="clipboard" title="No opportunities yet" />
          ) : (
            <DataTable head={['Property', 'Agent', 'Trade', 'Contractor', 'Status', 'Deadline']}>
              {opportunities.slice(0, 12).map((o) => {
                const request = requests.find((r) => r.id === o.request_id)!;
                const agent = profiles.find((p) => p.id === request.created_by);
                const contractor = contractorById(data, o.contractor_id);
                const item = itemForOpportunity(data, o);
                return (
                  <tr key={o.id}>
                    <td>
                      <span className="table__primary">{request.address_line1}</span>
                      <div className="text-xs text-muted mono">{o.code}</div>
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
