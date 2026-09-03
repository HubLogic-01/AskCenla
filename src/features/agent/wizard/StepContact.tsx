import { TextField } from '@/components/ui/Field';
import type { StepErrors, WizardState } from './types';

export function StepContact({
  state,
  errors,
  update,
}: {
  state: WizardState;
  errors: StepErrors;
  update: (patch: Partial<WizardState>) => void;
}) {
  return (
    <>
      <p className="text-muted" style={{ marginBottom: 'var(--sp-5)' }}>
        This is the contact a contractor receives once they accept a trade. It is not shown to
        contractors before acceptance.
      </p>
      <div className="form-grid">
        <TextField
          className="col-6"
          label="Agent name"
          value={state.contact_name}
          error={errors.contact_name}
          onChange={(e) => update({ contact_name: e.target.value })}
        />
        <TextField
          className="col-6"
          label="Brokerage"
          value={state.contact_brokerage}
          error={errors.contact_brokerage}
          onChange={(e) => update({ contact_brokerage: e.target.value })}
        />
        <TextField
          className="col-6"
          label="Phone"
          type="tel"
          placeholder="(318) 445-0112"
          value={state.contact_phone}
          error={errors.contact_phone}
          onChange={(e) => update({ contact_phone: e.target.value })}
        />
        <TextField
          className="col-6"
          label="Email"
          type="email"
          value={state.contact_email}
          error={errors.contact_email}
          onChange={(e) => update({ contact_email: e.target.value })}
        />
      </div>
    </>
  );
}
