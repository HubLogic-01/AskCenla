import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Choice } from '@/components/ui/Choice';
import { TextField } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/components/ui/Icon';
import { HOME_BY_ROLE, useAuth } from '@/app/providers/AuthProvider';
import type { UserRole } from '@/types/domain';

const SIGNUP_ROLES: { role: UserRole; title: string; hint: string; demoId: string }[] = [
  { role: 'agent', title: 'Real estate agent', hint: 'Free — submit repair requests', demoId: 'usr-agent-1' },
  { role: 'broker', title: 'Broker or office manager', hint: 'Free — oversee your brokerage', demoId: 'usr-broker-1' },
  { role: 'contractor', title: 'Contractor', hint: '$199/month membership', demoId: 'usr-contractor-1' },
];

const MIN_PASSWORD_LENGTH = 8;

export function SignUpPage() {
  const { signUp, signInAs, isLive } = useAuth();
  const navigate = useNavigate();

  const [role, setRole] = useState<UserRole>('agent');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  const selected = SIGNUP_ROLES.find((r) => r.role === role)!;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // Demo mode has nothing to register against — open the matching account.
    if (!isLive) {
      signInAs(selected.demoId);
      navigate(HOME_BY_ROLE[role], { replace: true });
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setBusy(true);
    try {
      const { needsEmailConfirmation } = await signUp({
        email,
        password,
        fullName,
        role,
        phone,
        businessName: role === 'contractor' ? company : undefined,
      });
      if (needsEmailConfirmation) {
        setConfirmSent(true);
      } else {
        navigate(HOME_BY_ROLE[role], { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <aside className="auth__aside">
        <Link to="/" className="row" style={{ textDecoration: 'none' }}>
          <span className="brandmark">AC</span>
          <span>
            <span className="brand-name">AskCENLA</span>
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
          {confirmSent ? (
            <Card>
              <CardBody>
                <div className="empty__icon" style={{ margin: '0 auto var(--sp-4)' }}>
                  <Icon name="mail" size={22} />
                </div>
                <h1 style={{ textAlign: 'center' }}>Check your email</h1>
                <p className="text-muted" style={{ textAlign: 'center', marginTop: 'var(--sp-3)' }}>
                  We sent a confirmation link to <strong>{email}</strong>. Click it to activate your
                  account, then sign in.
                </p>
                <div style={{ marginTop: 'var(--sp-6)' }}>
                  <Link to="/login" className="btn btn--primary btn--block">
                    Go to sign in
                  </Link>
                </div>
              </CardBody>
            </Card>
          ) : (
            <>
              <h1>Create your account</h1>
              <p className="text-muted" style={{ marginTop: 'var(--sp-2)', marginBottom: 'var(--sp-6)' }}>
                Tell us how you will use AskCENLA.
              </p>

              <Card>
                <CardBody>
                  <form onSubmit={onSubmit}>
                    {error && (
                      <div style={{ marginBottom: 'var(--sp-5)' }}>
                        <Alert tone="danger">{error}</Alert>
                      </div>
                    )}

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
                      required={isLive}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                    <TextField
                      label="Work email"
                      type="email"
                      autoComplete="email"
                      placeholder="jane@brokerage.com"
                      required={isLive}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    <TextField
                      label={role === 'contractor' ? 'Business name' : 'Brokerage'}
                      placeholder={role === 'contractor' ? 'Wiley Plumbing' : 'Red River Realty Group'}
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                    />
                    <TextField
                      label="Phone"
                      type="tel"
                      optional
                      placeholder="(318) 445-0112"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />

                    {isLive && (
                      <TextField
                        label="Password"
                        type="password"
                        autoComplete="new-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
                      />
                    )}

                    {role === 'contractor' && isLive && (
                      <div style={{ marginBottom: 'var(--sp-5)' }}>
                        <Alert tone="info" title="Applications are reviewed">
                          Your contractor account is created immediately, but AskCENLA reviews your
                          licence and insurance before activating it. You will not receive
                          opportunities until then.
                        </Alert>
                      </div>
                    )}

                    {!isLive && (
                      <div style={{ marginBottom: 'var(--sp-5)' }}>
                        <Alert tone="info" title="Running on demo data">
                          No database is connected, so this opens the matching demo account instead of
                          registering. Connect Supabase to create real accounts.
                        </Alert>
                      </div>
                    )}

                    <Button type="submit" block size="lg" disabled={busy}>
                      {busy
                        ? 'Creating your account…'
                        : isLive
                          ? 'Create account'
                          : `Continue as ${selected.title.toLowerCase()}`}
                    </Button>
                  </form>
                </CardBody>
              </Card>

              <p className="text-sm text-muted" style={{ marginTop: 'var(--sp-5)' }}>
                Already have an account? <Link to="/login">Sign in</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
