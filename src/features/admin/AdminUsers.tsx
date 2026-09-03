import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { useData } from '@/app/providers/DataProvider';
import { profiles, brokerages } from '@/data/seed';
import { ROLE_LABEL } from '@/components/layout/navigation';
import { phone, shortDate } from '@/lib/format';

export function AdminUsers() {
  const data = useData();

  return (
    <>
      <PageHeader title="Users" description="Everyone with an account across the marketplace." />
      <Card>
        <CardBody flush>
          <DataTable head={['User', 'Role', 'Organization', 'Contact', 'Requests', 'Joined']}>
            {profiles.map((p) => {
              const brokerage = brokerages.find((b) => b.id === p.brokerage_id);
              const contractor = data.contractors.find((c) => c.id === p.contractor_id);
              const requestCount = data.requests.filter((r) => r.created_by === p.id).length;
              return (
                <tr key={p.id}>
                  <td>
                    <div className="row">
                      <Avatar name={p.full_name} size="sm" tone={p.role === 'admin' ? 'navy' : undefined} />
                      <span className="table__primary">{p.full_name}</span>
                    </div>
                  </td>
                  <td>
                    <Badge tone={p.role === 'admin' ? 'info' : 'neutral'}>{ROLE_LABEL[p.role]}</Badge>
                  </td>
                  <td className="text-sm">{brokerage?.name ?? contractor?.business_name ?? 'AskCENLA'}</td>
                  <td className="text-sm">
                    {p.email}
                    <div className="text-muted">{phone(p.phone)}</div>
                  </td>
                  <td>{p.role === 'agent' ? requestCount : '—'}</td>
                  <td className="text-sm text-muted">{shortDate(p.created_at)}</td>
                </tr>
              );
            })}
          </DataTable>
        </CardBody>
      </Card>
    </>
  );
}
