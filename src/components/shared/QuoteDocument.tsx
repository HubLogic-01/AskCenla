import type { Contractor, Opportunity, Quote, RepairRequest } from '@/types/domain';
import { money, shortDate } from '@/lib/format';
import { quoteTotals } from '@/lib/quotes';
import { tradeLabel } from '@/data/trades';
import { QuoteStatusBadge } from '@/components/ui/StatusBadge';

/**
 * The quote as a document. Shared by the contractor's preview and the agent's
 * read-only view so both sides always see the identical figures and layout —
 * and so the eventual PDF export (Phase 6+) has a single template to render.
 */
export function QuoteDocument({
  quote,
  contractor,
  opportunity,
  request,
  showAgentContact = true,
}: {
  quote: Quote;
  contractor?: Contractor;
  opportunity?: Opportunity;
  request?: RepairRequest;
  showAgentContact?: boolean;
}) {
  const totals = quoteTotals(quote);

  return (
    <div className="quote-doc">
      <div className="quote-doc__head">
        <div>
          <div className="eyebrow">Quote</div>
          <h2 style={{ marginTop: 'var(--sp-2)' }}>{quote.quote_number}</h2>
          <div className="row" style={{ marginTop: 'var(--sp-3)' }}>
            <QuoteStatusBadge status={quote.status} />
            {opportunity && <span className="mono text-muted text-sm">{opportunity.code}</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="text-semibold text-strong">{contractor?.business_name ?? 'Contractor'}</div>
          {contractor && (
            <div className="text-sm text-muted" style={{ marginTop: 2 }}>
              {contractor.contact_name}
              <br />
              {contractor.address_line1}
              <br />
              {contractor.city}, {contractor.state} {contractor.zip}
              <br />
              {contractor.email}
            </div>
          )}
        </div>
      </div>

      <div className="card__body">
        <div className="dl" style={{ marginBottom: 'var(--sp-6)' }}>
          <div>
            <div className="dl__term">Property</div>
            <div className="dl__value">
              {request ? `${request.address_line1}, ${request.city}, ${request.state} ${request.zip}` : '—'}
            </div>
          </div>
          {showAgentContact && request && (
            <div>
              <div className="dl__term">Prepared for</div>
              <div className="dl__value">
                {request.contact_name}
                <div className="text-sm text-muted text-semibold">{request.contact_brokerage}</div>
              </div>
            </div>
          )}
          <div>
            <div className="dl__term">Trade</div>
            <div className="dl__value">{opportunity ? tradeLabel(opportunity.trade) : '—'}</div>
          </div>
          <div>
            <div className="dl__term">Valid until</div>
            <div className="dl__value">{shortDate(quote.expires_on)}</div>
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Description</th>
                <th style={{ width: 80 }}>Qty</th>
                <th style={{ width: 120, textAlign: 'right' }}>Unit price</th>
                <th style={{ width: 130, textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {quote.items.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-muted">
                    No line items yet.
                  </td>
                </tr>
              )}
              {quote.items.map((item) => (
                <tr key={item.id}>
                  <td className="table__primary">{item.description || <span className="text-muted">Untitled line item</span>}</td>
                  <td>{item.quantity}</td>
                  <td className="table__num">{money(item.unit_price)}</td>
                  <td className="table__num text-semibold">{money(item.quantity * item.unit_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--sp-5)' }}>
          <div style={{ minWidth: 280 }}>
            <div className="quote-doc__total-row">
              <span className="text-muted">Subtotal</span>
              <span className="text-semibold">{money(totals.subtotal)}</span>
            </div>
            {quote.tax_rate > 0 && (
              <div className="quote-doc__total-row">
                <span className="text-muted">Tax ({quote.tax_rate}%)</span>
                <span className="text-semibold">{money(totals.tax)}</span>
              </div>
            )}
            <div className="quote-doc__total-row quote-doc__total-row--grand">
              <span>Total</span>
              <span>{money(totals.total)}</span>
            </div>
          </div>
        </div>

        {(quote.notes || quote.exclusions) && <div className="divider" />}

        {quote.notes && (
          <div style={{ marginBottom: 'var(--sp-5)' }}>
            <div className="dl__term">Notes</div>
            <p style={{ marginTop: 'var(--sp-2)' }}>{quote.notes}</p>
          </div>
        )}
        {quote.exclusions && (
          <div>
            <div className="dl__term">Exclusions</div>
            <p style={{ marginTop: 'var(--sp-2)' }}>{quote.exclusions}</p>
          </div>
        )}

        {/*
          Print only. A quote gets forwarded to buyers, sellers and lenders, so
          the paper copy should say what it is and where it came from without
          cluttering the on-screen view.
        */}
        <div className="quote-doc__print-footer">
          {quote.quote_number}
          {request ? ` · ${request.address_line1}, ${request.city}, ${request.state}` : ''} ·
          Prepared through AskCENLA Repair Network
        </div>
      </div>
    </div>
  );
}
