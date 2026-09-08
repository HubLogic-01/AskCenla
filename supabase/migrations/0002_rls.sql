-- ===========================================================================
-- AskCENLA Repair Network — 0002 Row Level Security
--
-- THE DESIGN RULE IN THIS FILE:
--   No policy queries another RLS-protected table directly. Every cross-table
--   question is asked through a SECURITY DEFINER function in the `app` schema.
--
-- Why: a policy on repair_requests that reads opportunities, while the policy
-- on opportunities reads repair_requests, recurses forever. Routing every
-- cross-table check through a definer function breaks the cycle and keeps each
-- policy short enough to read and audit.
--
-- The frontend filters in src/lib/selectors.ts mirror these rules, but the
-- frontend is convenience only. THIS file is the enforcement.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Identity helpers. STABLE so they are evaluated once per statement, not once
-- per row. SECURITY DEFINER so reading profiles here does not re-enter RLS.
-- `set search_path` on every definer function prevents search-path hijacking.
-- ---------------------------------------------------------------------------

create or replace function app.my_role()
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function app.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$$;

create or replace function app.my_contractor_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select contractor_id from public.profiles where id = auth.uid();
$$;

create or replace function app.my_brokerage_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select brokerage_id from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Visibility helpers — the actual access rules of the product.
-- ---------------------------------------------------------------------------

-- A repair request is visible to: the agent who created it, a broker at the
-- owning brokerage, a contractor who has ACCEPTED one of its opportunities,
-- and admins. Note the contractor arm requires an accepted opportunity, not
-- merely an offered one: that is what keeps the address, the agent's contact
-- details and the inspection report hidden before acceptance.
create or replace function app.can_view_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.repair_requests r
    where r.id = p_request_id
      and (
        app.is_admin()
        or r.created_by = auth.uid()
        or (app.my_role() = 'broker'
            and r.brokerage_id is not null
            and r.brokerage_id = app.my_brokerage_id())
        or exists (
          select 1
          from public.opportunities o
          where o.request_id = r.id
            and o.contractor_id is not null
            and o.contractor_id = app.my_contractor_id()
        )
      )
  );
$$;

-- An opportunity row itself carries no private property information (code,
-- trade, territory, status), so a contractor may see one that is currently
-- OFFERED to them as well as one they own.
create or replace function app.can_view_opportunity(p_opportunity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.opportunities o
    where o.id = p_opportunity_id
      and (
        app.is_admin()
        or (o.contractor_id is not null and o.contractor_id = app.my_contractor_id())
        or exists (
          select 1
          from public.opportunity_assignments a
          where a.opportunity_id = o.id
            and a.contractor_id = app.my_contractor_id()
            and a.outcome = 'pending'
        )
        -- Agent / broker / admin arm only. Without the contractor_id guard, a
        -- contractor who accepted ONE trade at a property could enumerate every
        -- other trade's opportunity there, because accepting also grants them
        -- can_view_request on the parent. A contractor sees what they were
        -- offered and what they own, and nothing else.
        or (app.my_contractor_id() is null and app.can_view_request(o.request_id))
      )
  );
$$;

-- A quote is visible to its author and to admins at any status. Agents and
-- brokers see it only once it has actually been sent: a contractor's DRAFT is
-- never readable by the other side.
create or replace function app.can_view_quote(p_quote_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.quotes q
    where q.id = p_quote_id
      and (
        app.is_admin()
        or q.contractor_id = app.my_contractor_id()
        or (q.status <> 'draft' and app.can_view_opportunity(q.opportunity_id))
      )
  );
$$;

grant usage on schema app to authenticated, service_role;
grant execute on all functions in schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Privilege-escalation guards.
--
-- RLS decides which ROWS you may touch. These triggers decide which COLUMNS
-- you may change on a row you already own — the part RLS alone cannot express.
-- ---------------------------------------------------------------------------

-- Without this, any user could UPDATE their own profile row and set
-- role = 'admin', because the row is legitimately theirs.
create or replace function app.guard_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- No JWT means this is server-side code: a migration, the SQL editor, an
  -- Edge Function, or the Stripe webhook using the service_role key. Those are
  -- already trusted. The guard exists to constrain BROWSER sessions, and a
  -- browser session always carries a JWT (without one it is `anon`, which has
  -- no table grants at all).
  if auth.uid() is null or app.is_admin() then
    return new;
  end if;
  if new.role is distinct from old.role then
    raise exception 'Only an administrator may change a profile role';
  end if;
  if new.contractor_id is distinct from old.contractor_id then
    raise exception 'Only an administrator may change the linked contractor';
  end if;
  if new.brokerage_id is distinct from old.brokerage_id then
    raise exception 'Only an administrator may change the linked brokerage';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_columns before update on public.profiles
  for each row execute function app.guard_profile_columns();

-- Without this, a contractor could set their own membership_status to
-- 'active' and receive opportunities without paying — the matching engine
-- trusts this column.
create or replace function app.guard_contractor_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- See app.guard_profile_columns(): server-side callers have no JWT.
  if auth.uid() is null or app.is_admin() then
    return new;
  end if;
  if new.membership_status is distinct from old.membership_status then
    raise exception 'Only an administrator may change membership status';
  end if;
  if new.is_active is distinct from old.is_active then
    raise exception 'Only an administrator may activate or deactivate an account';
  end if;
  if new.rotation_priority is distinct from old.rotation_priority
     or new.offers_received  is distinct from old.offers_received
     or new.offers_accepted  is distinct from old.offers_accepted
     or new.jobs_won         is distinct from old.jobs_won
     or new.avg_response_hours is distinct from old.avg_response_hours then
    raise exception 'Routing statistics are maintained by the platform';
  end if;
  return new;
end;
$$;

create trigger contractors_guard_columns before update on public.contractors
  for each row execute function app.guard_contractor_columns();

-- ---------------------------------------------------------------------------
-- Enable RLS on EVERY table. A table with RLS enabled and no policy denies
-- all access, which is the safe default if a policy below is ever removed.
-- ---------------------------------------------------------------------------
alter table public.trades                  enable row level security;
alter table public.territories             enable row level security;
alter table public.territory_zips          enable row level security;
alter table public.brokerages              enable row level security;
alter table public.brokerage_members       enable row level security;
alter table public.contractors             enable row level security;
alter table public.contractor_trades       enable row level security;
alter table public.contractor_territories  enable row level security;
alter table public.profiles                enable row level security;
alter table public.repair_requests         enable row level security;
alter table public.repair_items            enable row level security;
alter table public.opportunities           enable row level security;
alter table public.opportunity_assignments enable row level security;
alter table public.quotes                  enable row level security;
alter table public.quote_items             enable row level security;
alter table public.attachments             enable row level security;
alter table public.notifications           enable row level security;
alter table public.status_history          enable row level security;
alter table public.subscriptions           enable row level security;
alter table public.support_tickets         enable row level security;

-- ===========================================================================
-- Reference data — readable by every signed-in user, writable by admins.
-- ===========================================================================

create policy trades_select on public.trades
  for select to authenticated using (true);
create policy trades_admin_write on public.trades
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

create policy territories_select on public.territories
  for select to authenticated using (true);
create policy territories_admin_write on public.territories
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

create policy territory_zips_select on public.territory_zips
  for select to authenticated using (true);
create policy territory_zips_admin_write on public.territory_zips
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

-- ===========================================================================
-- Profiles
-- ===========================================================================

create policy profiles_select_self on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or app.is_admin()
    -- A broker may see the profiles of agents in their own brokerage.
    or (app.my_role() = 'broker'
        and brokerage_id is not null
        and brokerage_id = app.my_brokerage_id())
  );

create policy profiles_insert_self on public.profiles
  for insert to authenticated with check (id = auth.uid());

-- Column-level protection is enforced by app.guard_profile_columns().
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid() or app.is_admin())
  with check (id = auth.uid() or app.is_admin());

create policy profiles_delete_admin on public.profiles
  for delete to authenticated using (app.is_admin());

-- ===========================================================================
-- Brokerages
-- ===========================================================================

create policy brokerages_select on public.brokerages
  for select to authenticated
  using (app.is_admin() or id = app.my_brokerage_id());

create policy brokerages_admin_write on public.brokerages
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

create policy brokerage_members_select on public.brokerage_members
  for select to authenticated
  using (app.is_admin() or profile_id = auth.uid() or brokerage_id = app.my_brokerage_id());

create policy brokerage_members_admin_write on public.brokerage_members
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

-- ===========================================================================
-- Contractors
--
-- A contractor sees their own record and nothing else — not even another
-- contractor working the same property. An agent or broker sees a contractor
-- ONLY once that contractor is attached to one of their own opportunities, so
-- there is no browsable directory of the network for anyone but an admin.
-- ===========================================================================

create policy contractors_select on public.contractors
  for select to authenticated
  using (
    app.is_admin()
    or id = app.my_contractor_id()
    or (
      -- Deliberately excludes contractors: this arm is for the agent and
      -- broker side, who need the assigned contractor's name and phone.
      app.my_contractor_id() is null
      and exists (
        select 1
        from public.opportunities o
        where o.contractor_id = contractors.id
          and app.can_view_request(o.request_id)
      )
    )
  );

-- Column-level protection is enforced by app.guard_contractor_columns().
create policy contractors_update_own on public.contractors
  for update to authenticated
  using (app.is_admin() or id = app.my_contractor_id())
  with check (app.is_admin() or id = app.my_contractor_id());

create policy contractors_insert_admin on public.contractors
  for insert to authenticated with check (app.is_admin());

create policy contractors_delete_admin on public.contractors
  for delete to authenticated using (app.is_admin());

create policy contractor_trades_select on public.contractor_trades
  for select to authenticated
  using (app.is_admin() or contractor_id = app.my_contractor_id());
create policy contractor_trades_write on public.contractor_trades
  for all to authenticated
  using (app.is_admin() or contractor_id = app.my_contractor_id())
  with check (app.is_admin() or contractor_id = app.my_contractor_id());

create policy contractor_territories_select on public.contractor_territories
  for select to authenticated
  using (app.is_admin() or contractor_id = app.my_contractor_id());
create policy contractor_territories_write on public.contractor_territories
  for all to authenticated
  using (app.is_admin() or contractor_id = app.my_contractor_id())
  with check (app.is_admin() or contractor_id = app.my_contractor_id());

-- ===========================================================================
-- Repair requests and items
-- ===========================================================================

create policy repair_requests_select on public.repair_requests
  for select to authenticated using (app.can_view_request(id));

create policy repair_requests_insert on public.repair_requests
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and app.my_role() in ('agent', 'broker', 'admin')
  );

create policy repair_requests_update on public.repair_requests
  for update to authenticated
  using (app.is_admin() or created_by = auth.uid())
  with check (app.is_admin() or created_by = auth.uid());

create policy repair_requests_delete on public.repair_requests
  for delete to authenticated
  using (app.is_admin() or (created_by = auth.uid() and status = 'draft'));

create policy repair_items_select on public.repair_items
  for select to authenticated using (app.can_view_request(request_id));

create policy repair_items_write on public.repair_items
  for all to authenticated
  using (
    app.is_admin()
    or exists (select 1 from public.repair_requests r
               where r.id = repair_items.request_id and r.created_by = auth.uid())
  )
  with check (
    app.is_admin()
    or exists (select 1 from public.repair_requests r
               where r.id = repair_items.request_id and r.created_by = auth.uid())
  );

-- ===========================================================================
-- Opportunities and the routing ladder
-- ===========================================================================

create policy opportunities_select on public.opportunities
  for select to authenticated using (app.can_view_opportunity(id));

-- Contractors change status on jobs they own; agents and admins on their own
-- requests. Creation and routing happen through SECURITY DEFINER functions in
-- a later phase, never by direct insert from a browser.
create policy opportunities_update on public.opportunities
  for update to authenticated
  using (
    app.is_admin()
    or (contractor_id is not null and contractor_id = app.my_contractor_id())
    or exists (select 1 from public.repair_requests r
               where r.id = opportunities.request_id and r.created_by = auth.uid())
  )
  with check (
    app.is_admin()
    or (contractor_id is not null and contractor_id = app.my_contractor_id())
    or exists (select 1 from public.repair_requests r
               where r.id = opportunities.request_id and r.created_by = auth.uid())
  );

create policy opportunities_insert on public.opportunities
  for insert to authenticated
  with check (
    app.is_admin()
    or exists (select 1 from public.repair_requests r
               where r.id = opportunities.request_id and r.created_by = auth.uid())
  );

-- A contractor sees only their OWN rungs of the ladder. They cannot discover
-- who else was offered the job, or where they sit in the rotation relative to
-- a competitor. Agents and brokers see the full ladder for their own request,
-- which is what powers the "2 contractors approached" line in the UI.
create policy opportunity_assignments_select on public.opportunity_assignments
  for select to authenticated
  using (
    app.is_admin()
    or contractor_id = app.my_contractor_id()
    -- Agent / broker arm only, for the same reason as app.can_view_opportunity:
    -- a contractor must never be able to read the rest of the ladder and learn
    -- who else was offered the job or where they sat in the rotation.
    or (app.my_contractor_id() is null
        and exists (
          select 1 from public.opportunities o
          where o.id = opportunity_assignments.opportunity_id
            and app.can_view_request(o.request_id)
        ))
  );

create policy opportunity_assignments_admin_write on public.opportunity_assignments
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

-- ===========================================================================
-- Quotes
-- ===========================================================================

create policy quotes_select on public.quotes
  for select to authenticated using (app.can_view_quote(id));

-- A contractor may only write a quote against an opportunity they have
-- actually accepted.
create policy quotes_insert on public.quotes
  for insert to authenticated
  with check (
    contractor_id = app.my_contractor_id()
    and exists (
      select 1 from public.opportunities o
      where o.id = quotes.opportunity_id
        and o.contractor_id = app.my_contractor_id()
    )
  );

create policy quotes_update on public.quotes
  for update to authenticated
  using (
    app.is_admin()
    or contractor_id = app.my_contractor_id()
    -- The agent's only write is the accept/decline decision on a sent quote.
    or (status <> 'draft' and app.can_view_opportunity(opportunity_id))
  )
  with check (
    app.is_admin()
    or contractor_id = app.my_contractor_id()
    or (status <> 'draft' and app.can_view_opportunity(opportunity_id))
  );

create policy quotes_delete on public.quotes
  for delete to authenticated
  using (app.is_admin() or (contractor_id = app.my_contractor_id() and status = 'draft'));

create policy quote_items_select on public.quote_items
  for select to authenticated using (app.can_view_quote(quote_id));

create policy quote_items_write on public.quote_items
  for all to authenticated
  using (
    app.is_admin()
    or exists (select 1 from public.quotes q
               where q.id = quote_items.quote_id and q.contractor_id = app.my_contractor_id())
  )
  with check (
    app.is_admin()
    or exists (select 1 from public.quotes q
               where q.id = quote_items.quote_id and q.contractor_id = app.my_contractor_id())
  );

-- ===========================================================================
-- Attachments
--
-- These rows describe inspection reports and property photos, so they follow
-- the visibility of their parent exactly. The matching policy on the storage
-- bucket itself is in 0003_storage.sql.
-- ===========================================================================

create policy attachments_select on public.attachments
  for select to authenticated
  using (
    (request_id is not null and app.can_view_request(request_id))
    or (quote_id is not null and app.can_view_quote(quote_id))
  );

create policy attachments_insert on public.attachments
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and (
      (request_id is not null
       and exists (select 1 from public.repair_requests r
                   where r.id = attachments.request_id and r.created_by = auth.uid()))
      or (quote_id is not null
          and exists (select 1 from public.quotes q
                      where q.id = attachments.quote_id
                        and q.contractor_id = app.my_contractor_id()))
    )
  );

create policy attachments_delete on public.attachments
  for delete to authenticated
  using (app.is_admin() or uploaded_by = auth.uid());

-- ===========================================================================
-- Notifications, audit, billing, support
-- ===========================================================================

create policy notifications_select on public.notifications
  for select to authenticated
  using (recipient_id = auth.uid() or app.is_admin());

-- The only field a recipient changes is read_at.
create policy notifications_update on public.notifications
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

create policy status_history_select on public.status_history
  for select to authenticated
  using (
    app.is_admin()
    or (entity_type = 'repair_request' and app.can_view_request(entity_id))
    or (entity_type = 'opportunity'    and app.can_view_opportunity(entity_id))
    or (entity_type = 'quote'          and app.can_view_quote(entity_id))
  );

-- Billing rows are written only by the Stripe webhook, which uses the
-- service_role key and bypasses RLS entirely.
create policy subscriptions_select on public.subscriptions
  for select to authenticated
  using (app.is_admin() or contractor_id = app.my_contractor_id());

create policy support_tickets_select on public.support_tickets
  for select to authenticated
  using (app.is_admin() or opened_by = auth.uid());
create policy support_tickets_insert on public.support_tickets
  for insert to authenticated with check (opened_by = auth.uid());
create policy support_tickets_update on public.support_tickets
  for update to authenticated
  using (app.is_admin() or opened_by = auth.uid())
  with check (app.is_admin() or opened_by = auth.uid());

-- ===========================================================================
-- The pre-acceptance contractor feed
--
-- This VIEW is the mechanism behind "contractors do not see private property
-- information before they accept". It deliberately omits address_line1,
-- mls_number and every contact_* column.
--
-- It is intentionally NOT security_invoker: it runs with the owner's rights so
-- the WHERE clause below is the entire security boundary, which is exactly
-- what lets it expose a safe subset of rows the caller cannot read directly.
-- ===========================================================================

create view public.offered_opportunities as
  select
    o.id                as opportunity_id,
    o.code,
    o.status,
    o.trade_key,
    o.territory_id,
    o.created_at,
    o.offered_at,
    o.offer_expires_at,
    a.contractor_id,
    a.position          as routing_position,
    a.expires_at        as respond_by,
    -- General location only: city, state and ZIP, never the street address.
    r.city,
    r.state,
    r.zip,
    i.description,
    i.urgency,
    i.estimate_deadline
  from public.opportunities o
  join public.opportunity_assignments a on a.opportunity_id = o.id
  join public.repair_requests r on r.id = o.request_id
  join public.repair_items   i on i.id = o.repair_item_id
  where a.outcome = 'pending'
    and a.contractor_id = app.my_contractor_id();

comment on view public.offered_opportunities is
  'Pre-acceptance feed for contractors. Excludes street address, MLS number and all agent contact details by construction.';

grant select on public.offered_opportunities to authenticated;

-- ===========================================================================
-- Table grants. RLS does the filtering; these grants decide which verbs are
-- even reachable. `anon` gets nothing: every screen requires a session.
-- ===========================================================================
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
