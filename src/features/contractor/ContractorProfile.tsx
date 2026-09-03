import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { TextField } from '@/components/ui/Field';
import { Choice } from '@/components/ui/Choice';
import { Toggle } from '@/components/ui/Toggle';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { useAuth } from '@/app/providers/AuthProvider';
import { useData } from '@/app/providers/DataProvider';
import { TRADES } from '@/data/trades';
import { territories } from '@/data/seed';
import { shortDate } from '@/lib/format';
import type { AvailabilityStatus } from '@/types/domain';

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
  if (!contractor) return null;

  const toggleTrade = (key: (typeof TRADES)[number]['key']) => {
    const next = contractor.trades.includes(key)
      ? contractor.trades.filter((t) => t !== key)
      : [...contractor.trades, key];
    updateContractor(contractor.id, { trades: next });
  };

  const toggleTerritory = (id: string) => {
    const next = contractor.territory_ids.includes(id)
      ? contractor.territory_ids.filter((t) => t !== id)
      : [...contractor.territory_ids, id];
    updateContractor(contractor.id, { territory_ids: next });
  };

  return (
    <>
      <PageHeader
        title="Business Profile"
        description="Trades and territories decide which opportunities reach you. Keep them accurate."
      />

      <div className="stack stack-5">
        <Card>
          <CardHeader title="Business information" />
          <CardBody>
            <div className="form-grid">
              <TextField
                className="col-6"
                label="Business name"
                value={contractor.business_name}
                onChange={(e) => updateContractor(contractor.id, { business_name: e.target.value })}
              />
              <TextField
                className="col-6"
                label="Contact name"
                value={contractor.contact_name}
                onChange={(e) => updateContractor(contractor.id, { contact_name: e.target.value })}
              />
              <TextField
                className="col-6"
                label="Email"
                type="email"
                value={contractor.email}
                onChange={(e) => updateContractor(contractor.id, { email: e.target.value })}
              />
              <TextField
                className="col-6"
                label="Phone"
                type="tel"
                value={contractor.phone}
                onChange={(e) => updateContractor(contractor.id, { phone: e.target.value })}
              />
              <TextField
                label="Business address"
                value={contractor.address_line1}
                onChange={(e) => updateContractor(contractor.id, { address_line1: e.target.value })}
              />
              <TextField
                className="col-6"
                label="City"
                value={contractor.city}
                onChange={(e) => updateContractor(contractor.id, { city: e.target.value })}
              />
              <TextField
                className="col-3"
                label="State"
                value={contractor.state}
                onChange={(e) => updateContractor(contractor.id, { state: e.target.value })}
              />
              <TextField
                className="col-3"
                label="ZIP"
                value={contractor.zip}
                onChange={(e) => updateContractor(contractor.id, { zip: e.target.value })}
              />
            </div>
          </CardBody>
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
                  onToggle={() => updateContractor(contractor.id, { availability: a.value })}
                />
              ))}
            </div>
            <Toggle
              checked={contractor.accepting_opportunities}
              label="Accept new opportunities"
              onChange={(next) => updateContractor(contractor.id, { accepting_opportunities: next })}
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
                value={contractor.license_number ?? ''}
                onChange={(e) => updateContractor(contractor.id, { license_number: e.target.value || null })}
              />
              <TextField
                className="col-6"
                label="Insurance carrier"
                optional
                value={contractor.insurance_carrier ?? ''}
                onChange={(e) => updateContractor(contractor.id, { insurance_carrier: e.target.value || null })}
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
