import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/app/providers/AuthProvider';
import { useData, type SubmitResult } from '@/app/providers/DataProvider';
import { brokerages } from '@/data/seed';
import { getTrade } from '@/data/trades';
import { StepProperty } from './StepProperty';
import { StepRepairNeeds } from './StepRepairNeeds';
import { StepDocuments } from './StepDocuments';
import { StepContact } from './StepContact';
import { StepReview } from './StepReview';
import { WIZARD_STEPS, validateStep, type StepErrors, type WizardState } from './types';

export function NewRequestWizard() {
  const { profile } = useAuth();
  const { submitRepairRequest } = useData();

  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<StepErrors>({});
  const [result, setResult] = useState<SubmitResult | null>(null);

  // Pre-fill contact details from the signed-in agent — one less thing to type.
  const [state, setState] = useState<WizardState>(() => ({
    address_line1: '',
    city: '',
    state: 'LA',
    zip: '',
    mls_number: '',
    transaction_type: 'buyer_side',
    items: [],
    files: [],
    contact_name: profile?.full_name ?? '',
    contact_brokerage: brokerages.find((b) => b.id === profile?.brokerage_id)?.name ?? '',
    contact_phone: profile?.phone ?? '',
    contact_email: profile?.email ?? '',
  }));

  const update = (patch: Partial<WizardState>) => setState((s) => ({ ...s, ...patch }));

  const furthestReachable = useMemo(() => {
    for (const s of [1, 2, 3, 4]) {
      if (Object.keys(validateStep(s, state)).length > 0) return s;
    }
    return 5;
  }, [state]);

  function goNext() {
    const found = validateStep(step, state);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setStep((s) => Math.min(5, s + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goBack() {
    setErrors({});
    setStep((s) => Math.max(1, s - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function onSubmit() {
    if (!profile) return;
    // Validate every step, not just the current one, before committing.
    for (const s of [1, 2, 3, 4]) {
      const found = validateStep(s, state);
      if (Object.keys(found).length > 0) {
        setErrors(found);
        setStep(s);
        return;
      }
    }
    setResult(submitRepairRequest(state, profile.id, profile.brokerage_id));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------------------------------------------------------------- success
  if (result) {
    return (
      <>
        <PageHeader
          eyebrow="Submitted"
          title={`Repair Request #${result.request.reference} created`}
          description="Each trade below has been turned into its own opportunity and routed to a matching contractor."
        />
        <Card>
          <CardHeader
            title={`${result.opportunities.length} opportunities created`}
            subtitle={`${result.request.address_line1}, ${result.request.city}, ${result.request.state} ${result.request.zip}`}
          />
          <CardBody>
            <div className="stack stack-3">
              {result.opportunities.map((o) => (
                <div className="routing-step" key={o.id}>
                  <span className="trade-chip">{getTrade(o.trade).code}</span>
                  <div style={{ flex: 1 }}>
                    <div className="text-semibold text-strong">{getTrade(o.trade).label}</div>
                    <div className="mono text-xs text-muted">{o.code}</div>
                  </div>
                  <span className="row text-sm text-muted" style={{ gap: 'var(--sp-2)' }}>
                    <Icon name={o.status === 'offered' ? 'route' : 'clock'} size={15} />
                    {o.status === 'offered'
                      ? 'Offered to first contractor'
                      : 'No match yet — AskCENLA is sourcing'}
                  </span>
                </div>
              ))}
            </div>
          </CardBody>
          <CardFooter>
            <Link to="/agent" className="btn btn--secondary">
              Back to dashboard
            </Link>
            <Link to={`/agent/properties/${result.request.id}`} className="btn btn--primary">
              Open property dashboard
            </Link>
          </CardFooter>
        </Card>
      </>
    );
  }

  // ----------------------------------------------------------------- wizard
  const current = WIZARD_STEPS[step - 1];

  return (
    <>
      <PageHeader
        backTo="/agent"
        backLabel="Cancel and return to dashboard"
        title="New Repair Request"
        description="One property, as many trades as the inspection report calls for."
      />

      <div className="wizard">
        <ol className="steps">
          {WIZARD_STEPS.map((s) => {
            const isDone = s.id < step;
            const reachable = s.id <= Math.max(step, furthestReachable);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  className={`step${s.id === step ? ' is-active' : ''}${isDone ? ' is-done' : ''}`}
                  disabled={!reachable}
                  onClick={() => reachable && setStep(s.id)}
                >
                  <span className="step__num">
                    {isDone ? <Icon name="check" size={13} strokeWidth={3} /> : s.id}
                  </span>
                  <span className="step__label">{s.label}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <div>
          <div className="wizard-progress">
            <div className="wizard-progress__bar" style={{ width: `${(step / 5) * 100}%` }} />
          </div>

          <Card>
            <CardHeader title={`Step ${step} of 5 · ${current.label}`} />
            <CardBody>
              {step === 1 && <StepProperty state={state} errors={errors} update={update} />}
              {step === 2 && <StepRepairNeeds state={state} errors={errors} update={update} />}
              {step === 3 && <StepDocuments state={state} update={update} />}
              {step === 4 && <StepContact state={state} errors={errors} update={update} />}
              {step === 5 && <StepReview state={state} onEditStep={setStep} />}
            </CardBody>
            <CardFooter>
              {step > 1 && (
                <Button variant="secondary" icon="chevronLeft" onClick={goBack}>
                  Back
                </Button>
              )}
              <div className="spacer" />
              {step < 5 ? (
                <Button iconRight="chevronRight" onClick={goNext}>
                  Continue
                </Button>
              ) : (
                <Button size="lg" icon="check" onClick={onSubmit}>
                  Submit repair request
                </Button>
              )}
            </CardFooter>
          </Card>
        </div>
      </div>
    </>
  );
}
