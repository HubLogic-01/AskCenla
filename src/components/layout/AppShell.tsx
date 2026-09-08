import { useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar, type NavCounts } from './Sidebar';
import { Topbar } from './Topbar';
import { Card, CardBody } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/app/providers/AuthProvider';
import { useData } from '@/app/providers/DataProvider';
import { isPendingOffer, opportunitiesForContractor, requestsForBrokerage, needsAttention } from '@/lib/selectors';

/** Human page titles for the topbar, longest prefix wins. */
const TITLES: [string, string][] = [
  ['/agent/requests/new', 'New Repair Request'],
  ['/agent/properties', 'Properties'],
  ['/agent/quotes', 'Quotes'],
  ['/agent', 'Agent Dashboard'],
  ['/contractor/opportunities', 'Opportunities'],
  ['/contractor/quotes', 'My Quotes'],
  ['/contractor/profile', 'Business Profile'],
  ['/contractor/membership', 'Membership'],
  ['/contractor', 'Contractor Dashboard'],
  ['/broker/opportunities', 'All Opportunities'],
  ['/broker/agents', 'Agents'],
  ['/broker', 'Brokerage Overview'],
  ['/admin/contractors', 'Contractor Management'],
  ['/admin/requests', 'Repair Requests'],
  ['/admin/routing', 'Routing Monitor'],
  ['/admin/users', 'Users'],
  ['/admin', 'Marketplace Overview'],
];

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const { profile } = useAuth();
  const data = useData();

  const title = TITLES.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? 'AskCENLA';

  // Only blank the screen on the FIRST load. Reloads after a write keep the
  // current view on screen so the page does not flash on every action.
  const firstLoad = data.loading && data.requests.length === 0 && data.opportunities.length === 0;

  const counts = useMemo<NavCounts>(() => {
    if (!profile) return {};
    if (profile.role === 'contractor' && profile.contractor_id) {
      const mine = opportunitiesForContractor(data, profile.contractor_id);
      return {
        contractorNew: mine.filter((o) => isPendingOffer(data, o.id, profile.contractor_id!)).length,
      };
    }
    if (profile.role === 'agent') {
      const myRequestIds = new Set(data.requests.filter((r) => r.created_by === profile.id).map((r) => r.id));
      return {
        agentQuotes: data.opportunities.filter(
          (o) => myRequestIds.has(o.request_id) && o.status === 'quote_submitted',
        ).length,
      };
    }
    if (profile.role === 'broker' && profile.brokerage_id) {
      const ids = new Set(requestsForBrokerage(data, profile.brokerage_id).map((r) => r.id));
      return {
        brokerAttention: data.opportunities.filter((o) => ids.has(o.request_id) && needsAttention(o)).length,
      };
    }
    if (profile.role === 'admin') {
      return { adminUnmatched: data.opportunities.filter((o) => o.status === 'awaiting_contractor').length };
    }
    return {};
  }, [profile, data]);

  return (
    <div className="shell">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} counts={counts} />
      <div className="main">
        <Topbar onMenu={() => setMenuOpen(true)} title={title} />
        <main className="content">
          <div className="content__inner">
            {/*
              A failed load is shown INSTEAD of the screen. Rendering a
              dashboard over an empty workspace would look like "you have no
              properties" when the truth is "we could not reach the database".
            */}
            {data.error ? (
              <Card>
                <CardBody>
                  <Alert tone="danger" title="We could not load your data">
                    {data.error}
                  </Alert>
                  <div style={{ marginTop: 'var(--sp-5)' }}>
                    <Button onClick={() => void data.refresh()}>Try again</Button>
                  </div>
                </CardBody>
              </Card>
            ) : firstLoad ? (
              <div className="load-state">
                <span className="spinner" aria-hidden="true" />
                <span className="text-muted">Loading your workspace…</span>
              </div>
            ) : (
              <Outlet />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
