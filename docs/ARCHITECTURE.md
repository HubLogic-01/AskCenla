# Architecture

This document explains the decisions behind the codebase, and what changes in
each future phase. It is written to be read by someone who did not write the
code.

---

## 1. Technology choices

| Choice | Why |
|---|---|
| **TypeScript**, not JavaScript | The domain is full of controlled vocabularies — 15 opportunity statuses, 14 trades, 4 roles, 5 membership states. TypeScript makes a typo like `"quote_sumitted"` a build error instead of a row that silently never matches a filter. It also means the Supabase-generated database types drop straight in during Phase 2. |
| **Vite** | Fast dev server, trivial Netlify build (`npm run build` → `dist/`), no config to babysit. |
| **React Router (declarative `<Routes>`)** | Readable: every route in the product is visible in one file, `src/app/router.tsx`. Role guards wrap route groups rather than being scattered through components. |
| **Plain CSS with design tokens**, not Tailwind | The brand needs a specific navy/blue/charcoal system. Tokens in `src/styles/tokens.css` mean the palette changes in one place, markup stays readable (`className="card"`, not twelve utility classes), and there is no extra build dependency to break. |
| **No state library** (Redux/Zustand) | Two React contexts cover everything the app needs today. Adding a state library now would be complexity without a problem to solve. |

## 2. The three-layer shape

```
   Screens (src/features/**)        "what the user sees"
        │  useData() / useAuth()
        ▼
   Providers (src/app/providers/**) session + loaded workspace
        │  delegate every read and write to
        ▼
   Repository (src/services/**)     mock  |  supabase
        │  pure rules from
        ▼
   Logic  (src/lib/**)              matching, totals, selectors
```

**The repository seam is the most important structural decision in the
codebase.** `src/services/repository.ts` declares everything the application
can read or write, and two classes implement it:

| | `mockRepository` | `supabaseRepository` |
|---|---|---|
| Data | in-memory demo dataset | PostgreSQL via supabase-js |
| Permissions | none (selectors filter) | Row Level Security |
| Chosen when | no credentials configured | `.env` has a project URL and anon key |

`DataProvider` picks one at startup, and **no screen knows which it got**. That
buys three things:

1. A fresh `git clone` runs with no backend, so UI work is never blocked on a
   database being reachable.
2. The demo mode used to review designs is the real application, not a
   separate mock harness that can rot.
3. Connecting a new backend means writing one class, not touching 30 screens.

Two properties of the interface are deliberate:

- **The methods are operations, not table mutations.** `acceptOpportunity()`,
  not `updateOpportunity()`. That is what lets the Supabase implementation
  route a call through a transactional Postgres function while the mock one
  edits an array.
- **Writes are followed by a reload rather than an optimistic patch.** One
  round trip over a small dataset guarantees the screen shows what the database
  actually accepted. An optimistic update that a permission check silently
  rejected would be worse than a brief spinner.

### Two rules the Supabase implementation follows

**No permission filtering in the client.** Every query is "select all rows",
and RLS decides what that means for the signed-in user. A `.eq('created_by',
me)` written in TypeScript would be a second, weaker copy of a rule that
already exists in the database, and the two would eventually disagree.

**Writes that cross tables go through RPCs.** Submitting a repair request
creates a request, N items, N opportunities and N assignments. As separate
client calls, a browser dying halfway leaves a property with no opportunities
attached. As one `SECURITY DEFINER` function, it either all happens or none of
it does.

### What is not connected yet

`supabaseRepository` throws a typed `NotYetLiveError` for contractor
accept/decline (Phase 5) and the quote builder (Phase 6), naming the phase in
the message. Accepting reassigns an opportunity that currently belongs to
nobody, which is deliberately not a row update any contractor is allowed to
make — so it needs its own function rather than a shortcut in the policies.
The UI surfaces the message instead of appearing to work.

## 3. The matching engine

The most important business logic in the product, and deliberately the most
isolated. It exists in **two** places on purpose:

| | `src/lib/matching.ts` | `supabase/migrations/0006_functions.sql` |
|---|---|---|
| Runs | in the browser | in PostgreSQL |
| Used by | demo mode, and the admin Routing Monitor's "why?" explanation | every real submission |

The SQL version is authoritative for live data: routing has to happen no matter
what created the request — the web app today, an email intake or an Edge
Function later — so it cannot live only in the client. The TypeScript version
stays because it is what makes the Routing Monitor able to show, per
contractor, *which rule* excluded them; a database function returning a ranked
list cannot explain itself to a UI as cheaply.

They must agree. `supabase/tests/02_rpc_test.sql` pins the SQL side's
behaviour — top-ranked contractor wins, past-due is skipped, an unmatchable
trade lands in `awaiting_contractor` — so a change to one that is not mirrored
in the other shows up as a failing test rather than as mysteriously different
routing.

```
routeOpportunity(opportunity, contractors, priorAssignments)
    ├─ evaluateContractors()   → who is eligible, and why not
    ├─ buildRoutingLadder()    → rank them, cap at 3 per trade per territory
    └─ returns the ONE contractor to offer next + the assignment record
```

**Eligibility rules** (all must pass):
1. Covers the trade
2. Serves the property's territory (derived from ZIP)
3. Account is active
4. Membership is `active` or `trial` — a `past_due` contractor stops receiving
   work automatically, with no admin involvement
5. `accepting_opportunities` toggle is on
6. Not marked `unavailable`
7. Has not already been offered this opportunity

**Ranking** is an additive score: rotation position (weighted heaviest),
historical acceptance rate, average response time, availability bonus. Additive
means a new factor (distance, star rating) is one more term, not a rewrite.

**Sequential routing** is already the model, not a future retrofit. An
opportunity is offered to exactly one contractor with an expiry timestamp. When
they decline, `declineOpportunity` calls `routeOpportunity` again and the offer
advances. `findExpiredOffers()` already identifies lapsed offers — Phase 9 only
needs to call it on a timer and feed the results back into the same function.

Every offer is recorded as an `opportunity_assignment` row, which is what makes
the admin **Routing Monitor** able to show *why* an opportunity is stuck rather
than just *that* it is.

## 4. Status handling

All statuses live in `src/data/statuses.ts` as typed records carrying a label, a
colour tone, and a description. Consequences:

- A status is never a free-text string; the type system rejects invalid values.
- The same status is the same colour on every screen, because `StatusBadge`
  looks the colour up rather than each screen choosing one.
- Renaming a user-facing label never changes the value stored in the database.

## 5. Security model

Inspection reports carry private property and transaction detail, so access is
enforced in the database, not in the browser. The route guards in
`RequireAuth` only stop honest users landing on the wrong screen; a modified
frontend still gets zero rows.

Everything below lives in `supabase/migrations/0002_rls.sql` and is verified by
`npm run db:test`.

### The design rule

**No policy queries another RLS-protected table directly.** Every cross-table
question goes through a `SECURITY DEFINER` function in the `app` schema:

```
app.my_role()              app.can_view_request(uuid)
app.is_admin()             app.can_view_opportunity(uuid)
app.my_contractor_id()     app.can_view_quote(uuid)
app.my_brokerage_id()
```

Two reasons this matters:

1. **It prevents infinite recursion.** A policy on `repair_requests` that reads
   `opportunities`, while the policy on `opportunities` reads
   `repair_requests`, recurses forever. Definer functions bypass RLS, breaking
   the cycle.
2. **It keeps each policy short enough to audit.** The rule for a table is one
   readable boolean expression rather than a nest of subqueries.

Every function is declared `STABLE` (evaluated once per statement, not once per
row) and pinned with `set search_path`, so a hostile schema on the search path
cannot hijack them.

### Who sees what

| Role | Requests | Opportunities | Quotes | Contractors |
|---|---|---|---|---|
| Agent | own only | on own requests | submitted, never drafts | only those assigned to their work |
| Broker | whole brokerage | whole brokerage | submitted, never drafts | only those assigned to brokerage work |
| Contractor | **only after accepting** | offered to them or owned | own + none of a rival's | themselves only |
| Admin | all | all | all incl. drafts | all |

### The pre-acceptance boundary

This is the rule the product depends on most, so it is enforced structurally
rather than by a filter that could be forgotten.

`app.can_view_request()` grants a contractor access only when they have an
**accepted** opportunity on that request. Before acceptance the request row —
which holds `address_line1`, `mls_number` and every `contact_*` column — is
simply not selectable by them.

What they see instead is the `public.offered_opportunities` view, which is
built from a column list that *omits* the private fields entirely. There is no
address to leak because the view has no address column. A test asserts that:

```
'pre-acceptance feed has no street address column'  →  PASS
```

Two leaks were found and fixed by writing those tests. In both cases a
contractor who accepted **one** trade at a property inherited
`can_view_request` on the parent, which then let them enumerate every *other*
trade's opportunity there — and read the full routing ladder, learning exactly
which competitors had been offered the same job. Both policies now gate that
arm on `app.my_contractor_id() is null`, so it applies to the agent/broker side
only.

### Column-level guards

RLS decides which *rows* you may touch; it cannot express which *columns* you
may change on a row you legitimately own. Two triggers cover that gap:

- `app.guard_profile_columns()` — a user cannot change their own `role`
  (self-promotion to admin), `contractor_id` or `brokerage_id`.
- `app.guard_contractor_columns()` — a contractor cannot change their own
  `membership_status`, `is_active` or routing statistics. Without this, a
  contractor could set themselves to `active` and receive opportunities without
  paying, because the matching engine trusts that column.

Both guard only **browser sessions**, decided by `app.is_browser_session()`,
which checks whether `current_user` is `authenticated` or `anon`. `current_user`
is the role a statement is executing as and cannot be forged by a client:
PostgREST connects as `authenticated`, while platform code inside a
`SECURITY DEFINER` function executes as that function's owner.

That distinction matters in both directions, and the test suite found it the
hard way. `app.route_opportunity()` has to increment `offers_received` on the
contractor it just offered work to — the platform maintaining data it owns —
while a contractor editing the same column from their browser must still be
refused. An earlier version keyed off `auth.uid() is null`, which blocked
routing outright because the agent's session id was still present.

The guard functions themselves are deliberately **not** `SECURITY DEFINER`. As
definers, `current_user` inside them would always be the owner, so
`is_browser_session()` could never return true and the guards would be silent
no-ops. They need no elevated rights: they only compare `NEW` to `OLD`.

### Sign-up cannot grant admin

`app.handle_new_user()` creates the profile when Supabase Auth creates the user.
Sign-up metadata is attacker-controlled — it is whatever the browser put in the
`signUp()` call — so the trigger whitelists `agent`, `broker` and `contractor`
and silently ignores anything else. An administrator is promoted by another
administrator.

A contractor sign-up also creates a `contractors` row as `pending_approval` and
`is_active = false`, so a new applicant cannot receive work until an admin
reviews their licence and insurance.

### Files

There is one bucket, `attachments`, and it is **private**. No object is
reachable by URL alone; the client requests a short-lived signed URL
(`signedAttachmentUrl()` in `src/services/supabase.ts`) and Supabase issues one
only if the storage policies pass.

Those policies delegate to the same `app.can_view_request()` /
`app.can_view_quote()` helpers as the table policies, so **file access and row
access can never drift apart**. A contractor who cannot read the request row
cannot read its inspection report, and both flip to allowed at the same moment.

## 6. Database schema

The schema is `supabase/migrations/0001_schema.sql`. UUID primary keys,
`created_at`/`updated_at` maintained by trigger, foreign keys throughout.

```
Reference   trades · territories · territory_zips
Identity    profiles · brokerages · brokerage_members
Network     contractors · contractor_trades · contractor_territories
Work        repair_requests · repair_items
            opportunities · opportunity_assignments
            quotes · quote_items · attachments
Support     notifications · status_history · subscriptions · support_tickets
```

Decisions worth knowing:

- **No `agents` table.** An agent is a `profile` with `role = 'agent'`. A
  separate table would duplicate identity and make changing brokerage awkward;
  `brokerage_members` carries the relationship instead.
- **`opportunity_assignments` is the routing audit trail**, not a current-
  assignee pointer. Every offer ever made is a row. That is what makes
  automatic reassignment, response-time metrics and the admin "why is this
  stuck" screen possible at all.
- **Opportunity codes are generated in the database.** A trigger builds
  `1042-P` from the request's reference number and the trade's letter, so the
  code is correct no matter what inserts the row — the web app today, an Edge
  Function tomorrow.
- **`repair_items` is unique on `(request_id, trade_key)`.** Picking plumbing
  twice for one property is a UI mistake, and the database says so.
- **Contractor statistics are denormalized** onto `contractors`. They are read
  on every routing decision and every dashboard; recomputing them from
  `opportunity_assignments` each time would be wasteful.

## 7. Automation philosophy in the code

The brief calls for a platform an owner with a full-time job can run. Concretely:

- Opportunity creation routes immediately. No admin step exists in the normal path.
- A `past_due` membership stops routing by itself; no one has to remember to switch it off.
- `findExpiredOffers()` makes lapsed offers a query, not a manual review.
- The Routing Monitor surfaces only **exceptions** — unmatched opportunities and
  coverage gaps — and explains each one, so the owner recruits for a gap rather
  than dispatching jobs.

## 8. What is intentionally not built

Homeowner payments, contractor payouts, escrow, construction contracts, project
management, CRM, QuickBooks, AI report parsing, real-time chat, native apps,
scheduling, homeowner portal. The schema does not block any of them, and none
are needed to prove the core workflow.
