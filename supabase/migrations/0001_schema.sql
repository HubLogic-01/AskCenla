-- ===========================================================================
-- AskCENLA Repair Network — 0001 schema
--
-- Creates every table, enum, index and trigger. No policies here; Row Level
-- Security lives in 0002_rls.sql so the two concerns stay readable.
--
-- Conventions:
--   * UUID primary keys (gen_random_uuid), except reference/lookup tables
--     which use stable text keys so the values are readable in the data.
--   * created_at / updated_at on every mutable table, updated_at maintained
--     by trigger rather than by application code.
--   * Foreign keys everywhere, with ON DELETE chosen per relationship.
-- ===========================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helper schema. These run as SECURITY DEFINER so RLS policies can ask
-- "who is this?" without re-triggering RLS on profiles (which would recurse).
-- ---------------------------------------------------------------------------
create schema if not exists app;

-- ---------------------------------------------------------------------------
-- Enums — the controlled vocabularies the application already relies on.
-- Mirrors src/data/statuses.ts and src/types/domain.ts exactly.
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('agent', 'broker', 'contractor', 'admin');

create type public.transaction_type as enum (
  'buyer_side', 'seller_side', 'listing_prep', 'property_owner', 'other'
);

create type public.urgency_level as enum ('emergency', 'urgent', 'standard', 'flexible');

create type public.request_status as enum (
  'draft', 'submitted', 'in_progress', 'completed', 'cancelled'
);

create type public.opportunity_status as enum (
  'new', 'matching', 'offered', 'accepted', 'declined', 'awaiting_contractor',
  'inspection_scheduled', 'quote_in_progress', 'quote_submitted',
  'quote_accepted', 'quote_declined', 'won', 'lost', 'completed', 'cancelled'
);

create type public.assignment_outcome as enum (
  'pending', 'accepted', 'declined', 'expired', 'withdrawn'
);

create type public.quote_status as enum (
  'draft', 'submitted', 'accepted', 'declined', 'expired', 'withdrawn'
);

create type public.membership_status as enum (
  'pending_approval', 'trial', 'active', 'past_due', 'cancelled'
);

create type public.availability_status as enum ('available', 'limited', 'unavailable');

create type public.attachment_kind as enum (
  'inspection_report', 'photo', 'supporting_document', 'quote_attachment'
);

create type public.notification_kind as enum (
  'opportunity_offered', 'opportunity_accepted', 'quote_submitted',
  'quote_accepted', 'quote_declined', 'reminder', 'system'
);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ===========================================================================
-- Reference data
-- ===========================================================================

create table public.trades (
  key         text primary key,
  label       text        not null,
  code        text        not null unique,
  description text        not null default '',
  sort_order  integer     not null default 0,
  is_active   boolean     not null default true
);
comment on column public.trades.code is
  'Single letter used to build opportunity codes, e.g. request 1042 + P = 1042-P.';

create table public.territories (
  id         uuid primary key default gen_random_uuid(),
  name       text        not null,
  parish     text        not null,
  state      char(2)     not null,
  is_active  boolean     not null default true,
  created_at timestamptz not null default now(),
  unique (name, state)
);

-- A ZIP belongs to exactly one territory, which is what makes territory
-- assignment on a new request a single lookup rather than a guess.
create table public.territory_zips (
  zip          char(5) primary key,
  territory_id uuid    not null references public.territories (id) on delete cascade
);
create index territory_zips_territory_idx on public.territory_zips (territory_id);

-- ===========================================================================
-- Organizations and people
-- ===========================================================================

create table public.brokerages (
  id         uuid primary key default gen_random_uuid(),
  name       text        not null,
  city       text        not null,
  state      char(2)     not null,
  phone      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger brokerages_touch before update on public.brokerages
  for each row execute function app.touch_updated_at();

create table public.contractors (
  id                      uuid primary key default gen_random_uuid(),
  business_name           text        not null,
  contact_name            text        not null,
  email                   text        not null,
  phone                   text        not null,
  address_line1           text        not null default '',
  city                    text        not null default '',
  state                   char(2)     not null default 'LA',
  zip                     char(5),
  license_number          text,
  license_expires_on      date,
  insurance_carrier       text,
  insurance_expires_on    date,
  availability            public.availability_status not null default 'available',
  membership_status       public.membership_status   not null default 'pending_approval',
  is_active               boolean     not null default false,
  accepting_opportunities boolean     not null default true,
  rotation_priority       integer     not null default 100,
  -- Denormalized counters. Cheap to read on every dashboard and every routing
  -- decision; maintained by the accept/decline RPCs in a later phase.
  offers_received         integer     not null default 0,
  offers_accepted         integer     not null default 0,
  avg_response_hours      numeric(6,2) not null default 0,
  jobs_won                integer     not null default 0,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint contractors_rotation_priority_check check (rotation_priority >= 0)
);
create trigger contractors_touch before update on public.contractors
  for each row execute function app.touch_updated_at();

-- Profiles are 1:1 with auth.users. An agent is a profile with role='agent';
-- there is deliberately no separate `agents` table, so an agent changing
-- brokerage does not duplicate their identity.
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  role          public.user_role not null default 'agent',
  full_name     text        not null default '',
  email         text        not null,
  phone         text,
  avatar_url    text,
  brokerage_id  uuid references public.brokerages (id) on delete set null,
  contractor_id uuid references public.contractors (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- A contractor profile must point at a contractor record, and only a
  -- contractor profile may.
  constraint profiles_contractor_link_check check (
    (role = 'contractor' and contractor_id is not null)
    or (role <> 'contractor' and contractor_id is null)
  )
);
create index profiles_brokerage_idx  on public.profiles (brokerage_id);
create index profiles_contractor_idx on public.profiles (contractor_id);
create trigger profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();

-- Many-to-many so brokerage membership has its own history and a broker can
-- oversee more than one office.
create table public.brokerage_members (
  brokerage_id      uuid not null references public.brokerages (id) on delete cascade,
  profile_id        uuid not null references public.profiles (id)   on delete cascade,
  role_in_brokerage text not null default 'agent',
  created_at        timestamptz not null default now(),
  primary key (brokerage_id, profile_id)
);
create index brokerage_members_profile_idx on public.brokerage_members (profile_id);

create table public.contractor_trades (
  contractor_id uuid not null references public.contractors (id) on delete cascade,
  trade_key     text not null references public.trades (key)     on delete restrict,
  primary key (contractor_id, trade_key)
);
create index contractor_trades_trade_idx on public.contractor_trades (trade_key);

create table public.contractor_territories (
  contractor_id uuid not null references public.contractors (id)  on delete cascade,
  territory_id  uuid not null references public.territories (id)  on delete cascade,
  primary key (contractor_id, territory_id)
);
create index contractor_territories_territory_idx on public.contractor_territories (territory_id);

-- ===========================================================================
-- Repair requests — the parent property / transaction record
-- ===========================================================================

-- Human-facing reference numbers continue from the Phase 1 demo data.
create sequence public.repair_request_reference_seq start with 1048;

create table public.repair_requests (
  id               uuid primary key default gen_random_uuid(),
  reference        bigint      not null unique default nextval('public.repair_request_reference_seq'),
  created_by       uuid        not null references public.profiles (id) on delete restrict,
  brokerage_id     uuid references public.brokerages (id) on delete set null,
  address_line1    text        not null,
  city             text        not null,
  state            char(2)     not null,
  zip              char(5)     not null,
  territory_id     uuid references public.territories (id) on delete set null,
  mls_number       text,
  transaction_type public.transaction_type not null default 'buyer_side',
  status           public.request_status   not null default 'draft',
  contact_name     text        not null,
  contact_brokerage text       not null default '',
  contact_phone    text        not null default '',
  contact_email    text        not null default '',
  submitted_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index repair_requests_created_by_idx  on public.repair_requests (created_by);
create index repair_requests_brokerage_idx   on public.repair_requests (brokerage_id);
create index repair_requests_status_idx      on public.repair_requests (status);
create trigger repair_requests_touch before update on public.repair_requests
  for each row execute function app.touch_updated_at();

create table public.repair_items (
  id                uuid primary key default gen_random_uuid(),
  request_id        uuid not null references public.repair_requests (id) on delete cascade,
  trade_key         text not null references public.trades (key) on delete restrict,
  description       text not null,
  urgency           public.urgency_level not null default 'standard',
  estimate_deadline date,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- One line per trade per property; picking plumbing twice is a UI mistake.
  unique (request_id, trade_key)
);
create index repair_items_request_idx on public.repair_items (request_id);
create trigger repair_items_touch before update on public.repair_items
  for each row execute function app.touch_updated_at();

-- ===========================================================================
-- Opportunities — one per repair item, routed independently
-- ===========================================================================

create table public.opportunities (
  id               uuid primary key default gen_random_uuid(),
  code             text        not null unique,
  request_id       uuid        not null references public.repair_requests (id) on delete cascade,
  repair_item_id   uuid        not null unique references public.repair_items (id) on delete cascade,
  trade_key        text        not null references public.trades (key) on delete restrict,
  territory_id     uuid references public.territories (id) on delete set null,
  status           public.opportunity_status not null default 'new',
  contractor_id    uuid references public.contractors (id) on delete set null,
  routing_position integer     not null default 0,
  offered_at       timestamptz,
  offer_expires_at timestamptz,
  accepted_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index opportunities_request_idx    on public.opportunities (request_id);
create index opportunities_contractor_idx on public.opportunities (contractor_id);
create index opportunities_status_idx     on public.opportunities (status);
-- Supports the Phase 9 scheduled job that expires stale offers.
create index opportunities_expiry_idx     on public.opportunities (offer_expires_at)
  where status = 'offered';
create trigger opportunities_touch before update on public.opportunities
  for each row execute function app.touch_updated_at();

-- Builds "1042-P" from the request reference and the trade's letter code.
create or replace function app.set_opportunity_code()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reference bigint;
  v_code      text;
begin
  if new.code is not null and new.code <> '' then
    return new;
  end if;
  select reference into v_reference from public.repair_requests where id = new.request_id;
  select code      into v_code      from public.trades          where key = new.trade_key;
  new.code := v_reference || '-' || v_code;
  return new;
end;
$$;

create trigger opportunities_set_code before insert on public.opportunities
  for each row execute function app.set_opportunity_code();

-- Every offer is a row. Keeping the whole ladder (not just the current
-- assignee) is what makes automatic reassignment, response-time metrics and
-- the admin "why is this stuck" view possible.
create table public.opportunity_assignments (
  id             uuid primary key default gen_random_uuid(),
  opportunity_id uuid    not null references public.opportunities (id) on delete cascade,
  contractor_id  uuid    not null references public.contractors (id)   on delete cascade,
  position       integer not null default 0,
  outcome        public.assignment_outcome not null default 'pending',
  offered_at     timestamptz not null default now(),
  responded_at   timestamptz,
  expires_at     timestamptz not null,
  -- A contractor is never offered the same opportunity twice.
  unique (opportunity_id, contractor_id)
);
create index opportunity_assignments_contractor_idx on public.opportunity_assignments (contractor_id);
create index opportunity_assignments_opportunity_idx on public.opportunity_assignments (opportunity_id);
-- Supports the scheduled sweep for lapsed offers.
create index opportunity_assignments_pending_idx on public.opportunity_assignments (expires_at)
  where outcome = 'pending';

-- ===========================================================================
-- Quotes
-- ===========================================================================

create table public.quotes (
  id             uuid primary key default gen_random_uuid(),
  quote_number   text        not null,
  opportunity_id uuid        not null references public.opportunities (id) on delete cascade,
  contractor_id  uuid        not null references public.contractors (id)   on delete cascade,
  status         public.quote_status not null default 'draft',
  notes          text,
  exclusions     text,
  tax_rate       numeric(5,2) not null default 0,
  expires_on     date,
  submitted_at   timestamptz,
  decided_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint quotes_tax_rate_check check (tax_rate >= 0 and tax_rate <= 100)
);
create unique index quotes_number_idx on public.quotes (quote_number);
create index quotes_opportunity_idx on public.quotes (opportunity_id);
create index quotes_contractor_idx  on public.quotes (contractor_id);
create trigger quotes_touch before update on public.quotes
  for each row execute function app.touch_updated_at();

create table public.quote_items (
  id          uuid primary key default gen_random_uuid(),
  quote_id    uuid    not null references public.quotes (id) on delete cascade,
  position    integer not null default 0,
  description text    not null default '',
  quantity    numeric(10,2) not null default 1,
  unit_price  numeric(12,2) not null default 0,
  created_at  timestamptz not null default now(),
  constraint quote_items_quantity_check   check (quantity >= 0),
  constraint quote_items_unit_price_check check (unit_price >= 0)
);
create index quote_items_quote_idx on public.quote_items (quote_id);

-- ===========================================================================
-- Attachments
-- ===========================================================================

create table public.attachments (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid references public.repair_requests (id) on delete cascade,
  quote_id     uuid references public.quotes (id)          on delete cascade,
  kind         public.attachment_kind not null,
  file_name    text        not null,
  -- Path inside the PRIVATE storage bucket. Never a public URL: access is
  -- always through a short-lived signed URL issued to an authorised user.
  storage_path text        not null unique,
  mime_type    text        not null default 'application/octet-stream',
  size_bytes   bigint      not null default 0,
  uploaded_by  uuid        not null references public.profiles (id) on delete restrict,
  created_at   timestamptz not null default now(),
  -- An attachment hangs off exactly one parent.
  constraint attachments_parent_check check (
    (request_id is not null and quote_id is null)
    or (request_id is null and quote_id is not null)
  )
);
create index attachments_request_idx on public.attachments (request_id);
create index attachments_quote_idx   on public.attachments (quote_id);

-- ===========================================================================
-- Notifications, audit, billing, support
-- ===========================================================================

create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid        not null references public.profiles (id) on delete cascade,
  kind         public.notification_kind not null,
  title        text        not null,
  body         text        not null default '',
  link         text,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx    on public.notifications (recipient_id) where read_at is null;

create table public.status_history (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('repair_request', 'opportunity', 'quote')),
  entity_id   uuid not null,
  from_status text,
  to_status   text not null,
  actor_id    uuid references public.profiles (id) on delete set null,
  note        text,
  created_at  timestamptz not null default now()
);
create index status_history_entity_idx on public.status_history (entity_type, entity_id, created_at desc);

create table public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  contractor_id          uuid not null unique references public.contractors (id) on delete cascade,
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  status                 text not null default 'incomplete',
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function app.touch_updated_at();

create table public.support_tickets (
  id         uuid primary key default gen_random_uuid(),
  opened_by  uuid not null references public.profiles (id) on delete cascade,
  subject    text not null,
  body       text not null default '',
  status     text not null default 'open' check (status in ('open', 'pending', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_tickets_opened_by_idx on public.support_tickets (opened_by);
create trigger support_tickets_touch before update on public.support_tickets
  for each row execute function app.touch_updated_at();
