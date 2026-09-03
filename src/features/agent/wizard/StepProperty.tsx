import { SelectField, TextField } from '@/components/ui/Field';
import { Choice } from '@/components/ui/Choice';
import { TRANSACTION_TYPES } from '@/data/statuses';
import { territoryForZip, territoryName } from '@/data/seed';
import { Alert } from '@/components/ui/Alert';
import type { StepErrors, WizardState } from './types';
import type { TransactionType } from '@/types/domain';

export function StepProperty({
  state,
  errors,
  update,
}: {
  state: WizardState;
  errors: StepErrors;
  update: (patch: Partial<WizardState>) => void;
}) {
  const territory = territoryForZip(state.zip);

  return (
    <>
      <div className="form-grid">
        <TextField
          label="Property address"
          placeholder="123 Main Street"
          value={state.address_line1}
          error={errors.address_line1}
          onChange={(e) => update({ address_line1: e.target.value })}
        />
        <TextField
          className="col-6"
          label="City"
          placeholder="Alexandria"
          value={state.city}
          error={errors.city}
          onChange={(e) => update({ city: e.target.value })}
        />
        <SelectField
          className="col-3"
          label="State"
          value={state.state}
          error={errors.state}
          onChange={(e) => update({ state: e.target.value })}
          options={[
            { value: 'LA', label: 'Louisiana' },
            { value: 'TX', label: 'Texas' },
            { value: 'MS', label: 'Mississippi' },
            { value: 'AR', label: 'Arkansas' },
          ]}
        />
        <TextField
          className="col-3"
          label="ZIP code"
          placeholder="71301"
          inputMode="numeric"
          maxLength={5}
          value={state.zip}
          error={errors.zip}
          hint={territory ? `${territoryName(territory)} service territory` : undefined}
          onChange={(e) => update({ zip: e.target.value.replace(/\D/g, '') })}
        />
        <TextField
          className="col-6"
          label="MLS number"
          optional
          placeholder="CEN-184402"
          value={state.mls_number}
          onChange={(e) => update({ mls_number: e.target.value })}
        />
      </div>

      {state.zip.length === 5 && !territory && (
        <div style={{ marginBottom: 'var(--sp-5)' }}>
          <Alert tone="warning" title="Outside current coverage">
            AskCENLA does not have contractors mapped to {state.zip} yet. You can still submit — the request
            will be flagged for the AskCENLA team to source contractors.
          </Alert>
        </div>
      )}

      <div className="field">
        <span className="field__label">Transaction type</span>
        <div className="choice-grid">
          {Object.values(TRANSACTION_TYPES).map((t) => (
            <Choice
              key={t.value}
              type="radio"
              selected={state.transaction_type === t.value}
              title={t.label}
              hint={t.hint}
              onToggle={() => update({ transaction_type: t.value as TransactionType })}
            />
          ))}
        </div>
      </div>
    </>
  );
}
