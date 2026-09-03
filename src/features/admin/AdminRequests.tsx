import { Fragment, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/Table';
import { TextField } from '@/components/ui/Field';
import { RequestStatusBadge, OpportunityStatusBadge } from '@/components/ui/StatusBadge';
import { useData } from '@/app/providers/DataProvider';
import { opportunitiesForRequest } from '@/lib/selectors';
import { profiles, brokerages, territoryName } from '@/data/seed';
import { tradeLabel } from '@/data/trades';
import { relativeTime } from '@/lib/format';

export function AdminRequests() {
  const data = useData();
  const [query, setQuery] = useState('');
  const [openRow, setOpenRow] = useState<string | null>(null);

  const requests = [...data.requests]
    .sort((a, b) => (b.submitted_at ?? b.created_at).localeCompare(a.submitted_at ?? a.created_at))
    .filter((r) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        r.address_line1.toLowerCase().includes(q) ||
        r.city.toLowerCase().includes(q) ||
        String(r.reference).includes(q) ||
        r.contact_name.toLowerCase().includes(q)
      );
    });

  return (
    <>
      <PageHeader
        title="Repair Requests"
        description="Every property request in the marketplace, with its generated opportunities."
      />

      <Card>
        <CardBody tight>
          <TextField
            label="Search"
            placeholder="Address, city, reference number or agent name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </CardBody>
        <CardBody flush>
          <DataTable head={['Ref', 'Property', 'Agent', 'Brokerage', 'Trades', 'Status', 'Submitted']}>
            {requests.map((r) => {
              const agent = profiles.find((p) => p.id === r.created_by);
              const brokerage = brokerages.find((b) => b.id === r.brokerage_id);
              const opps = opportunitiesForRequest(data, r.id);
              const isOpen = openRow === r.id;
              return (
                <Fragment key={r.id}>
                  <tr className="is-clickable" onClick={() => setOpenRow(isOpen ? null : r.id)}>
                    <td className="mono text-sm">#{r.reference}</td>
                    <td>
                      <span className="table__primary">{r.address_line1}</span>
                      <div className="text-xs text-muted">
                        {r.city}, {r.state} {r.zip} · {territoryName(opps[0]?.territory_id ?? null)}
                      </div>
                    </td>
                    <td>{agent?.full_name ?? r.contact_name}</td>
                    <td className="text-sm">{brokerage?.name ?? r.contact_brokerage}</td>
                    <td className="text-semibold">{opps.length}</td>
                    <td>
                      <RequestStatusBadge status={r.status} />
                    </td>
                    <td className="text-sm text-muted">{relativeTime(r.submitted_at)}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={7} style={{ background: 'var(--grey-50)' }}>
                        <div className="stack stack-2">
                          {opps.map((o) => {
                            const contractor = data.contractors.find((c) => c.id === o.contractor_id);
                            return (
                              <div className="routing-step" key={o.id}>
                                <span className="mono text-sm">{o.code}</span>
                                <span className="text-semibold text-strong" style={{ minWidth: 140 }}>
                                  {tradeLabel(o.trade)}
                                </span>
                                <span className="text-sm text-muted" style={{ flex: 1 }}>
                                  {contractor?.business_name ?? 'Unassigned'}
                                </span>
                                <OpportunityStatusBadge status={o.status} />
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </DataTable>
        </CardBody>
      </Card>
    </>
  );
}
