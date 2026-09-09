-- ===========================================================================
-- AskCENLA Repair Network — 0010 administration
--
-- Two things here.
--
-- 1. CONTRACTOR MANAGEMENT. A contractor's trades and territories are join
--    tables, and their membership status is a column the guard trigger
--    deliberately refuses to let them touch. Both need functions: one because
--    a set-replacement across a join table must be atomic, the other because
--    only an administrator may grant it.
--
-- 2. MARKETPLACE METRICS AS A VIEW. The admin dashboard has been computing
--    these in the browser from the whole workspace, which only works because
--    an admin can read everything. That stops being true the moment the
--    marketplace has a few thousand rows: it would mean shipping the entire
--    database to a laptop to count it. Postgres counts it in place.
-- ===========================================================================

-- The membership fee lives in one place. Phase 10 replaces this with the
-- amount Stripe actually reports on the subscription.
create or replace function app.membership_fee() returns numeric
  language sql immutable as $$ select 199::numeric $$;

-- ---------------------------------------------------------------------------
-- Who may manage this contractor record: an administrator, or the contractor
-- themselves for the parts they own.
-- ---------------------------------------------------------------------------
create or replace function app.may_manage_contractor(p_contractor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app.is_admin() or app.my_contractor_id() = p_contractor_id;
$$;

-- ---------------------------------------------------------------------------
-- Trades and territories.
--
-- Replace-the-set rather than add/remove, matching how the UI works: the admin
-- and the contractor both toggle tiles and expect the result to be exactly
-- what they see. Delete-then-insert is safe because it is one transaction; as
-- two client calls a failure between them would leave a contractor with no
-- trades and therefore no work.
-- ---------------------------------------------------------------------------
create or replace function public.set_contractor_trades(
  p_contractor_id uuid,
  p_trades        text[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.may_manage_contractor(p_contractor_id) then
    raise exception 'You cannot change this contractor''s trades';
  end if;

  -- Reject an unknown trade explicitly rather than letting the foreign key
  -- produce a message about a constraint the caller has never heard of.
  if exists (
    select 1 from unnest(coalesce(p_trades, '{}')) as t(key)
    where not exists (select 1 from public.trades where trades.key = t.key)
  ) then
    raise exception 'One or more trades are not recognised';
  end if;

  delete from public.contractor_trades where contractor_id = p_contractor_id;

  insert into public.contractor_trades (contractor_id, trade_key)
  select p_contractor_id, t.key from unnest(coalesce(p_trades, '{}')) as t(key);
end;
$$;

create or replace function public.set_contractor_territories(
  p_contractor_id uuid,
  p_territories   uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.may_manage_contractor(p_contractor_id) then
    raise exception 'You cannot change this contractor''s territories';
  end if;

  if exists (
    select 1 from unnest(coalesce(p_territories, '{}')) as t(id)
    where not exists (select 1 from public.territories where territories.id = t.id)
  ) then
    raise exception 'One or more territories are not recognised';
  end if;

  delete from public.contractor_territories where contractor_id = p_contractor_id;

  insert into public.contractor_territories (contractor_id, territory_id)
  select p_contractor_id, t.id from unnest(coalesce(p_territories, '{}')) as t(id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Membership and activation — administrators only.
--
-- These are the two columns the matching engine trusts when it decides whether
-- a contractor may receive work, which is exactly why the guard trigger in
-- 0002 stops a contractor setting them for themselves.
-- ---------------------------------------------------------------------------
create or replace function public.set_contractor_membership(
  p_contractor_id uuid,
  p_status        text,
  p_is_active     boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.contractors;
  v_profile uuid;
begin
  if not app.is_admin() then
    raise exception 'Only an administrator can change membership status';
  end if;

  select * into v_before from public.contractors where id = p_contractor_id for update;
  if not found then
    raise exception 'That contractor no longer exists';
  end if;

  update public.contractors
     set membership_status = p_status::public.membership_status,
         is_active         = p_is_active
   where id = p_contractor_id;

  -- Tell them when they have just been let into the network. Nothing is sent
  -- for a routine status correction, or for a change that is not an approval.
  if p_is_active
     and p_status in ('active', 'trial')
     and not (v_before.is_active and v_before.membership_status in ('active', 'trial'))
  then
    select id into v_profile from public.profiles where contractor_id = p_contractor_id;
    if v_profile is not null then
      insert into public.notifications (recipient_id, kind, title, body, link)
      values (
        v_profile,
        'system',
        'Your AskCENLA membership is active',
        'You are now in the rotation for your trades and territories. '
          || 'Opportunities will start arriving as they come in.',
        '/contractor'
      );
    end if;
  end if;

  return jsonb_build_object(
    'contractor_id', p_contractor_id,
    'membership_status', p_status,
    'is_active', p_is_active
  );
end;
$$;

revoke all on function public.set_contractor_trades(uuid, text[])       from public, anon;
revoke all on function public.set_contractor_territories(uuid, uuid[])  from public, anon;
revoke all on function public.set_contractor_membership(uuid, text, boolean) from public, anon;
grant execute on function public.set_contractor_trades(uuid, text[])      to authenticated;
grant execute on function public.set_contractor_territories(uuid, uuid[]) to authenticated;
grant execute on function public.set_contractor_membership(uuid, text, boolean) to authenticated;

-- ===========================================================================
-- Marketplace metrics
--
-- One row, admin only. The `where app.is_admin()` is the access control: this
-- view is not security_invoker, so it runs with the owner's rights and would
-- otherwise expose whole-marketplace counts to anyone who selected from it.
-- A non-admin gets zero rows rather than an error, which is what the client
-- expects from every other read.
-- ===========================================================================
create or replace view public.marketplace_metrics as
select
  (select count(*) from public.repair_requests
    where date_trunc('month', submitted_at) = date_trunc('month', now()))     as requests_this_month,

  (select count(*) from public.opportunities
    where date_trunc('month', created_at) = date_trunc('month', now()))       as opportunities_this_month,

  (select count(*) from public.opportunity_assignments
    where outcome = 'accepted'
      and date_trunc('month', responded_at) = date_trunc('month', now()))     as accepted_this_month,

  (select count(*) from public.quotes
    where status <> 'draft'
      and date_trunc('month', submitted_at) = date_trunc('month', now()))     as quotes_this_month,

  (select count(*) from public.opportunities
    where status = 'awaiting_contractor')                                     as unmatched_opportunities,

  -- Measured from the ladder rather than from the contractors' cached
  -- averages, so this reflects the marketplace rather than a rolling stat.
  (select coalesce(round(avg(
      extract(epoch from (responded_at - offered_at)) / 3600.0
    )::numeric, 1), 0)
   from public.opportunity_assignments
   where responded_at is not null)                                            as avg_response_hours,

  (select case when count(*) = 0 then 0
               else round(100.0 * count(*) filter (where outcome = 'accepted') / count(*))
          end
   from public.opportunity_assignments
   where outcome <> 'pending')                                                as acceptance_rate,

  (select count(*) from public.opportunities
    where status in ('won', 'quote_accepted', 'completed'))                   as jobs_won,

  (select count(*) from public.contractors
    where membership_status = 'active')                                       as active_members,
  (select count(*) from public.contractors
    where membership_status = 'trial')                                        as trial_members,
  (select count(*) from public.contractors
    where membership_status = 'pending_approval')                             as pending_members,
  (select count(*) from public.contractors
    where membership_status = 'past_due')                                     as past_due_members,

  (select count(*) * app.membership_fee() from public.contractors
    where membership_status = 'active')                                       as monthly_recurring_revenue
where app.is_admin();

comment on view public.marketplace_metrics is
  'Admin-only marketplace roll-up. Counted in the database rather than shipped to a browser to be counted there.';

grant select on public.marketplace_metrics to authenticated;
