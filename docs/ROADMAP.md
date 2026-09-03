# Build roadmap

Each phase is shippable on its own. Nothing later is a prerequisite for
something earlier.

---

### ✅ Phase 1 — Architecture, routing, UI, demo data *(complete)*

Project structure, design system, four role-based dashboards, the full
multi-trade wizard, contractor accept/decline, quote builder, admin routing
monitor — all running on an in-memory demo dataset.

*Verified:* production build passes, and the whole agent → contractor → quote
flow runs in a browser with no console errors.

---

### Phase 2 — Supabase schema, auth, and Row Level Security

**Outside the codebase (you do this):**
1. Create a project at <https://supabase.com>.
2. Copy the Project URL and the **anon** key from Settings → API.
3. `cp .env.example .env` and paste them in. Never paste the `service_role` key.

**In the codebase:**
1. `npm install @supabase/supabase-js`
2. Add `src/services/supabase.ts` creating the client from the env vars.
3. Add `supabase/migrations/0001_init.sql` — the schema in `docs/ARCHITECTURE.md`.
4. Add `supabase/migrations/0002_rls.sql` — policies per the security table in
   the same document. Enable RLS on **every** table.
5. Create a **private** Storage bucket `attachments`, with a policy granting
   access only to the request owner, their brokerage, an accepted contractor,
   and admins.
6. Replace the bodies of `AuthProvider` (`supabase.auth.*`) and `DataProvider`
   (`supabase.from(...)`). Screens do not change.

*Done when:* signing in with a real account loads real rows, and a contractor
querying another contractor's opportunity gets zero rows from the database.

---

### Phase 3 — Agent dashboard and wizard on live data
Wire the wizard's insert path (request → items → opportunities in one
transaction, ideally a Postgres function so a partial failure cannot leave
orphaned rows), and real file upload to the private bucket.

### Phase 4 — Opportunity generation server-side
Move `routeOpportunity` into a Postgres function or Edge Function triggered on
request insert, so routing happens even when the request arrives from somewhere
other than the web app.

### Phase 5 — Contractor accept/decline on live data
Accept/decline as transactional updates that also write the
`opportunity_assignments` outcome and re-route on decline.

### Phase 6 — Quotes
Persist quotes and line items; attachments on quotes; a printable PDF built from
the existing `QuoteDocument` component (it is already a single shared template).

### Phase 7 — Agent quote review
Accept/decline persisted, with `status_history` entries and contractor
notification.

### Phase 8 — Admin
Contractor approval workflow, membership overrides, and marketplace metrics
computed as Postgres views rather than in the browser.

### Phase 9 — Notifications and automatic routing
- Email via Supabase Edge Functions (Resend or Postmark).
- A scheduled job (pg_cron) running `findExpiredOffers` → `routeOpportunity` so
  offers advance without anyone watching.
- No-response reminders, quote-submitted alerts, unmatched-opportunity digest to
  the admin.

### Phase 10 — Stripe membership
Checkout for the $199/month membership, a webhook that writes
`subscriptions.status` and `contractors.membership_status`, and a billing portal
link. The matching engine already refuses to route to a non-active membership,
so switching billing on requires no logic change.

---

## Later, deliberately deferred

Homeowner payments · contractor payouts · escrow · construction contracts ·
project management · CRM · QuickBooks · AI inspection-report parsing ·
real-time chat · native mobile apps · advanced scheduling · homeowner portal.
