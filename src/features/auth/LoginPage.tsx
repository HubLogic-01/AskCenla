import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { TextField } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { Alert } from '@/components/ui/Alert';
import { HOME_BY_ROLE, useAuth } from '@/app/providers/AuthProvider';
import { ROLE_LABEL } from '@/components/layout/navigation';
import { profiles } from '@/data/seed';

/** The four accounts a reviewer can click into while Supabase Auth is not wired up. */
const DEMO_IDS = ['usr-agent-1', 'usr-contractor-1', 'usr-broker-1', 'usr-admin-1'];

export function LoginPage() {
  const { signIn, signInAs } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const redirectTo = (location.state as { from?: string } | null)?.from;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const profile = await signIn(email);
      navigate(redirectTo ?? HOME_BY_ROLE[profile.role], { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  }

  function useDemoAccount(id: string) {
    signInAs(id);
    const profile = profiles.find((p) => p.id === id);
    navigate(profile ? HOME_BY_ROLE[profile.role] : '/', { replace: true });
  }

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
            “One property request became four tracked repair opportunities before I finished my coffee.”
          </p>
          <p style={{ marginTop: 'var(--sp-5)', color: 'rgba(255,255,255,0.55)' }} className="text-sm">
            Danielle Ortiz · Red River Realty Group
          </p>
        </div>
        <div className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
          Inspection reports are stored privately and shared only with contractors who accept the work.
        </div>
      </aside>

      <div className="auth__panel">
        <div className="auth__card">
          <h1>Sign in</h1>
          <p className="text-muted" style={{ marginTop: 'var(--sp-2)', marginBottom: 'var(--sp-6)' }}>
            Welcome back. Sign in to manage your repair requests.
          </p>

          <Card>
            <CardBody>
              <form onSubmit={onSubmit}>
                {error && (
                  <div style={{ marginBottom: 'var(--sp-5)' }}>
                    <Alert tone="danger">{error}</Alert>
                  </div>
                )}
                <TextField
                  label="Email address"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@brokerage.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <TextField
                  label="Password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  hint="Password is not checked in the Phase 1 demo."
                />
                <Button type="submit" block size="lg" disabled={busy}>
                  {busy ? 'Signing in…' : 'Sign in'}
                </Button>
              </form>
            </CardBody>
          </Card>

          <div className="divider" />

          <div className="eyebrow" style={{ marginBottom: 'var(--sp-3)' }}>
            Or explore a demo account
          </div>
          <div className="stack stack-2">
            {DEMO_IDS.map((id) => {
              const p = profiles.find((x) => x.id === id);
              if (!p) return null;
              return (
                <button key={id} className="demo-account" onClick={() => useDemoAccount(id)}>
                  <Avatar name={p.full_name} size="sm" tone={p.role === 'admin' ? 'navy' : undefined} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="demo-account__name">
                      {p.full_name}
                    </span>
                    <span className="demo-account__meta">{ROLE_LABEL[p.role]}</span>
                  </span>
                  <Icon name="chevronRight" size={16} />
                </button>
              );
            })}
          </div>

          <p className="text-sm text-muted" style={{ marginTop: 'var(--sp-6)' }}>
            Need an account? <Link to="/signup">Create one free</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
