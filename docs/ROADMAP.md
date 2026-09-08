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

### ✅ Phase 2 — Supabase schema, auth, and Row Level Security *(complete)*

**Delivered:**

- `supabase/migrations/0001_schema.sql` — 20 tables, 11 enums, foreign keys,
  indexes, `updated_at` triggers, and database-side generation of opportunity
  codes (`1042-P`).
- `supabase/migrations/0002_rls.sql` — RLS enabled on every table, with all
  cross-table checks routed through `SECURITY DEFINER` helpers, plus column
  guards that stop self-promotion to admin and self-activation of a contractor
  membership. Includes the `offered_opportunities` view that gives contractors
  a pre-acceptance feed with no address, MLS number or contact details in it.
- `supabase/migrations/0003_storage.sql` — one **private** `attachments`
  bucket whose policies reuse the same visibility helpers as the tables, so
  file access can never drift from row access.
- `supabase/migrations/0004_auth.sql` — creates the profile (and, for a
  contractor, a pending contractor record) when Supabase Auth creates the user.
  Refuses to grant `admin` from sign-up metadata.
- `supabase/migrations/0005_reference_data.sql` — trades and territories.
- `supabase/seed.sql` — demo marketplace plus four working sign-in accounts.
- `src/services/supabase.ts` — client, config detection, signed-URL helper.
- `AuthProvider` rewritten for real sign-up/sign-in/sessions, keeping demo mode
  as a fallback so a fresh clone still runs with no backend.
- `supabase/tests/` — a local harness that stubs Supabase's `auth` and
  `storage` schemas, and a 42-assertion RLS suite. `npm run db:test`.

*Verified:* all migrations apply to a clean PostgreSQL 16 database, the seed
loads, and **42/42 RLS assertions pass**. Writing those tests found and fixed
two real leaks — a contractor who accepted one trade at a property could see
every other trade's opportunity there, and could read the whole routing ladder
including which competitors had been offered the same job.

**Still to do outside the codebase:** create your Supabase project and run the
migrations. Step-by-step instructions are in the README.

---

### Phase 3 — Agent dashboard and wizard on live data ← **next**

The database is ready; this phase moves reads and writes onto it.

1. Add a repository layer behind `DataProvider` with two implementations
   (mock and Supabase) so demo mode keeps working.
2. Point the agent dashboard, property list and property dashboard at real
   queries.
3. Wire the wizard's insert path. Do it as a single `SECURITY DEFINER`
   Postgres function taking the whole request as JSON, so a partial failure
   cannot leave a request with no opportunities — a browser that dies between
   two `insert()` calls otherwise leaves orphaned rows.
4. Real file upload to the private `attachments` bucket, writing the matching
   `public.attachments` row, and swap `AttachmentList` over to
   `signedAttachmentUrl()`.

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
