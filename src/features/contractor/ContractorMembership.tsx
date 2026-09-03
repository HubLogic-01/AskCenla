import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/components/ui/Icon';
import { MembershipBadge } from '@/components/ui/StatusBadge';
import { Stat } from '@/components/ui/Stat';
import { useAuth } from '@/app/providers/AuthProvider';
import { useData } from '@/app/providers/DataProvider';
import { isThisMonth } from '@/lib/selectors';

const INCLUDED = [
  'Exclusive rotation slot for your trade in your territories',
  'Opportunities offered to you one at a time, never blasted to a crowd',
  'Full property and agent details the moment you accept',
  'In-platform quote builder with itemized pricing and exclusions',
  'Performance stats: acceptance rate, response time, jobs won',
];

export function ContractorMembership() {
  const { profile } = useAuth();
  const data = useData();

  const contractor = data.contractors.find((c) => c.id === profile?.contractor_id);
  if (!contractor) return null;

  const offersThisMonth = data.assignments.filter(
    (a) => a.contractor_id === contractor.id && isThisMonth(a.offered_at),
  ).length;
  const acceptanceRate =
    contractor.stats.offers_received > 0
      ? Math.round((contractor.stats.offers_accepted / contractor.stats.offers_received) * 100)
      : 0;

  return (
    <>
      <PageHeader
        title="Membership"
        description="Your AskCENLA Repair Network membership and performance."
        actions={<MembershipBadge status={contractor.membership_status} />}
      />

      <div className="grid grid--4" style={{ marginBottom: 'var(--sp-6)' }}>
        <Stat label="Monthly fee" value="$199" meta="Billed monthly" />
        <Stat label="Opportunities this month" value={offersThisMonth} />
        <Stat label="Acceptance rate" value={`${acceptanceRate}%`} tone={acceptanceRate >= 60 ? 'success' : 'warning'} />
        <Stat label="Avg. response" value={`${contractor.stats.avg_response_hours.toFixed(1)}h`} meta="Faster responses rank higher" />
      </div>

      <div className="grid grid--2">
        <Card>
          <CardHeader title="What your membership includes" />
          <CardBody>
            <ul className="price-list" style={{ margin: 0 }}>
              {INCLUDED.map((line) => (
                <li key={line}>
                  <Icon name="checkCircle" size={17} />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Billing" subtitle="Managed through Stripe" />
          <CardBody>
            <Alert tone="info" title="Coming in Phase 10">
              Stripe subscription billing is the final phase of the build. Your membership status is
              already tracked in the platform, and the matching engine already refuses to route
              opportunities to a past-due account — so switching billing on is a drop-in change.
            </Alert>
            <div style={{ marginTop: 'var(--sp-5)' }}>
              <Button variant="secondary" disabled>
                Manage payment method
              </Button>
            </div>
            <p className="text-sm text-muted" style={{ marginTop: 'var(--sp-4)' }}>
              Questions about your membership? Contact AskCENLA at admin@askcenla.com.
            </p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
