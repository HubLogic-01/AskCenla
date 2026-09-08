import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { Choice } from '@/components/ui/Choice';
import { Toggle } from '@/components/ui/Toggle';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { useAuth } from '@/app/providers/AuthProvider';
import { useData } from '@/app/providers/DataProvider';
import { useAction } from '@/lib/useAction';
import { TRADES } from '@/data/trades';
import { territories } from '@/data/seed';
import { shortDate } from '@/lib/format';
import type { AvailabilityStatus, Contractor } from '@/types/domain';

interface EditableFields {
  business_name: string;
  contact_name: string;
  email: string;
  phone: string;
  address_line1: string;
  city: string;
  state: string;
  zip: string;
  license_number: string;
  insurance_carrier: string;
}

function contractorFields(c: Contractor | undefined): EditableFields {
  return {
    business_name: c?.business_name ?? '',
    contact_name: c?.contact_name ?? '',
    email: c?.email ?? '',
    phone: c?.phone ?? '',
    address_line1: c?.address_line1 ?? '',
    city: c?.city ?? '',
    state: c?.state ?? '',
    zip: c?.zip ?? '',
    license_number: c?.license_number ?? '',
    insurance_carrier: c?.insurance_carrier ?? '',
  };
}

const AVAILABILITY: { value: AvailabilityStatus; label: string; hint: string }[] = [
  { value: 'available', label: 'Available', hint: 'Taking new work now' },
  { value: 'limited', label: 'Limited', hint: 'Booked out, still quoting' },
  { value: 'unavailable', label: 'Unavailable', hint: 'Pause all new opportunities' },
];

export function ContractorProfile() {
  const { profile } = useAuth();
  const data = useData();
  const { updateContractor } = useData();

  const contractor = data.contractors.find((c) => c.id === profile?.contractor_id);
  const { busy, error, run } = useAction();

  /**
   * Text fields edit a local draft and commit on Save, rather than writing on
   * every keystroke. Against a real database the per-keystroke version was a
   * request (and a workspace reload) per character typed.
   */
  const [draft, setDraft] = useState(() => contractorFields(contractor));
  useEffect(() => {
    setDraft(contractorFields(contractor));
  }, [contractor]);

  if (!contractor) return null;

  const dirty = JSON.stringify(draft) !== JSON.stringify(contractorFields(contractor));
  const patch = (next: Partial<EditableFields>) => setDraft((d) => ({ ...d, ...next }));

  const toggleTrade = (key: (typeof TRADES)[number]['key']) => {
    if (!contractor) return;
    const next = contractor.trades.includes(key)
      ? contractor.trades.filter((t) => t !== key)
      : [...contractor.trades, key];
    void run(() => updateContractor(contractor.id, { trades: next }));
  };

  const toggleTerritory = (id: string) => {
    if (!contractor) return;
    const next = contractor.territory_ids.includes(id)
      ? contractor.territory_ids.filter((t) => t !== id)
      : [...contractor.territory_ids, id];
    void run(() => updateContractor(contractor.id, { territory_ids: next }));
  };

  return (
    <>
      <PageHeader
        title="Business Profile"
        description="Trades and territories decide which opportunities reach you. Keep them accurate."
      />

      {error && (
        <div style={{ marginBottom: 'var(--sp-5)' }}>
          <Alert tone="danger" title="That did not work">
            {error}
          </Alert>
        </div>
      )}

      <div className="stack stack-5">
        <Card>
          <CardHeader title="Business information" />
          <CardBody>
            <div className="form-grid">
              <TextField
                className="col-6"
                label="Business name"
                value={draft.business_name}
                onChange={(e) => patch({ business_name: e.target.value })}
              />
              <TextField
                className="col-6"
                label="Contact name"
                value={draft.contact_name}
                onChange={(e) => patch({ contact_name: e.target.value })}
              />
              <TextField
                className="col-6"
                label="Email"
                type="email"
                value={draft.email}
                onChange={(e) => patch({ email: e.target.value })}
              />
              <TextField
                className="col-6"
                label="Phone"
                type="tel"
                value={draft.phone}
                onChange={(e) => patch({ phone: e.target.value })}
              />
              <TextField
                label="Business address"
                value={draft.address_line1}
                onChange={(e) => patch({ address_line1: e.target.value })}
              />
              <TextField
                className="col-6"
                label="City"
                value={draft.city}
                onChange={(e) => patch({ city: e.target.value })}
              />
              <TextField
                className="col-3"
                label="State"
                value={draft.state}
                onChange={(e) => patch({ state: e.target.value })}
              />
              <TextField
                className="col-3"
                label="ZIP"
                value={draft.zip}
                onChange={(e) => patch({ zip: e.target.value })}
              />
            </div>
          </CardBody>
          <CardFooter>
            {dirty && <span className="text-sm text-muted">Unsaved changes</span>}
            <Button
              disabled={!dirty || busy}
              onClick={() => void run(() => updateContractor(contractor.id, draft))}
            >
              {busy ? 'Saving…' : 'Save changes'}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader title="Trades" subtitle="You will only be offered opportunities in these trades." />
          <CardBody>
            <div className="choice-grid">
              {TRADES.map((t) => (
                <Choice
                  key={t.key}
                  selected={contractor.trades.includes(t.key)}
                  title={t.label}
                  onToggle={() => toggleTrade(t.key)}
                />
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Service territories" subtitle="Opportunities are matched by the property's ZIP code." />
          <CardBody>
            <div className="choice-grid">
              {territories.map((t) => (
                <Choice
                  key={t.id}
                  selected={contractor.territory_ids.includes(t.id)}
                  title={t.name}
                  hint={`${t.parish} Parish · ${t.zip_codes.join(', ')}`}
                  onToggle={() => toggleTerritory(t.id)}
                />
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Availability" />
          <CardBody>
            <div className="choice-grid" style={{ marginBottom: 'var(--sp-5)' }}>
              {AVAILABILITY.map((a) => (
                <Choice
                  key={a.value}
                  type="radio"
                  selected={contractor.availability === a.value}
                  title={a.label}
                  hint={a.hint}
                  onToggle={() => void run(() => updateContractor(contractor.id, { availability: a.value }))}
                />
              ))}
            </div>
            <Toggle
              checked={contractor.accepting_opportunities}
              label="Accept new opportunities"
              onChange={(next) =>
                void run(() => updateContractor(contractor.id, { accepting_opportunities: next }))
              }
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="License and insurance"
            subtitle="Reviewed by AskCENLA. Agents are told that network contractors are verified."
          />
          <CardBody>
            <div className="form-grid">
              <TextField
                className="col-6"
                label="License number"
                optional
                value={draft.license_number}
                onChange={(e) => patch({ license_number: e.target.value })}
              />
              <TextField
                className="col-6"
                label="Insurance carrier"
                optional
                value={draft.insurance_carrier}
                onChange={(e) => patch({ insurance_carrier: e.target.value })}
              />
            </div>
            <div className="row row--wrap" style={{ gap: 'var(--sp-4)' }}>
              <div>
                <div className="dl__term">License expires</div>
                <div className="dl__value">{shortDate(contractor.license_expires_on)}</div>
              </div>
              <div>
                <div className="dl__term">Insurance expires</div>
                <div className="dl__value">
                  {shortDate(contractor.insurance_expires_on)}{' '}
                  {contractor.insurance_expires_on &&
                    new Date(contractor.insurance_expires_on).getTime() - Date.now() < 30 * 86_400_000 && (
                      <Badge tone="warning">Expiring soon</Badge>
                    )}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 'var(--sp-5)' }}>
              <Alert tone="info">
                Certificate upload is wired to Supabase Storage in Phase 2. Documents are stored privately
                and visible only to AskCENLA administrators.
              </Alert>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
