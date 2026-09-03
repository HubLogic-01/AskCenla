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
```

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
├── types/                  Domain model (mirrors the planned database schema)
└── styles/                 Design tokens + component CSS
```

Full reasoning behind these choices is in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), and the phase plan is in
[`docs/ROADMAP.md`](docs/ROADMAP.md).

---

## Current status

**Phase 1 is complete.** The application runs end to end on demo data:
authentication structure, role-based routing, all four dashboards, the
multi-trade request wizard with opportunity generation, contractor
accept/decline, the quote builder, and the admin routing monitor.

**No backend is connected yet.** Phase 2 replaces the in-memory store with
Supabase — see the roadmap.

Never commit credentials. `.env` is git-ignored; `.env.example` documents the
variables without values.
