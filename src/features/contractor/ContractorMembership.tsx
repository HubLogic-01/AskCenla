import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/components/ui/Icon';
import { MembershipBadge } from '@/components/ui/StatusBadge';
import { Stat } from '@/components/ui/Stat';
import { useAuth } from '@/app/providers/AuthProvider';
import { useData } from '@/app/providers/DataProvider';
import { useAction } from '@/lib/useAction';
import { isThisMonth } from '@/lib/selectors';
import { money, shortDate } from '@/lib/format';
import type { Membership } from '@/types/domain';

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
  const { membership, billingSession, isLive } = useData();
  const { busy, error, run } = useAction();
  const [state, setState] = useState<Membership | null>(null);
  const [params, setParams] = useSearchParams();

  const contractor = data.contractors.find((c) => c.id === profile?.contractor_id);

  const load = useCallback(() => {
    membership()
      .then(setState)
      .catch(() => setState(null));
  }, [membership]);

  useEffect(load, [load, data.contractors]);

  // Stripe sends the browser back here after checkout. The webhook is what
  // actually changes the membership, and it may land a second or two later, so
  // this reloads rather than assuming success.
  const checkout = params.get('checkout');
  useEffect(() => {
    if (!checkout) return;
    const timer = setTimeout(() => {
      void data.refresh();
      load();
      setParams({}, { replace: true });
    }, 1500);
    return () => clearTimeout(timer);
  }, [checkout, data, load, setParams]);

  if (!contractor) return null;

  const offersThisMonth = data.assignments.filter(
    (a) => a.contractor_id === contractor.id && isThisMonth(a.offered_at),
  ).length;
  const acceptanceRate =
    contractor.stats.offers_received > 0
      ? Math.round((contractor.stats.offers_accepted / contractor.stats.offers_received) * 100)
      : 0;

  const fee = state?.monthly_fee ?? 199;
  const subscribed = state?.has_subscription ?? false;

  async function openBilling(mode: 'checkout' | 'portal') {
    await run(async () => {
      const url = await billingSession(mode);
      if (!url) {
        throw new Error(
          isLive
            ? 'Billing is not configured on this project yet. See the README, "Turn on billing".'
            : 'Billing needs a connected Stripe account. Connect Supabase and Stripe to subscribe.',
        );
      }
      window.location.href = url;
    });
  }

  return (
    <>
      <PageHeader
        title="Membership"
        description="Your AskCENLA Repair Network membership and performance."
        actions={<MembershipBadge status={contractor.membership_status} />}
      />

      {checkout === 'success' && (
        <div style={{ marginBottom: 'var(--sp-5)' }}>
          <Alert tone="success" title="Payment received">
            Thanks. Your membership is being activated — this page will update in a moment.
          </Alert>
        </div>
      )}
      {checkout === 'cancelled' && (
        <div style={{ marginBottom: 'var(--sp-5)' }}>
          <Alert tone="info" title="Checkout cancelled">
            Nothing was charged. You can start again whenever you are ready.
          </Alert>
        </div>
      )}
      {error && (
        <div style={{ marginBottom: 'var(--sp-5)' }}>
          <Alert tone="danger" title="Billing is unavailable">
            {error}
          </Alert>
        </div>
      )}

      {contractor.membership_status === 'past_due' && (
        <div style={{ marginBottom: 'var(--sp-5)' }}>
          <Alert tone="danger" title="New opportunities are paused">
            We could not take your last payment. Work you have already accepted is unaffected, but
            you will not receive new opportunities until it goes through.
          </Alert>
        </div>
      )}
      {contractor.membership_status === 'pending_approval' && (
        <div style={{ marginBottom: 'var(--sp-5)' }}>
          <Alert tone="info" title="Your application is being reviewed">
            AskCENLA checks licence and insurance before activating an account. You can subscribe
            now, but opportunities will not start until the review is done.
          </Alert>
        </div>
      )}

      <div className="grid grid--4" style={{ marginBottom: 'var(--sp-6)' }}>
        <Stat label="Monthly fee" value={money(fee, true)} meta="Billed monthly" />
        <Stat label="Opportunities this month" value={offersThisMonth} />
        <Stat
          label="Acceptance rate"
          value={`${acceptanceRate}%`}
          tone={acceptanceRate >= 60 ? 'success' : 'warning'}
        />
        <Stat
          label="Avg. response"
          value={`${contractor.stats.avg_response_hours.toFixed(1)}h`}
          meta="Faster responses rank higher"
        />
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
          <CardHeader
            title="Billing"
            subtitle={subscribed ? 'Managed through Stripe' : 'Not subscribed yet'}
          />
          <CardBody>
            {subscribed ? (
              <>
                <div className="dl">
                  <div>
                    <div className="dl__term">Subscription</div>
                    <div className="dl__value" style={{ textTransform: 'capitalize' }}>
                      {state?.stripe_status?.replace(/_/g, ' ') ?? '—'}
                    </div>
                  </div>
                  <div>
                    <div className="dl__term">
                      {state?.cancel_at_period_end ? 'Ends on' : 'Renews on'}
                    </div>
                    <div className="dl__value">{shortDate(state?.current_period_end)}</div>
                  </div>
                </div>

                {state?.cancel_at_period_end && (
                  <div style={{ marginTop: 'var(--sp-4)' }}>
                    <Alert tone="warning">
                      Your membership is set to end on {shortDate(state.current_period_end)}. You can
                      resume it from the billing portal.
                    </Alert>
                  </div>
                )}

                <div style={{ marginTop: 'var(--sp-5)' }}>
                  <Button variant="secondary" disabled={busy} onClick={() => void openBilling('portal')}>
                    {busy ? 'Opening…' : 'Manage billing'}
                  </Button>
                </div>
                <p className="text-sm text-muted" style={{ marginTop: 'var(--sp-4)' }}>
                  Update your card, download invoices or cancel from the Stripe billing portal.
                </p>
              </>
            ) : (
              <>
                <p style={{ margin: '0 0 var(--sp-5)' }}>
                  {money(fee, true)} per month. Cancel any time from the billing portal — your
                  membership runs to the end of the period you have paid for.
                </p>
                <Button size="lg" block disabled={busy} onClick={() => void openBilling('checkout')}>
                  {busy ? 'Opening Stripe…' : `Start membership — ${money(fee, true)}/month`}
                </Button>
                <p className="text-xs text-muted" style={{ marginTop: 'var(--sp-4)' }}>
                  Payment is handled by Stripe. AskCENLA never sees your card details.
                </p>
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
