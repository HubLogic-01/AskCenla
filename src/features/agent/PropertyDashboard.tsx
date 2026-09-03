import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { OpportunityStatusBadge, RequestStatusBadge, UrgencyBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { AttachmentList } from '@/components/shared/AttachmentList';
import { useData } from '@/app/providers/DataProvider';
import {
  assignmentsForOpportunity,
  contractorById,
  isOpen,
  itemForOpportunity,
  opportunitiesForRequest,
  visibleQuoteForOpportunity,
} from '@/lib/selectors';
import { getTrade } from '@/data/trades';
import { TRANSACTION_TYPES } from '@/data/statuses';
import { money, phone, relativeTime, shortDate } from '@/lib/format';
import { quoteTotals } from '@/lib/quotes';
import { territoryName } from '@/data/seed';

/**
 * The property dashboard: one screen that answers "what is the repair
 * situation at this address?" for every trade at once.
 */
export function PropertyDashboard() {
  const { requestId } = useParams();
  const data = useData();

  const request = data.requests.find((r) => r.id === requestId);
  if (!request) {
    return (
      <EmptyState
        icon="building"
        title="Property not found"
        description="This request may have been removed, or you may not have access to it."
        action={<ButtonLink to="/agent/properties" variant="secondary">Back to properties</ButtonLink>}
      />
    );
  }

  const opportunities = opportunitiesForRequest(data, request.id);
  const files = data.attachments.filter((a) => a.request_id === request.id);
  const inspectionReport = files.find((f) => f.kind === 'inspection_report');

  return (
    <>
      <PageHeader
        backTo="/agent/properties"
        backLabel="All properties"
        eyebrow={`Request #${request.reference} · ${TRANSACTION_TYPES[request.transaction_type].label}`}
        title={request.address_line1}
        description={
          <span>
            {request.city}, {request.state} {request.zip}
            {request.mls_number ? ` · MLS ${request.mls_number}` : ''} · {territoryName(
              opportunities[0]?.territory_id ?? null,
            )}{' '}
            territory
          </span>
        }
        actions={<RequestStatusBadge status={request.status} />}
      />

      <div className="grid grid--4" style={{ marginBottom: 'var(--sp-6)' }}>
        <Card flat>
          <CardBody tight>
            <div className="stat__label">Trades</div>
            <div className="stat__value">{opportunities.length}</div>
          </CardBody>
        </Card>
        <Card flat>
          <CardBody tight>
            <div className="stat__label">Still open</div>
            <div className="stat__value">{opportunities.filter(isOpen).length}</div>
          </CardBody>
        </Card>
        <Card flat>
          <CardBody tight>
            <div className="stat__label">Quotes in</div>
            <div className="stat__value">
              {opportunities.filter((o) => visibleQuoteForOpportunity(data, o.id)).length}
            </div>
          </CardBody>
        </Card>
        <Card flat>
          <CardBody tight>
            <div className="stat__label">Submitted</div>
            <div className="stat__value" style={{ fontSize: 'var(--text-md)', paddingTop: 6 }}>
              {shortDate(request.submitted_at)}
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr', gap: 'var(--sp-5)' }}>
        {/* -------------------------------- Documents ------------------------ */}
        <Card>
          <CardHeader
            title="Documents"
            subtitle={
              inspectionReport
                ? 'Inspection report uploaded — shared only with contractors who accept a trade'
                : 'No inspection report attached'
            }
            action={
              <span className="lock-note">
                <Icon name="lock" size={13} /> Private storage
              </span>
            }
          />
          <CardBody>
            <AttachmentList attachments={files} />
          </CardBody>
        </Card>

        {/* ------------------------------ Trade panels ----------------------- */}
        {opportunities.map((opportunity) => {
          const trade = getTrade(opportunity.trade);
          const item = itemForOpportunity(data, opportunity);
          const contractor = contractorById(data, opportunity.contractor_id);
          const quote = visibleQuoteForOpportunity(data, opportunity.id);
          const ladder = assignmentsForOpportunity(data, opportunity.id);

          return (
            <div className="trade-panel" key={opportunity.id}>
              <div className="trade-panel__head">
                <span className="trade-chip">{trade.code}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="trade-panel__title">{trade.label.toUpperCase()}</div>
                  <div className="trade-panel__code">{opportunity.code}</div>
                </div>
                {item && <UrgencyBadge level={item.urgency} />}
                <OpportunityStatusBadge status={opportunity.status} />
              </div>

              <div className="trade-panel__body">
                <div>
                  <div className="dl__term">Scope requested</div>
                  <p style={{ marginTop: 'var(--sp-2)' }}>{item?.description}</p>
                  {item?.notes && (
                    <p className="text-sm text-muted" style={{ marginTop: 'var(--sp-3)' }}>
                      <strong>Note:</strong> {item.notes}
                    </p>
                  )}

                  <div className="dl" style={{ marginTop: 'var(--sp-5)' }}>
                    <div>
                      <div className="dl__term">Estimate deadline</div>
                      <div className="dl__value">{shortDate(item?.estimate_deadline)}</div>
                    </div>
                    <div>
                      <div className="dl__term">Contractors approached</div>
                      <div className="dl__value">{ladder.length}</div>
                    </div>
                  </div>
                </div>

                <div className="stack stack-4">
                  <Card flat>
                    <CardBody tight>
                      <div className="dl__term">Assigned contractor</div>
                      {contractor ? (
                        <>
                          <div className="dl__value" style={{ marginTop: 'var(--sp-2)' }}>
                            {contractor.business_name}
                          </div>
                          <div className="text-sm text-muted">{contractor.contact_name}</div>
                          <div className="row" style={{ marginTop: 'var(--sp-3)', gap: 'var(--sp-4)' }}>
                            <span className="row text-sm" style={{ gap: 'var(--sp-2)' }}>
                              <Icon name="phone" size={14} /> {phone(contractor.phone)}
                            </span>
                          </div>
                          <div className="text-xs text-muted" style={{ marginTop: 'var(--sp-2)' }}>
                            Accepted {relativeTime(opportunity.accepted_at)}
                          </div>
                        </>
                      ) : (
                        <div style={{ marginTop: 'var(--sp-2)' }}>
                          <Badge tone="warning" dot>
                            {opportunity.status === 'offered' ? 'Offer out — awaiting response' : 'No contractor yet'}
                          </Badge>
                          <p className="text-sm text-muted" style={{ marginTop: 'var(--sp-3)' }}>
                            {opportunity.status === 'offered'
                              ? `AskCENLA offered this trade to a contractor. Response due ${relativeTime(
                                  opportunity.offer_expires_at,
                                )}.`
                              : 'AskCENLA is expanding the search for this trade. You do not need to do anything.'}
                          </p>
                        </div>
                      )}
                    </CardBody>
                  </Card>

                  {quote && (
                    <Card flat>
                      <CardBody tight>
                        <div className="row row--between">
                          <div>
                            <div className="dl__term">Quote</div>
                            <div className="dl__value" style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>
                              {money(quoteTotals(quote).total)}
                            </div>
                            <div className="text-xs text-muted">
                              {quote.quote_number} · expires {shortDate(quote.expires_on)}
                            </div>
                          </div>
                          <Link to={`/agent/quotes/${quote.id}`} className="btn btn--secondary btn--sm">
                            View quote
                          </Link>
                        </div>
                      </CardBody>
                    </Card>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ height: 'var(--sp-6)' }} />

      <Card>
        <CardHeader title="Contact on file" subtitle="Shared with a contractor once they accept a trade" />
        <CardBody>
          <div className="dl">
            <div>
              <div className="dl__term">Agent</div>
              <div className="dl__value">{request.contact_name}</div>
            </div>
            <div>
              <div className="dl__term">Brokerage</div>
              <div className="dl__value">{request.contact_brokerage}</div>
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
        </CardBody>
      </Card>
    </>
  );
}
