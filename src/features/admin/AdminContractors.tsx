import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Toggle } from '@/components/ui/Toggle';
import { Choice } from '@/components/ui/Choice';
import { SelectField } from '@/components/ui/Field';
import { MembershipBadge } from '@/components/ui/StatusBadge';
import { useData } from '@/app/providers/DataProvider';
import { TRADES, tradeLabel } from '@/data/trades';
import { territories } from '@/data/seed';
import { MEMBERSHIP_STATUSES } from '@/data/statuses';
import { phone, shortDate } from '@/lib/format';
import type { Contractor, MembershipStatus } from '@/types/domain';

type Filter = 'all' | 'pending' | 'active' | 'issues';

export function AdminContractors() {
  const data = useData();
  const { updateContractor } = useData();
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<Contractor | null>(null);

  const pending = data.contractors.filter((c) => c.membership_status === 'pending_approval');
  const active = data.contractors.filter((c) => c.membership_status === 'active' && c.is_active);
  const issues = data.contractors.filter(
    (c) =>
      c.membership_status === 'past_due' ||
      (c.insurance_expires_on && new Date(c.insurance_expires_on).getTime() - Date.now() < 30 * 86_400_000) ||
      (c.license_expires_on && new Date(c.license_expires_on).getTime() - Date.now() < 30 * 86_400_000),
  );
  const shown =
    filter === 'all' ? data.contractors : filter === 'pending' ? pending : filter === 'active' ? active : issues;

  // Keep the modal in sync with the store while the admin edits.
  const live = editing ? data.contractors.find((c) => c.id === editing.id) ?? editing : null;

  return (
    <>
      <PageHeader
        title="Contractor Management"
        description="Approve applications, manage trades and territories, and control who receives opportunities."
      />

      <Card>
        <CardBody tight>
          <Tabs<Filter>
            active={filter}
            onChange={setFilter}
            tabs={[
              { value: 'all', label: 'All', count: data.contractors.length },
              { value: 'pending', label: 'Pending approval', count: pending.length },
              { value: 'active', label: 'Active', count: active.length },
              { value: 'issues', label: 'Needs review', count: issues.length },
            ]}
          />
        </CardBody>
        <CardBody flush>
          <DataTable head={['Business', 'Trades', 'Territories', 'Membership', 'Routing', 'Performance', '']}>
            {shown.map((c) => (
              <tr key={c.id}>
                <td>
                  <span className="table__primary">{c.business_name}</span>
                  <div className="text-xs text-muted">
                    {c.contact_name} · {phone(c.phone)}
                  </div>
                </td>
                <td>
                  <div className="row row--wrap" style={{ gap: 'var(--sp-1)' }}>
                    {c.trades.slice(0, 3).map((t) => (
                      <Badge key={t}>{tradeLabel(t)}</Badge>
                    ))}
                    {c.trades.length > 3 && <span className="text-xs text-muted">+{c.trades.length - 3}</span>}
                  </div>
                </td>
                <td className="text-sm">{c.territory_ids.length}</td>
                <td>
                  <MembershipBadge status={c.membership_status} />
                </td>
                <td>
                  {c.is_active && c.accepting_opportunities && ['active', 'trial'].includes(c.membership_status) ? (
                    <Badge tone="success" dot>
                      Receiving
                    </Badge>
                  ) : (
                    <Badge tone="neutral" dot>
                      Paused
                    </Badge>
                  )}
                </td>
                <td className="text-sm">
                  <span className="text-semibold text-strong">
                    {c.stats.offers_received > 0
                      ? `${Math.round((c.stats.offers_accepted / c.stats.offers_received) * 100)}%`
                      : '—'}
                  </span>{' '}
                  <span className="text-muted">accept · {c.stats.jobs_won} won</span>
                </td>
                <td className="text-right">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(c)}>
                    Manage
                  </Button>
                </td>
              </tr>
            ))}
          </DataTable>
        </CardBody>
      </Card>

      <Modal
        open={live !== null}
        onClose={() => setEditing(null)}
        title={live?.business_name ?? ''}
        wide
        footer={
          <Button variant="secondary" onClick={() => setEditing(null)}>
            Done
          </Button>
        }
      >
        {live && (
          <div className="stack stack-5">
            <div className="dl">
              <div>
                <div className="dl__term">Contact</div>
                <div className="dl__value">{live.contact_name}</div>
              </div>
              <div>
                <div className="dl__term">Email</div>
                <div className="dl__value">{live.email}</div>
              </div>
              <div>
                <div className="dl__term">License</div>
                <div className="dl__value">
                  {live.license_number ?? '—'}
                  <div className="text-xs text-muted">Expires {shortDate(live.license_expires_on)}</div>
                </div>
              </div>
              <div>
                <div className="dl__term">Insurance</div>
                <div className="dl__value">
                  {live.insurance_carrier ?? '—'}
                  <div className="text-xs text-muted">Expires {shortDate(live.insurance_expires_on)}</div>
                </div>
              </div>
            </div>

            <div className="divider" style={{ margin: 0 }} />

            <SelectField
              label="Membership status"
              value={live.membership_status}
              onChange={(e) =>
                updateContractor(live.id, { membership_status: e.target.value as MembershipStatus })
              }
              options={Object.values(MEMBERSHIP_STATUSES).map((m) => ({ value: m.value, label: m.label }))}
              hint="Only active and trial memberships receive opportunities."
            />

            <div className="stack stack-3">
              <Toggle
                checked={live.is_active}
                label="Account active"
                onChange={(next) => updateContractor(live.id, { is_active: next })}
              />
              <Toggle
                checked={live.accepting_opportunities}
                label="Accepting opportunities"
                onChange={(next) => updateContractor(live.id, { accepting_opportunities: next })}
              />
            </div>

            <div className="field">
              <span className="field__label">Trades</span>
              <div className="choice-grid">
                {TRADES.map((t) => (
                  <Choice
                    key={t.key}
                    selected={live.trades.includes(t.key)}
                    title={t.label}
                    onToggle={() =>
                      updateContractor(live.id, {
                        trades: live.trades.includes(t.key)
                          ? live.trades.filter((x) => x !== t.key)
                          : [...live.trades, t.key],
                      })
                    }
                  />
                ))}
              </div>
            </div>

            <div className="field">
              <span className="field__label">Territories</span>
              <div className="choice-grid">
                {territories.map((t) => (
                  <Choice
                    key={t.id}
                    selected={live.territory_ids.includes(t.id)}
                    title={t.name}
                    hint={`${t.parish} Parish`}
                    onToggle={() =>
                      updateContractor(live.id, {
                        territory_ids: live.territory_ids.includes(t.id)
                          ? live.territory_ids.filter((x) => x !== t.id)
                          : [...live.territory_ids, t.id],
                      })
                    }
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
