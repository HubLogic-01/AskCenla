import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/Table';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/app/providers/AuthProvider';
import { useData } from '@/app/providers/DataProvider';
import { isOpen, needsAttention } from '@/lib/selectors';
import { profiles } from '@/data/seed';
import { phone, relativeTime } from '@/lib/format';

export function BrokerAgents() {
  const { profile } = useAuth();
  const data = useData();
  if (!profile?.brokerage_id) return null;

  const agents = profiles.filter((p) => p.role === 'agent' && p.brokerage_id === profile.brokerage_id);

  return (
    <>
      <PageHeader title="Agents" description="Repair activity by agent in your brokerage." />
      <Card>
        <CardBody flush>
          <DataTable head={['Agent', 'Contact', 'Properties', 'Open items', 'Need attention', 'Last activity']}>
            {agents.map((agent) => {
              const requests = data.requests.filter((r) => r.created_by === agent.id);
              const ids = new Set(requests.map((r) => r.id));
              const opps = data.opportunities.filter((o) => ids.has(o.request_id));
              const last = requests
                .map((r) => r.updated_at)
                .sort()
                .pop();
              return (
                <tr key={agent.id}>
                  <td>
                    <div className="row">
                      <Avatar name={agent.full_name} size="sm" />
                      <span className="table__primary">{agent.full_name}</span>
                    </div>
                  </td>
                  <td className="text-sm">
                    {agent.email}
                    <div className="text-muted">{phone(agent.phone)}</div>
                  </td>
                  <td className="text-semibold">{requests.length}</td>
                  <td>{opps.filter(isOpen).length}</td>
                  <td className={opps.filter(needsAttention).length ? 'text-semibold' : 'text-muted'}>
                    {opps.filter(needsAttention).length}
                  </td>
                  <td className="text-sm text-muted">{relativeTime(last)}</td>
                </tr>
              );
            })}
          </DataTable>
        </CardBody>
      </Card>
    </>
  );
}
