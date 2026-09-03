import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Choice } from '@/components/ui/Choice';
import { TextField } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Alert';
import { HOME_BY_ROLE, useAuth } from '@/app/providers/AuthProvider';
import type { UserRole } from '@/types/domain';

const SIGNUP_ROLES: { role: UserRole; title: string; hint: string; demoId: string }[] = [
  { role: 'agent', title: 'Real estate agent', hint: 'Free — submit repair requests', demoId: 'usr-agent-1' },
  { role: 'broker', title: 'Broker or office manager', hint: 'Free — oversee your brokerage', demoId: 'usr-broker-1' },
  { role: 'contractor', title: 'Contractor', hint: '$199/month membership', demoId: 'usr-contractor-1' },
];

export function SignUpPage() {
  const [role, setRole] = useState<UserRole>('agent');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const { signInAs } = useAuth();
  const navigate = useNavigate();

  const selected = SIGNUP_ROLES.find((r) => r.role === role)!;

  return (
    <div className="auth">
      <aside className="auth__aside">
        <Link to="/" className="row" style={{ textDecoration: 'none' }}>
          <span className="brandmark">AC</span>
          <span>
            <span className="brand-name">
              AskCENLA
            </span>
            <span className="brand-sub">Repair Network</span>
          </span>
        </Link>
        <div>
          <p className="auth__quote">
            Submit one property request. We handle the routing, the follow-up and the paperwork trail.
          </p>
        </div>
        <div className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
          Agents and brokers never pay. Contractors fund the network.
        </div>
      </aside>

      <div className="auth__panel">
        <div className="auth__card">
          <h1>Create your account</h1>
          <p className="text-muted" style={{ marginTop: 'var(--sp-2)', marginBottom: 'var(--sp-6)' }}>
            Tell us how you will use AskCENLA.
          </p>

          <Card>
            <CardBody>
              <div className="field">
                <span className="field__label">I am a…</span>
                <div className="stack stack-2">
                  {SIGNUP_ROLES.map((r) => (
                    <Choice
                      key={r.role}
                      type="radio"
                      selected={role === r.role}
                      title={r.title}
                      hint={r.hint}
                      onToggle={() => setRole(r.role)}
                    />
                  ))}
                </div>
              </div>

              <TextField
                label="Full name"
                placeholder="Jane Broussard"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <TextField
                label="Work email"
                type="email"
                placeholder="jane@brokerage.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <TextField
                label={role === 'contractor' ? 'Business name' : 'Brokerage'}
                placeholder={role === 'contractor' ? 'Wiley Plumbing' : 'Red River Realty Group'}
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />

              <Alert tone="info" title="Phase 1 demo">
                Account creation is wired up in Phase 2 with Supabase Auth. For now this button opens the
                matching demo account so you can see the full experience.
              </Alert>

              <div style={{ marginTop: 'var(--sp-5)' }}>
                <Button
                  block
                  size="lg"
                  onClick={() => {
                    signInAs(selected.demoId);
                    navigate(HOME_BY_ROLE[role], { replace: true });
                  }}
                >
                  Continue as {selected.title.toLowerCase()}
                </Button>
              </div>
            </CardBody>
          </Card>

          <p className="text-sm text-muted" style={{ marginTop: 'var(--sp-5)' }}>
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
