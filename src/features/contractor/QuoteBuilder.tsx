import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card';
import { Button, ButtonLink } from '@/components/ui/Button';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { QuoteDocument } from '@/components/shared/QuoteDocument';
import { QuoteAttachments } from '@/components/shared/QuoteAttachments';
import { useAuth } from '@/app/providers/AuthProvider';
import { useAction } from '@/lib/useAction';
import { useData } from '@/app/providers/DataProvider';
import { requestForOpportunity } from '@/lib/selectors';
import { uuid } from '@/lib/ids';
import { money } from '@/lib/format';
import { quoteTotals } from '@/lib/quotes';
import type { Quote, QuoteLineItem } from '@/types/domain';

/**
 * The quote builder edits a local copy and writes through `saveQuote`, so a
 * half-finished edit never leaks into the agent's view. Only `submitQuote`
 * makes the quote visible to the agent.
 */
export function QuoteBuilder() {
  const { quoteId } = useParams();
  const { profile } = useAuth();
  const data = useData();
  const { saveQuote, submitQuote } = useData();
  const navigate = useNavigate();

  const stored = data.quotes.find((q) => q.id === quoteId);
  const [draft, setDraft] = useState<Quote | null>(stored ?? null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  useEffect(() => {
    if (stored && !draft) setDraft(stored);
  }, [stored, draft]);

  if (!stored || !draft) {
    return (
      <EmptyState
        icon="file"
        title="Quote not found"
        description="This quote may have been removed."
        action={<ButtonLink to="/contractor/quotes" variant="secondary">Back to quotes</ButtonLink>}
      />
    );
  }

  const contractor = data.contractors.find((c) => c.id === draft.contractor_id);
  const opportunity = data.opportunities.find((o) => o.id === draft.opportunity_id);
  const request = opportunity ? requestForOpportunity(data, opportunity) : undefined;
  const readOnly = draft.status !== 'draft';
  const isMine = contractor?.id === profile?.contractor_id;

  if (!isMine) {
    return (
      <EmptyState
        icon="lock"
        title="This quote belongs to another contractor"
        action={<ButtonLink to="/contractor/quotes" variant="secondary">Back to quotes</ButtonLink>}
      />
    );
  }

  const totals = quoteTotals(draft);
  const quoteFiles = data.attachments.filter((a) => a.quote_id === draft.id);

  function patch(next: Partial<Quote>) {
    setDraft((d) => (d ? { ...d, ...next } : d));
  }

  function patchItem(id: string, next: Partial<QuoteLineItem>) {
    setDraft((d) =>
      d ? { ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...next } : i)) } : d,
    );
  }

  function addItem() {
    setDraft((d) =>
      d
        ? {
            ...d,
            items: [
              ...d.items,
              { id: uuid(), quote_id: d.id, position: d.items.length, description: '', quantity: 1, unit_price: 0 },
            ],
          }
        : d,
    );
  }

  function removeItem(id: string) {
    setDraft((d) => (d ? { ...d, items: d.items.filter((i) => i.id !== id) } : d));
  }

  function save() {
    if (!draft) return;
    void run(async () => {
      await saveQuote(draft);
      setSavedAt(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
    });
  }

  // -------------------------------------------------------------- read-only
  if (readOnly) {
    return (
      <>
        <PageHeader
          backTo="/contractor/quotes"
          backLabel="My quotes"
          eyebrow={opportunity?.code}
          title={draft.quote_number}
          description="A submitted quote is locked — the agent is looking at these figures. Build a new one if the scope changes."
          actions={
            <Button variant="secondary" icon="file" onClick={() => window.print()}>
              Print / Save as PDF
            </Button>
          }
        />
        {/* Everything inside .print-area is what lands on the page. */}
        <div className="print-area">
          <QuoteDocument quote={draft} contractor={contractor} opportunity={opportunity} request={request} />
        </div>

        {quoteFiles.length > 0 && (
          <div className="no-print" style={{ marginTop: 'var(--sp-5)' }}>
            <Card>
              <CardHeader title="Attachments" />
              <CardBody>
                <QuoteAttachments quoteId={draft.id} attachments={quoteFiles} editable={false} />
              </CardBody>
            </Card>
          </div>
        )}
      </>
    );
  }

  // ---------------------------------------------------------------- builder
  return (
    <>
      <PageHeader
        backTo={opportunity ? `/contractor/opportunities/${opportunity.id}` : '/contractor/quotes'}
        backLabel="Back to opportunity"
        eyebrow={`${opportunity?.code ?? ''} · Draft`}
        title={`Quote ${draft.quote_number}`}
        description={request ? `${request.address_line1}, ${request.city}, ${request.state}` : undefined}
        actions={
          <>
            <Button variant="secondary" onClick={save} disabled={busy}>
              Save draft
            </Button>
            <Button
              icon="check"
              onClick={() => setConfirmSubmit(true)}
              disabled={draft.items.length === 0 || busy}
            >
              Submit to agent
            </Button>
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

      {savedAt && !error && (
        <div style={{ marginBottom: 'var(--sp-5)' }}>
          <Alert tone="success">Draft saved at {savedAt}. The agent cannot see it until you submit.</Alert>
        </div>
      )}

      <div className="stack stack-5">
        <Card>
          <CardHeader title="Line items" subtitle="Break the work down so the agent can compare like for like." />
          <CardBody>
            <div
              className="row text-xs text-muted text-semibold"
              style={{ marginBottom: 'var(--sp-2)', display: 'none' }}
            />
            {draft.items.map((item) => (
              <div className="line-item-grid" key={item.id}>
                <TextField
                  label="Description"
                  placeholder="Replace 40-gallon water heater, including haul-away"
                  value={item.description}
                  onChange={(e) => patchItem(item.id, { description: e.target.value })}
                />
                <TextField
                  label="Qty"
                  type="number"
                  min={0}
                  step={1}
                  value={item.quantity}
                  onChange={(e) => patchItem(item.id, { quantity: Number(e.target.value) || 0 })}
                />
                <TextField
                  label="Unit price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={item.unit_price}
                  onChange={(e) => patchItem(item.id, { unit_price: Number(e.target.value) || 0 })}
                />
                <div className="field">
                  <span className="field__label">Amount</span>
                  <div className="line-total">{money(item.quantity * item.unit_price)}</div>
                </div>
                <div className="field">
                  <span className="field__label sr-only">Remove</span>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Remove line item"
                    onClick={() => removeItem(item.id)}
                    style={{ minHeight: 44 }}
                  >
                    <Icon name="trash" size={17} />
                  </button>
                </div>
              </div>
            ))}

            <Button variant="secondary" icon="plus" size="sm" onClick={addItem}>
              Add line item
            </Button>

            <div className="divider" />

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ minWidth: 300 }}>
                <div className="quote-doc__total-row">
                  <span className="text-muted">Subtotal</span>
                  <span className="text-semibold">{money(totals.subtotal)}</span>
                </div>
                <div className="quote-doc__total-row" style={{ alignItems: 'center' }}>
                  <span className="text-muted">Tax rate (%)</span>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    step="0.01"
                    style={{ width: 110, minHeight: 38 }}
                    value={draft.tax_rate}
                    onChange={(e) => patch({ tax_rate: Number(e.target.value) || 0 })}
                    aria-label="Tax rate percent"
                  />
                </div>
                <div className="quote-doc__total-row quote-doc__total-row--grand">
                  <span>Total</span>
                  <span>{money(totals.total)}</span>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Terms" />
          <CardBody>
            <TextAreaField
              label="Notes for the agent"
              optional
              placeholder="Scheduling, warranty, what is included…"
              value={draft.notes ?? ''}
              onChange={(e) => patch({ notes: e.target.value })}
            />
            <TextAreaField
              label="Exclusions"
              optional
              placeholder="Drywall repair, painting, permit fees…"
              value={draft.exclusions ?? ''}
              onChange={(e) => patch({ exclusions: e.target.value })}
            />
            <TextField
              label="Quote expiration date"
              type="date"
              optional
              className="col-6"
              value={draft.expires_on ? draft.expires_on.slice(0, 10) : ''}
              onChange={(e) => patch({ expires_on: e.target.value ? new Date(e.target.value).toISOString() : null })}
            />
            <div className="field">
              <span className="field__label">
                Attachments <span className="field__optional">(optional)</span>
              </span>
              <QuoteAttachments quoteId={draft.id} attachments={quoteFiles} editable />
            </div>
          </CardBody>
          <CardFooter>
            <Button variant="secondary" onClick={save} disabled={busy}>
              Save draft
            </Button>
            <Button
              icon="check"
              onClick={() => setConfirmSubmit(true)}
              disabled={draft.items.length === 0 || busy}
            >
              Submit to agent
            </Button>
          </CardFooter>
        </Card>

        <div>
          <div className="row row--between" style={{ marginBottom: 'var(--sp-4)' }}>
            <h3>Preview — what the agent will see</h3>
            <Button variant="secondary" size="sm" icon="file" onClick={() => window.print()}>
              Print / Save as PDF
            </Button>
          </div>
          <div className="print-area">
            <QuoteDocument quote={draft} contractor={contractor} opportunity={opportunity} request={request} />
          </div>
        </div>
      </div>

      <Modal
        open={confirmSubmit}
        onClose={() => setConfirmSubmit(false)}
        title="Submit this quote?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmSubmit(false)}>
              Keep editing
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                void run(async () => {
                  await saveQuote(draft);
                  await submitQuote(draft.id);
                  setConfirmSubmit(false);
                  navigate('/contractor/quotes');
                });
              }}
            >
              {busy ? 'Submitting…' : 'Submit quote'}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          {request?.contact_name ?? 'The agent'} will be notified immediately and the quote total of{' '}
          <strong>{money(totals.total)}</strong> becomes visible on their property dashboard.
        </p>
      </Modal>
    </>
  );
}
