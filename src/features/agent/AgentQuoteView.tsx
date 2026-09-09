import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { QuoteDocument } from '@/components/shared/QuoteDocument';
import { QuoteAttachments } from '@/components/shared/QuoteAttachments';
import { useData } from '@/app/providers/DataProvider';
import { useAction } from '@/lib/useAction';
import { contractorById } from '@/lib/selectors';
import { isExpired, quoteTotals } from '@/lib/quotes';
import { money, shortDate } from '@/lib/format';

export function AgentQuoteView() {
  const { quoteId } = useParams();
  const data = useData();
  const { decideQuote } = useData();
  const [confirming, setConfirming] = useState<'accepted' | 'declined' | null>(null);
  const { busy, error, run } = useAction();

  const quote = data.quotes.find((q) => q.id === quoteId);
  if (!quote) {
    return (
      <EmptyState
        icon="file"
        title="Quote not found"
        description="This quote may have been withdrawn by the contractor."
        action={<ButtonLink to="/agent/quotes" variant="secondary">Back to quotes</ButtonLink>}
      />
    );
  }

  const opportunity = data.opportunities.find((o) => o.id === quote.opportunity_id);
  const request = data.requests.find((r) => r.id === opportunity?.request_id);
  const contractor = contractorById(data, quote.contractor_id);
  const decidable = quote.status === 'submitted' && !isExpired(quote);
  const quoteFiles = data.attachments.filter((a) => a.quote_id === quote.id);

  return (
    <>
      <PageHeader
        backTo={request ? `/agent/properties/${request.id}` : '/agent/quotes'}
        backLabel={request ? `Back to ${request.address_line1}` : 'Back to quotes'}
        eyebrow={opportunity?.code}
        title={`Quote from ${contractor?.business_name ?? 'contractor'}`}
        description={`Total ${money(quoteTotals(quote).total)} · valid until ${shortDate(quote.expires_on)}`}
        actions={
          <>
            <Button variant="secondary" icon="file" onClick={() => window.print()}>
              Print / Save as PDF
            </Button>
            {decidable && (
              <>
                <Button variant="secondary" disabled={busy} onClick={() => setConfirming('declined')}>
                  Decline
                </Button>
                <Button
                  variant="success"
                  icon="check"
                  disabled={busy}
                  onClick={() => setConfirming('accepted')}
                >
                  Accept quote
                </Button>
              </>
            )}
          </>
        }
      />

      {error && (
        <div style={{ marginBottom: 'var(--sp-5)' }}>
          <Alert tone="danger" title="That did not work">
            {error}
          </Alert>
        </div>
      )}

      {quote.status === 'accepted' && (
        <div style={{ marginBottom: 'var(--sp-5)' }}>
          <Alert tone="success" title="You accepted this quote">
            {contractor?.business_name} has been notified. Scheduling, contracts and payment are handled
            directly between you and the contractor — AskCENLA does not process construction payments.
          </Alert>
        </div>
      )}
      {quote.status === 'declined' && (
        <div style={{ marginBottom: 'var(--sp-5)' }}>
          <Alert tone="warning" title="You declined this quote">
            The contractor has been notified. You can ask AskCENLA to route this trade to another contractor.
          </Alert>
        </div>
      )}
      {isExpired(quote) && (
        <div style={{ marginBottom: 'var(--sp-5)' }}>
          <Alert tone="warning" title="This quote has expired">
            The expiration date has passed. Contact the contractor if you would like it refreshed.
          </Alert>
        </div>
      )}

      {/* Only this region reaches the printed page. */}
      <div className="print-area">
        <QuoteDocument quote={quote} contractor={contractor} opportunity={opportunity} request={request} />
      </div>

      <div className="no-print">
        {quoteFiles.length > 0 && (
          <>
            <div style={{ height: 'var(--sp-5)' }} />
            <Card>
              <CardHeader
                title="Attachments"
                subtitle={`Supplied by ${contractor?.business_name ?? 'the contractor'}`}
              />
              <CardBody>
                <QuoteAttachments quoteId={quote.id} attachments={quoteFiles} editable={false} />
              </CardBody>
            </Card>
          </>
        )}

        <div style={{ height: 'var(--sp-5)' }} />

        <Card flat>
          <CardBody>
            <p className="text-sm text-muted" style={{ margin: 0 }}>
              AskCENLA connects you with the contractor and tracks the status of the work. The repair
              contract and payment are between you (or your client) and {contractor?.business_name ?? 'the contractor'}.
            </p>
          </CardBody>
        </Card>
      </div>

      <Modal
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title={confirming === 'accepted' ? 'Accept this quote?' : 'Decline this quote?'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              variant={confirming === 'accepted' ? 'success' : 'danger'}
              disabled={busy}
              onClick={() => {
                const decision = confirming;
                if (!decision) return;
                void run(async () => {
                  await decideQuote(quote.id, decision);
                  setConfirming(null);
                });
              }}
            >
              {confirming === 'accepted' ? 'Yes, accept quote' : 'Yes, decline quote'}
            </Button>
          </>
        }
      >
        {confirming === 'accepted' ? (
          <p style={{ margin: 0 }}>
            {contractor?.business_name} will be notified that you accepted {quote.quote_number} for{' '}
            <strong>{money(quoteTotals(quote).total)}</strong>. You will arrange scheduling and payment
            directly with them.
          </p>
        ) : (
          <p style={{ margin: 0 }}>
            {contractor?.business_name} will be notified. This trade can then be re-routed to another
            contractor in the network.
          </p>
        )}
      </Modal>
    </>
  );
}
