# AskCENLA Repair Network

A repair-request workflow platform for real estate agents, brokers, and local
contractors in Central Louisiana.

An agent submits **one** property repair request with the inspection report
attached. The platform splits it into **separate, independently routed
opportunities** — one per trade — and offers each to a vetted local contractor
in rotation.

```
Property Request #1042  ──►  1042-P  Plumbing
123 Main Street              1042-E  Electrical
Alexandria, LA               1042-R  Roofing
                             1042-H  HVAC
```

---

## Run it locally

You need **Node.js 20 or newer**. Check with `node -v`. If you do not have it,
install from <https://nodejs.org> (take the LTS version).

Open a terminal in this folder and run:

```bash
npm install     # once, to download dependencies
npm run dev     # starts the development server
```

The terminal prints a line like:

```
  ➜  Local:   http://localhost:5173/
```

Open **http://localhost:5173/** in your browser. Press `Ctrl+C` in the terminal
to stop the server.

### Signing in to the demo

Click **Sign in**, then pick one of the four demo accounts at the bottom of the
page. Password is not checked in Phase 1.

| Account | Role | What to look at |
|---|---|---|
| Danielle Ortiz | Agent | Dashboard, property #1042, the 5-step new-request wizard |
| Jerry Wiley | Contractor | Two pending offers, accept/decline, the quote builder |
| Renee Guillory | Broker | Brokerage-wide property and opportunity table |
| AskCENLA Admin | Admin | Marketplace metrics, contractor management, routing monitor |

The best way to see what the product actually does: sign in as **Danielle**,
create a new repair request picking three or four trades, then sign in as
**AskCENLA Admin** and open the **Routing Monitor** to see where each one went.

Demo data lives in memory. Refreshing the browser resets it to the seeded state.

### Other commands

```bash
npm run build      # production build into dist/
npm run preview    # serve the production build locally
npm run typecheck  # TypeScript check, no output
npm run db:test    # apply migrations to a local database and test the RLS rules
npm run db:types   # regenerate src/types/database.ts from your live schema
```

---

## Connecting Supabase (Phase 2)

Without a `.env` file the app runs on demo data and everything works — the
sidebar shows a **DEMO DATA** badge so you always know which mode you are in.
To connect a real database:

### 1. Create the project (in your browser)

1. Go to <https://supabase.com> and create a free account.
2. **New project**. Pick a name, a strong database password (save it somewhere),
   and the region closest to Louisiana — `us-east-1` is fine.
3. Wait about two minutes for it to finish provisioning.

### 2. Copy your credentials

In the project, go to **Project Settings → API** and copy:

- **Project URL**
- the **`anon` `public`** key — *not* the `service_role` key

Then, in a terminal in this folder:

```bash
cp .env.example .env
```

Open `.env` and paste the two values in:

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

> The `anon` key is meant to be public — it is protected by the Row Level
> Security policies in `supabase/migrations`. The `service_role` key bypasses
> those policies entirely and must never go in this file or in any code.

### 3. Create the schema

In the Supabase dashboard, open the **SQL Editor** and run these files **in
order**, pasting the contents of each and clicking *Run*:

| Order | File | What it does |
|---|---|---|
| 1 | `supabase/migrations/0001_schema.sql` | Tables, enums, indexes, triggers |
| 2 | `supabase/migrations/0002_rls.sql` | Row Level Security policies |
| 3 | `supabase/migrations/0003_storage.sql` | The private `attachments` bucket |
| 4 | `supabase/migrations/0004_auth.sql` | Creates a profile on sign-up |
| 5 | `supabase/migrations/0005_reference_data.sql` | Trades and territories |
| 6 | `supabase/migrations/0006_functions.sql` | Request submission + the routing engine |
| 7 | `supabase/migrations/0007_routing_automation.sql` | Auto-routing, the expiry sweep, status history |
| 8 | `supabase/migrations/0008_contractor_actions.sql` | Contractor accept / decline / admin re-route |
| 9 | `supabase/migrations/0009_quotes.sql` | Quote drafting, submission and acceptance |
| 10 | `supabase/migrations/0010_admin.sql` | Contractor approval, trades/territories, metrics view |
| 11 | `supabase/migrations/0011_email_delivery.sql` | Email queue, preferences, owner digest |
| 12 | `supabase/migrations/0012_email_schedule.sql` | Schedules the email worker |
| 13 | `supabase/migrations/0013_billing.sql` | Stripe subscriptions and membership |

Do **not** run `supabase/tests/00_local_harness.sql` — that file only exists to
fake Supabase's own `auth` and `storage` schemas when testing on a plain
PostgreSQL server, and your project already has the real ones.

Optionally run `supabase/seed.sql` too. It creates the demo marketplace and
four working sign-in accounts (password `askcenla-demo`) so the dashboards have
something to show. Skip it if you want to start empty.

### 4. Restart the dev server

```bash
npm run dev
```

The **DEMO DATA** badge disappears once Supabase is connected.

### 5. Turn on the scheduled sweep

Routing offers each opportunity to one contractor at a time, with a 24-hour
window to respond. A scheduled job advances lapsed offers to the next
contractor — that is what makes the platform run without you.

It needs the `pg_cron` extension, which is off by default:

1. **Database → Extensions**, search `pg_cron`, enable it.
2. Re-run `supabase/migrations/0007_routing_automation.sql`. It is safe to run
   again, and this time it schedules the job instead of printing a notice.

Check it took with:

```sql
select jobname, schedule, active from cron.job;
```

If you skip this, nothing breaks — offers simply never expire on their own, and
an admin advances them with **Run sweep now** on the Routing Monitor.

### 6. Turn on email (optional)

Everything works without this — notifications appear in the app either way.
Email is what reaches a contractor on a roof and an owner who is not looking at
the dashboard.

**What you need:** an account at [Resend](https://resend.com) (free tier is
plenty to start) with a verified sending domain, and the
[Supabase CLI](https://supabase.com/docs/guides/cli) installed.

1. **Enable two extensions** — Database → Extensions → enable `pg_cron` and
   `pg_net`.

2. **Run the two migrations** (`0011` and `0012`) in the SQL Editor if you have
   not already.

3. **Deploy the worker:**

   ```bash
   supabase login
   supabase link --project-ref YOUR-PROJECT-REF
   supabase functions deploy send-notifications --no-verify-jwt
   ```

   `--no-verify-jwt` is deliberate: the database's scheduler calls this, not a
   signed-in user, so it authenticates on a shared secret instead.

4. **Give it its secrets.** Pick any long random string for `CRON_SECRET`:

   ```bash
   supabase secrets set \
     RESEND_API_KEY=re_xxxxxxxx \
     CRON_SECRET=some-long-random-string \
     EMAIL_FROM="AskCENLA <notifications@yourdomain.com>" \
     APP_URL=https://your-site.netlify.app \
     OWNER_EMAIL=you@yourdomain.com
   ```

   The service-role key is provided to the function automatically and never
   goes into the database.

5. **Point the schedule at it.** In the SQL Editor, with the same secret:

   ```sql
   update app.settings set value = 'https://YOUR-PROJECT-REF.functions.supabase.co'
     where key = 'edge_function_url';
   update app.settings set value = 'some-long-random-string'
     where key = 'cron_secret';
   ```

6. **Check it.** `select jobname, schedule, active from cron.job;` should list
   three `askcenla-email-*` jobs. To send immediately rather than waiting for
   the next tick:

   ```sql
   select app.invoke_email_worker('immediate');
   ```

Three schedules run: pending notifications every 5 minutes, daily summaries at
07:00 UTC, and your own digest of things needing attention at 12:30 UTC. Each
person chooses immediate, daily or in-app-only from the notifications menu.

### 7. Turn on billing (optional)

Contractors can use the platform without this; they just cannot subscribe.
Membership status is already what decides who receives work, so connecting
Stripe is the last wire rather than a rewrite.

**What you need:** a [Stripe](https://stripe.com) account. Do all of this in
**test mode** first — the toggle is in the Stripe dashboard.

1. **Create the product.** Stripe → Product catalogue → add a product,
   "AskCENLA Repair Network Membership", recurring, $199/month. Copy the
   **price ID** (`price_...`).

2. **Run migration `0013`** in the SQL Editor if you have not already.

3. **Deploy both functions:**

   ```bash
   supabase functions deploy stripe-billing
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```

   Only the webhook uses `--no-verify-jwt`, because Stripe does not send a
   Supabase token — it authenticates by signature instead. The checkout
   function keeps JWT verification, since the caller's identity is the whole
   point.

4. **Add the webhook in Stripe.** Developers → Webhooks → add endpoint:

   ```
   https://YOUR-PROJECT-REF.functions.supabase.co/stripe-webhook
   ```

   Select these events:
   `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.paid`,
   `invoice.payment_failed`, `checkout.session.completed`.
   Copy the **signing secret** (`whsec_...`).

5. **Give the functions their secrets:**

   ```bash
   supabase secrets set \
     STRIPE_SECRET_KEY=sk_test_xxx \
     STRIPE_PRICE_ID=price_xxx \
     STRIPE_WEBHOOK_SECRET=whsec_xxx \
     APP_URL=https://your-site.netlify.app
   ```

6. **Try it.** Sign in as a contractor → Membership → Start membership. Use
   Stripe's test card `4242 4242 4242 4242`, any future expiry, any CVC.

To check a failed payment does what it should, use `4000 0000 0000 0341` (it
succeeds then fails on renewal), or trigger it directly:

```bash
stripe trigger invoice.payment_failed
```

The contractor should move to **Past Due**, stop receiving opportunities, and
be told why — while work they already accepted is untouched.

> Only the **publishable** key would ever go in `.env`, and this build does not
> need one: the browser never talks to Stripe directly, it is redirected to a
> Checkout session created server-side. The secret key lives only in the Edge
> Function's environment.

### 8. Create your admin account

Sign up through the app, then in the SQL Editor run:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

Sign-up deliberately cannot grant the admin role — the trigger in
`0004_auth.sql` ignores any role in the sign-up data except agent, broker and
contractor, so nobody can make themselves an administrator from the browser.

### Prefer the CLI?

If you have the Supabase CLI installed, `supabase link --project-ref <ref>`
followed by `supabase db push` applies the same migrations, and
`supabase db reset` rebuilds a local database and runs `seed.sql` for you.

---

## Verifying the security rules

Inspection reports contain private property and transaction information, so
the access rules are tested rather than assumed:

```bash
npm run db:test
```

This builds a throwaway PostgreSQL database, applies every migration and the
seed, then signs in as each demo user and asserts exactly what they can and
cannot read, what happens when they submit a repair request, and what the
automation does when nobody is watching — 241 assertions covering agent,
broker, contractor and admin.

It needs a local PostgreSQL server (`psql`, `createdb`) but **not** a Supabase
project: `supabase/tests/00_local_harness.sql` stubs the pieces of Supabase the
migrations depend on. Point it at any database with
`DATABASE_URL=postgres://... npm run db:test`.

Among the things it proves:

- an agent cannot see another agent's property or inspection report
- a contractor sees a property's address, the agent's contact details and the
  inspection report **only after accepting** that trade
- a contractor cannot see who else was offered the same job
- neither side can read the other's unsent quote drafts
- a user cannot promote themselves to admin, and a contractor cannot mark their
  own membership active
- a submitted request creates exactly one routed opportunity per trade, and
  ownership comes from the session rather than the payload
- routing skips a past-due contractor with no admin involvement
- a lapsed offer advances to the next contractor, and a lapsed offer on a job
  someone already accepted is left alone
- exhausting the contractor ladder notifies the agent and the platform owner,
  once, not once per sweep
- a contractor cannot accept an offer made to someone else, accept the same job
  twice, or re-route work — and an accepted job cannot be pulled out from under
  them by an admin
- an opportunity is never live with two contractors at once
- a contractor cannot edit a quote after sending it, and cannot accept their
  own pricing; an agent cannot decide on a quote for someone else's property
- only an administrator can approve a contractor or change a membership status,
  and marketplace metrics return nothing at all to anyone else
- an email is never sent twice, a transient failure is retried, a permanently
  bad address stops consuming the queue, and a message stranded by a crashed
  worker is picked back up
- a redelivered Stripe webhook is applied once, an out-of-order one is ignored,
  a failed payment pauses routing without cancelling, and paying does not
  activate a contractor who has not been approved

---

## Deploying to Netlify

`netlify.toml` is already configured (build command, publish directory, and the
SPA redirect that stops deep links from 404-ing).

1. Push this repository to GitHub.
2. In Netlify: **Add new site → Import an existing project**, pick the repo.
3. Netlify reads `netlify.toml`, so accept the defaults and deploy.
4. When Supabase is connected (Phase 2), add the environment variables from
   `.env.example` under **Site configuration → Environment variables**.

---

## Project layout

```
src/
├── app/                    Application wiring
│   ├── App.tsx             Providers + router
│   ├── router.tsx          All routes, grouped by role
│   └── providers/          AuthProvider, DataProvider
├── components/
│   ├── ui/                 Generic primitives (Button, Card, Badge, Field…)
│   ├── layout/             AppShell, Sidebar, Topbar, PageHeader, RequireAuth
│   └── shared/             Cross-role domain components (QuoteDocument…)
├── features/               One folder per area of the product
│   ├── marketing/          Public landing page
│   ├── auth/               Sign in / sign up
│   ├── agent/              Dashboard, properties, wizard, quote views
│   ├── contractor/         Dashboard, opportunities, quote builder, profile
│   ├── broker/             Brokerage overview
│   └── admin/              Marketplace, contractors, routing monitor, users
├── data/                   Trade catalogue, status vocabulary, demo dataset
├── lib/                    matching.ts, selectors.ts, format.ts, quotes.ts
├── services/               The data seam
│   ├── repository.ts       The interface every screen ultimately talks to
│   ├── mockRepository.ts   In-memory demo data
│   ├── supabaseRepository.ts  Real queries + the submit RPC + file upload
│   └── supabase.ts         Client, config detection, signed URLs
├── types/                  Domain model + database row types
└── styles/                 Design tokens + component CSS

supabase/
├── migrations/             Schema, RLS, storage, auth trigger, reference data
├── seed.sql                Demo marketplace + four sign-in accounts
└── tests/                  Local harness + the 42-assertion RLS test suite
```

Full reasoning behind these choices is in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), and the phase plan is in
[`docs/ROADMAP.md`](docs/ROADMAP.md).

---

## Current status

**Phases 1 and 2 are complete.**

- **Phase 1** — the full product surface running on demo data: role-based
  routing, four dashboards, the multi-trade request wizard, contractor
  accept/decline, the quote builder, and the admin routing monitor.
- **Phase 2** — the database: schema, Row Level Security, the private storage
  bucket, the sign-up trigger, and real Supabase authentication. All 42 RLS
  assertions pass.

- **Phase 3** — the data seam. Every read and write goes through a repository
  with two interchangeable implementations, so the app runs identically on demo
  data or on Supabase. The agent's dashboards read from real queries, the
  wizard submits through one transactional Postgres function that also routes
  every trade, and inspection reports upload to the private bucket and open
  through expiring signed URLs.

- **Phase 4** — routing automation. Opportunities route themselves on creation,
  lapsed offers advance on a schedule, exhausting the contractor ladder tells
  the agent and the platform owner, every status change is recorded, and a
  request's status follows its trades instead of saying "Submitted" forever.

- **Phase 5** — the contractor side. Accept, decline and the admin re-route are
  server-side functions that verify the caller holds the offer and lock the row
  so a decline and the scheduled sweep cannot both advance the same job.
  Response times feed back into the routing score.

- **Phase 6** — quotes. Drafting, saving, submitting and deciding are each one
  transactional operation; quotes carry private attachments; and either side
  can print a clean PDF of the quote straight from the browser.

- **Phase 8** — administration. Contractor approval, trades and territories,
  marketplace metrics counted in the database rather than in the browser, and
  an activity timeline showing what the routing engine did on its own.

**Every screen now works against a real database.** What remains is
notifications by email and Stripe billing — see
[`docs/ROADMAP.md`](docs/ROADMAP.md).

Never commit credentials. `.env` is git-ignored; `.env.example` documents the
variables without values.
