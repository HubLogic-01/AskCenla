import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Alert } from '@/components/ui/Alert';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField } from '@/components/ui/Field';
import { OpportunityStatusBadge, UrgencyBadge } from '@/components/ui/StatusBadge';
import { AttachmentList } from '@/components/shared/AttachmentList';
import { useAuth } from '@/app/providers/AuthProvider';
import { useData } from '@/app/providers/DataProvider';
import { isPendingOffer, itemForOpportunity, quotesForOpportunity, requestForOpportunity } from '@/lib/selectors';
import { getTrade } from '@/data/trades';
import { generalLocation, money, phone, relativeTime, shortDate } from '@/lib/format';
import { quoteTotals } from '@/lib/quotes';
import { territoryName } from '@/data/seed';
import type { OpportunityStatus } from '@/types/domain';

/** Statuses a contractor may set themselves once they own the job. */
const CONTRACTOR_STATUSES: OpportunityStatus[] = [
  'accepted',
  'inspection_scheduled',
  'quote_in_progress',
  'won',
  'lost',
  'completed',
];

export function OpportunityDetail() {
  const { opportunityId } = useParams();
  const { profile } = useAuth();
  const data = useData();
  const { acceptOpportunity, declineOpportunity, createDraftQuote, setOpportunityStatus } = useData();
  const navigate = useNavigate();
  const [confirmDecline, setConfirmDecline] = useState(false);

  const contractor = data.contractors.find((c) => c.id === profile?.contractor_id);
  const opportunity = data.opportunities.find((o) => o.id === opportunityId);

  if (!contractor || !opportunity) {
    return (
      <EmptyState
        icon="inbox"
        title="Opportunity not available"
        description="This opportunity is no longer offered to you. It may have been accepted by another contractor."
        action={<ButtonLink to="/contractor/opportunities" variant="secondary">Back to opportunities</ButtonLink>}
      />
    );
  }

  const offer = isPendingOffer(data, opportunity.id, contractor.id);
  const owned = opportunity.contractor_id === contractor.id;

  // Access control mirror of the RLS policy: no offer, no ownership, no access.
  if (!offer && !owned) {
    return (
      <EmptyState
        icon="lock"
        title="You do not have access to this opportunity"
        description="Contractors can only view opportunities offered to them or that they have accepted."
        action={<ButtonLink to="/contractor/opportunities" variant="secondary">Back to opportunities</ButtonLink>}
      />
    );
  }

  const request = requestForOpportunity(data, opportunity);
  const item = itemForOpportunity(data, opportunity);
  const trade = getTrade(opportunity.trade);
  const files = data.attachments.filter((a) => a.request_id === opportunity.request_id);
  const myQuotes = quotesForOpportunity(data, opportunity.id).filter((q) => q.contractor_id === contractor.id);

  return (
    <>
      <PageHeader
        backTo="/contractor/opportunities"
        backLabel="All opportunities"
        eyebrow={`${opportunity.code} · ${trade.label}`}
        title={owned && request ? request.address_line1 : `${trade.label} opportunity`}
        description={
          request
            ? owned
              ? `${request.city}, ${request.state} ${request.zip}`
              : `${generalLocation(request)} · ${territoryName(opportunity.territory_id)} territory`
            : undefined
        }
        actions={<OpportunityStatusBadge status={opportunity.status} />}
      />

      {offer && (
        <div style={{ marginBottom: 'var(--sp-5)' }}>
          <Alert tone="info" title={`Respond by ${shortDate(offer.expires_at)}`}>
            You are contractor #{offer.position + 1} in the rotation for this trade. If you decline or do
            not respond, it moves automatically to the next contractor.
          </Alert>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: '1fr', gap: 'var(--sp-5)' }}>
        <Card>
          <CardHeader
            title="Scope of work"
            subtitle={`Requested ${relativeTime(opportunity.created_at)}`}
            action={item ? <UrgencyBadge level={item.urgency} /> : undefined}
          />
          <CardBody>
            <p>{item?.description}</p>
            {item?.notes && (
              <p className="text-sm text-muted">
                <strong>Agent note:</strong> {item.notes}
              </p>
            )}
            <div className="divider" />
            <div className="dl">
              <div>
                <div className="dl__term">Estimate deadline</div>
                <div className="dl__value">{shortDate(item?.estimate_deadline)}</div>
              </div>
              <div>
                <div className="dl__term">Territory</div>
                <div className="dl__value">{territoryName(opportunity.territory_id)}</div>
              </div>
              <div>
                <div className="dl__term">Trade</div>
                <div className="dl__value">{trade.label}</div>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* ------------------- Details gated behind acceptance ---------------- */}
        <Card>
          <CardHeader
            title="Property and agent details"
            action={
              owned ? (
                <span className="lock-note">
                  <Icon name="checkCircle" size={13} /> Unlocked
                </span>
              ) : (
                <span className="masked">
                  <Icon name="lock" size={12} /> Locked
                </span>
              )
            }
          />
          <CardBody>
            {owned && request ? (
              <div className="dl">
                <div>
                  <div className="dl__term">Property address</div>
                  <div className="dl__value">
                    {request.address_line1}
                    <div className="text-sm text-muted text-semibold">
                      {request.city}, {request.state} {request.zip}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="dl__term">Agent</div>
                  <div className="dl__value">
                    {request.contact_name}
                    <div className="text-sm text-muted text-semibold">{request.contact_brokerage}</div>
                  </div>
                </div>
                <div>
                  <div className="dl__term">Phone</div>
                  <div className="dl__value">{phone(request.contact_phone)}</div>
                </div>
                <div>
                  <div className="dl__term">Email</div>
                  <div className="dl__value">{request.contact_email}</div>
                </div>
              </div>
            ) : (
              <p className="text-muted" style={{ margin: 0 }}>
                The exact address, the agent's name and contact details, and the inspection report become
                available the moment you accept this opportunity.
              </p>
            )}
          </CardBody>
        </Card>

        {owned && (
          <Card>
            <CardHeader
              title="Documents"
              subtitle="Time-limited access, granted because you accepted this trade"
            />
            <CardBody>
              <AttachmentList attachments={files} />
            </CardBody>
          </Card>
        )}

        {/* ------------------------------- Quotes ---------------------------- */}
        {owned && (
          <Card>
            <CardHeader
              title="Your quote"
              action={
                myQuotes.length === 0 ? (
                  <Button
                    size="sm"
                    icon="plus"
                    onClick={() => {
                      const quote = createDraftQuote(opportunity.id, contractor.id);
                      navigate(`/contractor/quotes/${quote.id}`);
                    }}
                  >
                    Build quote
                  </Button>
                ) : undefined
              }
            />
            <CardBody>
              {myQuotes.length === 0 ? (
                <p className="text-muted" style={{ margin: 0 }}>
                  No quote yet. Build an itemized quote and send it to the agent without leaving the platform.
                </p>
              ) : (
                <div className="stack stack-3">
                  {myQuotes.map((q) => (
                    <div className="routing-step" key={q.id}>
                      <Icon name="file" size={18} className="text-muted" />
                      <div style={{ flex: 1 }}>
                        <div className="text-semibold text-strong">{q.quote_number}</div>
                        <div className="text-xs text-muted">
                          {q.status === 'draft' ? 'Draft — not sent' : `Submitted ${relativeTime(q.submitted_at)}`}
                        </div>
                      </div>
                      <span className="text-semibold">{money(quoteTotals(q).total)}</span>
                      <Link to={`/contractor/quotes/${q.id}`} className="btn btn--secondary btn--sm">
                        {q.status === 'draft' ? 'Continue' : 'View'}
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        )}

        {owned && (
          <Card>
            <CardHeader title="Job status" subtitle="Keep the agent informed without a phone call" />
            <CardBody>
              <SelectField
                label="Current status"
                value={opportunity.status}
                onChange={(e) => setOpportunityStatus(opportunity.id, e.target.value as OpportunityStatus)}
                options={CONTRACTOR_STATUSES.map((s) => ({
                  value: s,
                  label: s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
                }))}
              />
            </CardBody>
          </Card>
        )}
      </div>

      {offer && (
        <div className="row" style={{ marginTop: 'var(--sp-6)', gap: 'var(--sp-3)' }}>
          <Button
            size="lg"
            icon="check"
            onClick={() => acceptOpportunity(opportunity.id, contractor.id)}
          >
            Accept opportunity
          </Button>
          <Button size="lg" variant="secondary" onClick={() => setConfirmDecline(true)}>
            Decline
          </Button>
        </div>
      )}

      <Modal
        open={confirmDecline}
        onClose={() => setConfirmDecline(false)}
        title="Decline this opportunity?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDecline(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                declineOpportunity(opportunity.id, contractor.id);
                setConfirmDecline(false);
                navigate('/contractor/opportunities');
              }}
            >
              Yes, decline
            </Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          {opportunity.code} will move to the next contractor in the rotation. Declining does not affect
          your membership, but frequent declines lower your position in future rotations.
        </p>
      </Modal>
    </>
  );
}
