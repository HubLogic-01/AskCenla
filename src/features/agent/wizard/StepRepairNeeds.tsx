import { Choice } from '@/components/ui/Choice';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Alert } from '@/components/ui/Alert';
import { TRADES, getTrade } from '@/data/trades';
import { URGENCY_LEVELS } from '@/data/statuses';
import type { TradeKey, UrgencyLevel } from '@/types/domain';
import type { DraftRepairItem } from '@/app/providers/DataProvider';
import type { StepErrors, WizardState } from './types';

/**
 * Step 2 is where the multi-trade model becomes visible: pick any number of
 * trades, and each one gets its own scope, urgency and deadline. Each of these
 * becomes an independently routed opportunity at submission.
 */
export function StepRepairNeeds({
  state,
  errors,
  update,
}: {
  state: WizardState;
  errors: StepErrors;
  update: (patch: Partial<WizardState>) => void;
}) {
  const selected = new Set(state.items.map((i) => i.trade));

  function toggleTrade(trade: TradeKey) {
    if (selected.has(trade)) {
      update({ items: state.items.filter((i) => i.trade !== trade) });
    } else {
      const next: DraftRepairItem = {
        trade,
        description: '',
        urgency: 'standard',
        estimate_deadline: '',
        notes: '',
      };
      update({ items: [...state.items, next] });
    }
  }

  function patchItem(index: number, patch: Partial<DraftRepairItem>) {
    update({ items: state.items.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  }

  return (
    <>
      <div className="field">
        <span className="field__label">Which trades are needed?</span>
        <span className="field__hint" style={{ marginBottom: 'var(--sp-2)' }}>
          Select every trade in the inspection report. Each one becomes its own tracked opportunity —
          you only submit this request once.
        </span>
        <div className="choice-grid">
          {TRADES.map((trade) => (
            <Choice
              key={trade.key}
              selected={selected.has(trade.key)}
              title={trade.label}
              hint={trade.description}
              onToggle={() => toggleTrade(trade.key)}
            />
          ))}
        </div>
        {errors.items && <span className="field__error">{errors.items}</span>}
      </div>

      {state.items.length > 0 && (
        <>
          <div className="divider" />
          <div className="row row--between" style={{ marginBottom: 'var(--sp-4)' }}>
            <h3>Describe each repair</h3>
            <span className="text-sm text-muted">
              {state.items.length} trade{state.items.length === 1 ? '' : 's'} selected
            </span>
          </div>

          <div className="stack stack-5">
            {state.items.map((item, index) => {
              const trade = getTrade(item.trade);
              return (
                <div className="repair-item" key={item.trade}>
                  <div className="repair-item__head">
                    <span className="trade-chip">{trade.code}</span>
                    <div style={{ flex: 1 }}>
                      <div className="text-semibold text-strong">{trade.label}</div>
                      <div className="text-xs text-muted">Will be routed independently</div>
                    </div>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Remove ${trade.label}`}
                      onClick={() => toggleTrade(item.trade)}
                    >
                      <Icon name="trash" size={17} />
                    </button>
                  </div>
                  <div className="repair-item__body">
                    <TextAreaField
                      label="Description of repair"
                      placeholder="Paste or summarize the inspection findings for this trade…"
                      value={item.description}
                      error={errors[`item-${index}`]}
                      onChange={(e) => patchItem(index, { description: e.target.value })}
                    />
                    <div className="form-grid">
                      <SelectField
                        className="col-6"
                        label="Urgency"
                        value={item.urgency}
                        onChange={(e) => patchItem(index, { urgency: e.target.value as UrgencyLevel })}
                        options={Object.values(URGENCY_LEVELS).map((u) => ({
                          value: u.value,
                          label: `${u.label} — ${u.description}`,
                        }))}
                      />
                      <TextField
                        className="col-6"
                        label="Requested estimate deadline"
                        type="date"
                        optional
                        value={item.estimate_deadline}
                        onChange={(e) => patchItem(index, { estimate_deadline: e.target.value })}
                      />
                    </div>
                    <TextField
                      label="Notes for the contractor"
                      optional
                      placeholder="Access instructions, closing date, who to coordinate with…"
                      value={item.notes}
                      onChange={(e) => patchItem(index, { notes: e.target.value })}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {state.items.length === 0 && (
        <Alert tone="info" title="Nothing selected yet">
          Pick one or more trades above. A four-trade inspection report becomes four separate opportunities,
          each with its own contractor and status.
        </Alert>
      )}
    </>
  );
}
