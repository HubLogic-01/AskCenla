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

### ✅ Phase 5 — Contractor accept / decline *(complete)*

**Delivered** (`supabase/migrations/0008_contractor_actions.sql`):

- `accept_opportunity()`, `decline_opportunity()` and an admin-only
  `reroute_opportunity()`. All three are `SECURITY DEFINER`, because accepting
  claims a row that belongs to nobody and the RLS policy deliberately only lets
  a contractor touch opportunities they already own.
- Each **locks the opportunity row first**, so a decline racing the scheduled
  sweep cannot both advance the ladder and leave the job offered to two
  contractors at once. A test asserts that never happens.
- Each **verifies the caller actually holds the pending offer** rather than
  trusting the id passed in. Since these functions run with rights the caller
  does not have, their own checks are the entire security boundary.
- Response time is recorded and feeds the routing score. `offers_received` is
  the denominator on purpose: every offer resolves eventually — accepted,
  declined, or expired — so an ignored offer correctly drags a contractor's
  average down and moves them down the rotation.
- The admin re-route **withdraws the live offer before routing on**, and
  refuses outright to touch work a contractor has already accepted.
- The three `NotYetLiveError` stubs are gone; `mockRepository` was brought to
  the same behaviour so demo mode does not teach something different.

*Verified:* 116/116 database assertions. The interesting ones are the abuse
cases — accepting an offer made to someone else, accepting twice, an agent
posing as a contractor, and re-routing a job already under way. Also checked in
the browser: declining removes the offer from that contractor's list and passes
it on, and accepting flips the address, agent contact and inspection report
from hidden to visible in the same session.

---

### ✅ Phase 6 — Quotes *(complete)*

The security rules for quotes already existed and were tested in Phase 2 — an
agent never sees a contractor's draft. So this phase was not new security work;
it exists because every quote operation spans more than one table and must not
be half-done.

**Delivered** (`supabase/migrations/0009_quotes.sql`):

- `create_draft_quote()` — the quote, a starter line item and the opportunity's
  status move together. The quote number (`Q-1047P-01`) is generated in the
  database from the request reference and the trade letter, so it is unique and
  sequential no matter what created it.
- `save_quote()` — line items are **replaced** wholesale, because the builder
  lets a contractor reorder, edit and delete rows and diffing that client-side
  would be more code and more ways to be wrong. Delete-then-insert is only safe
  because it is one transaction; as two client calls, a browser dying between
  them would empty a contractor's pricing.
- `submit_quote()` — the quote, the opportunity and the agent's notification
  are one event. Refuses a quote with no line items, and refuses to touch one
  already sent: the agent is looking at those figures.
- `decide_quote()` — the same, in the other direction, and it refuses the
  obvious abuse of a contractor approving their own pricing.
- **Quote attachments** in the same private bucket as inspection reports, so a
  spec sheet or warranty is readable only by people who can already read the
  quote. A failed database insert removes the uploaded file rather than leaving
  an orphan.
- **Print / Save as PDF** on both sides, from the `QuoteDocument` component
  that already rendered identically for contractor and agent.

*Verified:* 148/148 database assertions, and the full lifecycle in a browser —
accept an offer, build a two-line quote, attach a file, save, submit, then view
and print it as the agent.

**On the PDF:** this uses a print stylesheet and the browser's own
print-to-PDF, not a bundled renderer. That gives real selectable text rather
than a screenshot, correct pagination, no dependency to keep patched, and it
works offline. A print-only footer identifies the document once it has left the
platform, since quotes get forwarded to buyers, sellers and lenders.

---

### ✅ Phase 7 — Agent quote review *(delivered with Phase 6)*

Accept/decline is persisted through `decide_quote()`, writes `status_history`
via the Phase 4 trigger, and notifies the contractor. The remaining idea from
this phase — surfacing `status_history` as an activity timeline on the property
dashboard — is folded into Phase 8.

### ✅ Phase 8 — Administration *(complete)*

**Delivered** (`supabase/migrations/0010_admin.sql`):

- `set_contractor_membership()` — administrators only, because these are the
  two columns the matching engine trusts when deciding who may receive work.
  Sends a notification when a contractor is let into the network, and stays
  quiet for a routine correction.
- `set_contractor_trades()` and `set_contractor_territories()` — replace the
  whole set, matching how the UI works: both the admin and the contractor
  toggle tiles and expect the result to be exactly what they see.
  Delete-then-insert is only safe as one transaction; as two client calls a
  failure between them would leave a contractor with no trades and therefore no
  work. A contractor manages their own; an admin manages anyone's.
- `public.marketplace_metrics` — the admin roll-up, counted in Postgres. The
  dashboard had been deriving it in the browser from the whole workspace, which
  only worked because an admin can read every row and would have meant
  downloading the entire marketplace to count it. Admin-only by construction:
  the view is not `security_invoker`, so its own `WHERE app.is_admin()` is the
  access control, and everyone else gets zero rows.
- **Activity timeline** on the property dashboard, reading the `status_history`
  the Phase 4 triggers write. This is the folded-in Phase 7 item, and it is the
  only place you can see what the automation did while nobody was watching.

`updateContractor` stayed a single call site in the UI while gaining three
mechanisms underneath — join-table replacement, a privileged RPC, and an
ordinary column update — which is what the repository seam was for. The last
`NotYetLiveError` is gone, and the class with it: every operation is connected.

*Verified:* 179/179 database assertions, and in the browser the whole admin
loop — an unmatched flooring job in Pineville, approve the pending contractor
and grant them that territory, and "No one left" becomes a routed offer.

---

### ✅ Phase 9 — Email delivery *(complete)*

In-app notifications already existed and the automatic-routing half shipped in
Phase 4. This phase is delivery: reaching a contractor on a roof and an owner
who is not looking at the dashboard.

**The split that matters:** the database owns *what* to send and all the
delivery bookkeeping; the Edge Function owns only *how* to send it. Everything
that can be wrong in an interesting way is therefore testable against a plain
PostgreSQL server, and the part that needs the internet is about thirty lines
with no business logic in it. Swapping Resend for Postmark touches one file and
no rules.

**Delivered:**

- `0011_email_delivery.sql` — the notifications table becomes the queue, with
  a delivery status, attempt count, last error and claim timestamp. Using the
  same table rather than a second one means "what the user saw in the app" and
  "what we emailed them" can never disagree.
- **Per-person preference** (`profiles.email_mode`): immediate, one daily
  summary, or in-app only. Applied by trigger at insert, so the queue reflects
  the preference as it was when the event happened.
- `claim_notification_emails()` / `claim_notification_digests()` — batch claim
  with `for update skip locked`, so overlapping runs never send the same
  message twice, plus a 15-minute visibility timeout that reclaims anything
  stranded by a worker that died mid-flight.
- `record_notification_delivery()` — a transient failure returns to the queue;
  an attempt ceiling stops a permanently bad address consuming it forever.
- `owner_digest()` — the standing summary of things only a person can fix:
  unmatched work, applications awaiting review, memberships past due,
  credentials expiring within 30 days. A quiet day sends nothing.
- `supabase/functions/send-notifications` — the worker, deployed with
  `--no-verify-jwt` and authenticated on a shared secret. Its service-role key
  lives in the function's own environment and never touches the database.
- `0012_email_schedule.sql` — three `pg_cron` schedules, reading the project's
  URL and secret from `app.settings` so the migration stays generic and the
  values stay out of version control.

*Verified:* 209/209 database assertions. The queue tests are the point of this
phase — nobody is emailed twice, a transient failure is retried, a dead address
gives up, a digest is one email rather than one per item, and a message
stranded by a crashed worker is recovered.

Writing those tests found the stranded-message case: a worker that claims a
batch and then dies leaves rows in `sending`, which nothing was looking at any
more. Hence the claim timestamp and the reclaim window.

---

### Phase 10 — Stripe membership ← **next**
Checkout for the $199/month membership, a webhook that writes
`subscriptions.status` and `contractors.membership_status`, and a billing portal
link. The matching engine already refuses to route to a non-active membership,
so switching billing on requires no logic change.

---

## Later, deliberately deferred

Homeowner payments · contractor payouts · escrow · construction contracts ·
project management · CRM · QuickBooks · AI inspection-report parsing ·
real-time chat · native mobile apps · advanced scheduling · homeowner portal.
