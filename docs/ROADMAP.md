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

### ✅ Phase 3 — The data seam and the agent on live data *(complete)*

**Delivered:**

- `src/services/repository.ts` — one interface covering every read and write.
- `src/services/mockRepository.ts` — the Phase 1 logic, moved behind it.
- `src/services/supabaseRepository.ts` — real queries, the submit RPC, file
  upload, and expiring signed URLs.
- `DataProvider` rewritten: async actions, a loaded workspace, first-load and
  error states, and a reload after every write so the screen matches what the
  database accepted.
- `supabase/migrations/0006_functions.sql` — `submit_repair_request()` creates
  the request, its items and one opportunity per trade **in one transaction**,
  and routes each one. Ownership is taken from `auth.uid()`, never the payload.
- The matching engine now also exists in SQL (`app.eligible_contractors`,
  `app.route_opportunity`), so routing happens regardless of what created the
  request.
- Real file upload to the private bucket; `AttachmentList` opens documents
  through a 60-second signed URL.
- `useAction` hook so a rejected write surfaces as a message instead of a
  silently ignored promise.
- `ContractorProfile` converted to draft-and-save. It previously wrote on every
  keystroke, which was harmless against an array and a request per character
  against a database.

*Verified:* 65/65 database assertions pass, including a test that sends the
exact payload the client builds. The full browser flow still runs with zero
console errors in demo mode.

Writing the tests caught a real bug: the column guard added in Phase 2 blocked
the platform's own routing code from updating the statistics it owns. The guard
now distinguishes a browser session from platform code by `current_user`, which
a client cannot forge.

---

### ✅ Phase 4 — Routing automation *(complete)*

The point of this phase: the platform keeps working when nobody is watching it.

**Delivered** (`supabase/migrations/0007_routing_automation.sql`):

- **Routing on insert.** An `AFTER INSERT` trigger routes any opportunity
  created with status `matching`, so a future email intake, bulk import or
  admin action is routed the same way the wizard is. Creating one with any
  other status opts out, which is how the demo seed keeps its hand-authored
  ladder.
- **The expiry sweep.** `app.expire_stale_offers()` marks lapsed offers
  expired and advances each opportunity to the next contractor, through the
  same `app.route_opportunity()` entry point routing has always used. It takes
  `now` as a parameter so it is testable in milliseconds rather than over 24
  hours. Scheduled every 15 minutes via `pg_cron`, and exposed to
  administrators as `public.run_offer_sweep()` behind a **Run sweep now**
  button on the Routing Monitor.
- **Exhaustion is reported to a human.** When no contractor remains, the agent
  is told their trade is being sourced and every admin is told there is a
  coverage gap — once per opportunity, not once per sweep.
- **Status history.** Recorded by trigger on opportunities, requests and
  quotes, so it cannot be forgotten at a call site and is correct regardless of
  what made the change.
- **A request's status follows its trades.** `app.sync_request_status()` keeps
  the parent truthful; before this a request said "Submitted" forever because
  nothing ever updated it. Mirrored in `src/lib/requestStatus.ts` so demo mode
  behaves identically.

*Verified:* 90/90 database assertions pass, including that a stale offer on a
job someone already accepted is **not** swept, and that the sweep advances
1044-P from Wiley Plumbing to Red River Plumbing with the ladder recorded
correctly. Exercised in the browser end to end.

Two bugs surfaced while testing. The harness's `auth.uid()` stub cast an empty
GUC straight to `jsonb`, which throws rather than returning null — so any
server-side call with no session failed the moment status history read it; it
now guards with `nullif` exactly as Supabase's own definition does. And the
demo seed created opportunities as `matching`, which the new trigger correctly
started routing over the top of the hand-authored ladder.

**Still manual:** `status_history` has no UI yet. It is the audit backbone for
Phase 9 notifications and would sit naturally on the property dashboard as an
activity timeline — that is Phase 7 work, not routing work.

---

### Phase 5 — Contractor accept/decline on live data

`accept_opportunity()` and `decline_opportunity()` as SECURITY DEFINER
functions: verify the caller holds a pending offer, set the outcome, claim or
re-route the opportunity, update the contractor's response statistics, and
notify the agent. Then delete the three `NotYetLiveError` stubs in
`supabaseRepository`.

### Phase 6 — Quotes
Persist quotes and line items; attachments on quotes; a printable PDF built from
the existing `QuoteDocument` component (it is already a single shared template).
The RLS policies for all of this already exist and are tested — this is
repository wiring, not new security work.

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
