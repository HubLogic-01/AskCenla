import { Link } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';

const FEATURES = [
  {
    icon: 'clipboard' as const,
    title: 'One request, every trade',
    text: 'Submit the property once and attach the inspection report. AskCENLA splits it into separate, independently tracked repair opportunities.',
  },
  {
    icon: 'route' as const,
    title: 'Automatic contractor routing',
    text: 'Each trade is offered to a vetted local contractor in rotation. If they pass or go quiet, it moves to the next one — no phone tag.',
  },
  {
    icon: 'file' as const,
    title: 'Quotes inside the platform',
    text: 'Contractors build itemized quotes with scope, exclusions and expiration dates. You compare them on one clean screen.',
  },
  {
    icon: 'lock' as const,
    title: 'Inspection reports stay private',
    text: 'Reports are stored in a private bucket with time-limited access. No public links, no forwarding a PDF to six people.',
  },
  {
    icon: 'chart' as const,
    title: 'Status you can actually read',
    text: 'Every trade shows who has it, where it stands and what is overdue — for a single property or an entire brokerage.',
  },
  {
    icon: 'shield' as const,
    title: 'A vetted local network',
    text: 'Membership is capped at three contractors per trade per territory, with license and insurance on file.',
  },
];

export function LandingPage() {
  return (
    <div className="site">
      <header className="site-header">
        <div className="site-header__inner">
          <Link to="/" className="row" style={{ textDecoration: 'none' }}>
            <span className="brandmark">AC</span>
            <span>
              <span className="brand-name brand-name--dark">
                AskCENLA
              </span>
              <span className="brand-sub brand-sub--dark">Repair Network</span>
            </span>
          </Link>
          <nav className="site-nav">
            <a href="#how-it-works">How it works</a>
            <a href="#agents">For agents</a>
            <a href="#contractors">For contractors</a>
          </nav>
          <div className="spacer" />
          <ButtonLink to="/login" variant="ghost" size="sm">
            Sign in
          </ButtonLink>
          <ButtonLink to="/signup" variant="primary" size="sm">
            Get started
          </ButtonLink>
        </div>
      </header>

      <section className="hero">
        <div className="hero__inner">
          <span className="hero__eyebrow">
            <Icon name="mapPin" size={13} /> Built for Central Louisiana
          </span>
          <h1 className="hero__title">One repair request. Every trade, routed automatically.</h1>
          <p className="hero__lead">
            Real estate agents and brokers submit a single property repair request with the inspection
            report attached. AskCENLA turns it into separate opportunities for plumbing, electrical,
            roofing and more — and delivers each one to a vetted local contractor.
          </p>
          <div className="hero__actions">
            <ButtonLink to="/signup" size="lg" variant="primary" iconRight="arrowRight">
              Create a free agent account
            </ButtonLink>
            <ButtonLink to="/login" size="lg" variant="secondary">
              View the live demo
            </ButtonLink>
          </div>
          <p className="hero__note">Free for agents and brokers. Contractors join by membership.</p>
        </div>
      </section>

      <section className="section" id="how-it-works">
        <div className="section__inner">
          <div className="section__head">
            <h2 className="section__title">One inspection report becomes four tracked jobs</h2>
            <p className="section__lead">
              Stop sending four separate emails to four contractors and chasing the replies in your inbox.
            </p>
          </div>

          <div className="flow-diagram">
            <Card>
              <CardBody>
                <div className="eyebrow">Agent submits</div>
                <h3 style={{ marginTop: 'var(--sp-3)' }}>Property Request #1042</h3>
                <p className="text-muted text-sm" style={{ marginTop: 'var(--sp-2)' }}>
                  123 Main Street · Alexandria, LA
                </p>
                <div className="row" style={{ marginTop: 'var(--sp-4)', gap: 'var(--sp-2)' }}>
                  <Icon name="lock" size={15} />
                  <span className="text-sm text-muted">Inspection report attached — private</span>
                </div>
              </CardBody>
            </Card>

            <div className="flow-arrow">
              <Icon name="arrowRight" size={28} />
            </div>

            <div className="flow-split">
              <div className="flow-chip">
                Plumbing <span className="flow-chip__code">1042-P</span>
              </div>
              <div className="flow-chip">
                Electrical <span className="flow-chip__code">1042-E</span>
              </div>
              <div className="flow-chip">
                Roofing <span className="flow-chip__code">1042-R</span>
              </div>
              <div className="flow-chip">
                HVAC <span className="flow-chip__code">1042-H</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section section--grey" id="agents">
        <div className="section__inner">
          <div className="section__head">
            <h2 className="section__title">Everything the platform handles for you</h2>
          </div>
          <div className="grid grid--3">
            {FEATURES.map((f) => (
              <Card key={f.title} flat>
                <div className="feature">
                  <div className="feature__icon">
                    <Icon name={f.icon} size={20} />
                  </div>
                  <h3 className="feature__title">{f.title}</h3>
                  <p className="feature__text">{f.text}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="contractors">
        <div className="section__inner">
          <div className="grid grid--2" style={{ alignItems: 'center', gap: 'var(--sp-12)' }}>
            <div>
              <div className="eyebrow">For contractors</div>
              <h2 className="section__title" style={{ marginTop: 'var(--sp-3)' }}>
                A limited network, not a lead free-for-all
              </h2>
              <p className="section__lead">
                We cap participation at three contractors per trade per territory. Opportunities are
                offered to one contractor at a time, in rotation — so when a request reaches you, it is
                genuinely yours to take.
              </p>
              <ul className="price-list" style={{ marginTop: 'var(--sp-6)' }}>
                {[
                  'Real repair requests from licensed agents and brokers',
                  'Property and agent details revealed the moment you accept',
                  'Build and send itemized quotes inside the platform',
                  'Track accepted jobs, submitted quotes and win rate',
                ].map((line) => (
                  <li key={line}>
                    <Icon name="checkCircle" size={17} />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>

            <Card>
              <div className="price-card">
                <div className="eyebrow">Contractor membership</div>
                <div className="price-card__amount" style={{ marginTop: 'var(--sp-4)' }}>
                  $199
                  <span className="price-card__period"> / month</span>
                </div>
                <p className="text-muted text-sm" style={{ marginTop: 'var(--sp-3)' }}>
                  Billed monthly. Cancel any time. Membership must be active to receive opportunities.
                </p>
                <div style={{ marginTop: 'var(--sp-6)' }}>
                  <ButtonLink to="/signup" variant="navy" size="lg" block>
                    Apply to join the network
                  </ButtonLink>
                </div>
                <p className="text-xs text-muted" style={{ marginTop: 'var(--sp-4)' }}>
                  Applications are reviewed by AskCENLA before activation.
                </p>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <section className="section section--grey">
        <div className="section__inner" style={{ textAlign: 'center' }}>
          <h2 className="section__title">Ready to stop coordinating repairs by text message?</h2>
          <p className="section__lead" style={{ margin: 'var(--sp-4) auto var(--sp-8)', maxWidth: '60ch' }}>
            Create a free account and submit your first property request in a few minutes.
          </p>
          <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
            <ButtonLink to="/signup" size="lg">
              Get started free
            </ButtonLink>
            <ButtonLink to="/login" size="lg" variant="secondary">
              Sign in
            </ButtonLink>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="site-footer__inner">
          <div>
            <div className="row">
              <span className="brandmark">AC</span>
              <span>
                <span className="brand-name">
                  AskCENLA Repair Network
                </span>
                <span className="brand-sub">Alexandria, Louisiana</span>
              </span>
            </div>
          </div>
          <div className="text-sm">© {new Date().getFullYear()} AskCENLA. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}

/** Exported for the 404 screen so it can reuse the marketing chrome. */
export function NotFoundPage() {
  return (
    <div className="auth">
      <div className="auth__panel" style={{ gridColumn: '1 / -1' }}>
        <div className="auth__card" style={{ textAlign: 'center' }}>
          <div className="eyebrow">404</div>
          <h1 style={{ margin: 'var(--sp-4) 0' }}>We could not find that page</h1>
          <p className="text-muted">The link may be out of date, or the record may have been removed.</p>
          <div className="row" style={{ justifyContent: 'center', marginTop: 'var(--sp-6)' }}>
            <ButtonLink to="/">Back to home</ButtonLink>
            <Button variant="secondary" onClick={() => window.history.back()}>
              Go back
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
