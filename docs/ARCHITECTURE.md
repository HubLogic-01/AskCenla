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
        │  reads via useData() / useAuth()
        ▼
   State  (src/app/providers/**)    "the operations the product supports"
        │  calls
        ▼
   Logic  (src/lib/**)              "pure rules — matching, totals, filters"
```

**This layering is the most important decision in the codebase**, because it is
what makes Phase 2 cheap.

- No screen imports the demo dataset directly. Every read and write goes through
  `useData()`.
- `DataProvider` exposes *operations*, not tables: `submitRepairRequest`,
  `acceptOpportunity`, `declineOpportunity`, `submitQuote`, `decideQuote`.
  These names are already the names of the database operations that will replace
  them.
- The rules that matter — who gets an opportunity, what a quote totals, what
  counts as "open" — are pure functions in `src/lib/`. They have no React and no
  database dependency, so the same `routeOpportunity()` can later run inside a
  Supabase Edge Function or a scheduled job without being rewritten.

**Swapping in Supabase means rewriting the bodies of about a dozen functions in
`DataProvider.tsx` and `AuthProvider.tsx`. No screen changes.**

## 3. The matching engine (`src/lib/matching.ts`)

The most important business logic in the product, and deliberately the most
isolated.

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

The current route guards (`RequireAuth`) are **convenience, not security** —
they stop honest users landing on the wrong screen. Real enforcement lands in
Phase 2 as Row Level Security, so that a modified frontend still cannot read
another party's data.

The UI is already written so the RLS policies are a direct translation:

| UI behaviour today | Phase 2 RLS policy |
|---|---|
| `requestsForAgent()` filters to `created_by = me` | `repair_requests` SELECT: `created_by = auth.uid()` |
| `requestsForBrokerage()` | SELECT where the request's brokerage matches the viewer's brokerage membership |
| `opportunitiesForContractor()` returns only offered-or-accepted rows | `opportunities` SELECT: an `opportunity_assignments` row exists for my contractor id, or `contractor_id = my contractor id` |
| Opportunity cards mask address and agent contact until acceptance | The pre-acceptance view is a restricted **view** exposing only trade, city, ZIP and scope |
| Attachments render from `storage_path`, never a URL | Private Storage bucket + `createSignedUrl(path, 60)` issued only to authorised users |

Inspection reports are treated as sensitive throughout: they are never given a
public permanent URL, in the prototype or the plan.

## 6. Planned database schema

UUID primary keys, `created_at`/`updated_at` on every table, foreign keys
throughout. `src/types/domain.ts` is already written to these shapes.

```
profiles            id (= auth.users.id), role, full_name, email, phone,
                    brokerage_id →brokerages, contractor_id →contractors
brokerages          id, name, city, state, phone
brokerage_members   brokerage_id, profile_id, role_in_brokerage
                      (join table so an agent can move brokerages without
                       rewriting history)

trades              key (PK), label, code, description
territories         id, name, parish, state
territory_zips      territory_id, zip          (a ZIP maps to one territory)
contractors         id, business_name, contact_name, email, phone, address,
                    license_*, insurance_*, availability, membership_status,
                    is_active, accepting_opportunities, rotation_priority
contractor_trades   contractor_id, trade_key
contractor_territories contractor_id, territory_id

repair_requests     id, reference (serial), created_by →profiles,
                    brokerage_id, address, city, state, zip, mls_number,
                    transaction_type, status, contact_*, submitted_at
repair_items        id, request_id →repair_requests, trade_key, description,
                    urgency, estimate_deadline, notes
attachments         id, request_id, quote_id, kind, file_name, storage_path,
                    mime_type, size_bytes, uploaded_by

opportunities       id, code, request_id, repair_item_id, trade_key,
                    territory_id, status, contractor_id, routing_position,
                    offered_at, offer_expires_at, accepted_at
opportunity_assignments
                    id, opportunity_id, contractor_id, position, outcome,
                    offered_at, responded_at, expires_at

quotes              id, quote_number, opportunity_id, contractor_id, status,
                    notes, exclusions, tax_rate, expires_on, submitted_at,
                    decided_at
quote_items         id, quote_id, position, description, quantity, unit_price

notifications       id, recipient_id, kind, title, body, link, read_at
status_history      id, entity_type, entity_id, from_status, to_status,
                    actor_id, note
subscriptions       id, contractor_id, stripe_customer_id,
                    stripe_subscription_id, status, current_period_end
support_tickets     id, opened_by, subject, body, status
```

Two deliberate improvements over the original sketch:

1. **No separate `agents` table.** An agent is a `profile` with `role = 'agent'`.
   A separate table would duplicate identity and make brokerage moves awkward.
   `brokerage_members` handles the many-to-many relationship instead.
2. **`opportunity_assignments` is the routing audit trail**, not just a current
   assignment pointer. Keeping every offer is what makes automatic reassignment,
   response-time metrics, and the "why is this stuck" screen possible.

`status_history` exists so status changes are auditable — valuable when a
transaction is disputed weeks later.

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
