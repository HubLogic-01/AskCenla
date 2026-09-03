import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Alert } from '@/components/ui/Alert';
import { UrgencyBadge } from '@/components/ui/StatusBadge';
import { getTrade } from '@/data/trades';
import { TRANSACTION_TYPES } from '@/data/statuses';
import { fileSize, phone, shortDate } from '@/lib/format';
import { territoryForZip, territoryName } from '@/data/seed';
import type { WizardState } from './types';

export function StepReview({ state, onEditStep }: { state: WizardState; onEditStep: (step: number) => void }) {
  const territory = territoryForZip(state.zip);
  // The reference number is assigned on submit; this preview shows the shape.
  const previewCodes = state.items.map((i) => getTrade(i.trade).code);

  return (
    <div className="stack stack-5">
      <Alert tone="info" title={`This will create ${state.items.length} separate opportunities`}>
        One property request, {state.items.length} independently routed job
        {state.items.length === 1 ? '' : 's'}: {previewCodes.map((c) => `####-${c}`).join(', ')}. Each is
        offered to a matching contractor in your territory automatically.
      </Alert>

      <Card>
        <CardHeader
          title="Property"
          action={
            <button className="btn btn--ghost btn--sm" onClick={() => onEditStep(1)}>
              Edit
            </button>
          }
        />
        <CardBody>
          <div className="dl">
            <div>
              <div className="dl__term">Address</div>
              <div className="dl__value">
                {state.address_line1}
                <div className="text-sm text-muted text-semibold">
                  {state.city}, {state.state} {state.zip}
                </div>
              </div>
            </div>
            <div>
              <div className="dl__term">Transaction type</div>
              <div className="dl__value">{TRANSACTION_TYPES[state.transaction_type].label}</div>
            </div>
            <div>
              <div className="dl__term">MLS number</div>
              <div className="dl__value">{state.mls_number || '—'}</div>
            </div>
            <div>
              <div className="dl__term">Service territory</div>
              <div className="dl__value">{territory ? territoryName(territory) : 'Needs sourcing'}</div>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={`Repair needs (${state.items.length})`}
          action={
            <button className="btn btn--ghost btn--sm" onClick={() => onEditStep(2)}>
              Edit
            </button>
          }
        />
        <CardBody flush>
          {state.items.map((item) => {
            const trade = getTrade(item.trade);
            return (
              <div
                key={item.trade}
                style={{ padding: 'var(--sp-5)', borderBottom: '1px solid var(--border)' }}
              >
                <div className="row" style={{ marginBottom: 'var(--sp-3)' }}>
                  <span className="trade-chip">{trade.code}</span>
                  <span className="text-semibold text-strong">{trade.label}</span>
                  <UrgencyBadge level={item.urgency} />
                  <div className="spacer" />
                  {item.estimate_deadline && (
                    <span className="text-sm text-muted">Estimate by {shortDate(item.estimate_deadline)}</span>
                  )}
                </div>
                <p className="text-sm">{item.description}</p>
                {item.notes && (
                  <p className="text-sm text-muted" style={{ marginTop: 'var(--sp-2)' }}>
                    <strong>Note:</strong> {item.notes}
                  </p>
                )}
              </div>
            );
          })}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={`Documents (${state.files.length})`}
          action={
            <button className="btn btn--ghost btn--sm" onClick={() => onEditStep(3)}>
              Edit
            </button>
          }
        />
        <CardBody>
          {state.files.length === 0 ? (
            <p className="text-muted text-sm">No documents attached.</p>
          ) : (
            <div className="stack stack-2">
              {state.files.map((f, i) => (
                <div className="row text-sm" key={i}>
                  <Icon name="file" size={15} />
                  <span className="text-semibold text-strong">{f.file_name}</span>
                  <span className="text-muted">{fileSize(f.size_bytes)}</span>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Contact information"
          action={
            <button className="btn btn--ghost btn--sm" onClick={() => onEditStep(4)}>
              Edit
            </button>
          }
        />
        <CardBody>
          <div className="dl">
            <div>
              <div className="dl__term">Agent</div>
              <div className="dl__value">{state.contact_name}</div>
            </div>
            <div>
              <div className="dl__term">Brokerage</div>
              <div className="dl__value">{state.contact_brokerage}</div>
            </div>
            <div>
              <div className="dl__term">Phone</div>
              <div className="dl__value">{phone(state.contact_phone)}</div>
            </div>
            <div>
              <div className="dl__term">Email</div>
              <div className="dl__value">{state.contact_email}</div>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
