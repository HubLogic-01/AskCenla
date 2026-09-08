-- ===========================================================================
-- AskCENLA Repair Network — 0008 contractor accept / decline
--
-- Accepting an opportunity claims a row that currently belongs to nobody, and
-- declining has to advance the rotation. Neither is a row update a contractor
-- is allowed to make directly — the RLS policy in 0002 deliberately only lets
-- them touch opportunities they ALREADY own — so both are functions that check
-- authorisation for themselves.
--
-- Every one of them:
--   * locks the opportunity row first, so a decline and the scheduled sweep
--     cannot both advance the same job and offer it to two contractors,
--   * verifies the caller genuinely holds the pending offer rather than
--     trusting the id they passed in,
--   * records the response time, which feeds back into the routing score.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Response-time tracking.
--
-- `offers_received` is the denominator on purpose: every offer eventually
-- resolves — accepted, declined, or expired — so it is also the count of
-- responses, and an offer left to expire correctly drags the average down.
-- That is the behaviour we want: a contractor who ignores work should fall
-- down the rotation, not stay level with one who answers promptly.
--
-- Keeping these as cumulative counters rather than recomputing from
-- opportunity_assignments is deliberate. They carry history from before the
-- platform recorded it (a contractor joins with a track record), and a
-- recompute would erase it.
-- ---------------------------------------------------------------------------
create or replace function app.record_response(p_contractor_id uuid, p_hours numeric)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_received integer;
  v_avg      numeric;
begin
  select greatest(offers_received, 1), avg_response_hours
    into v_received, v_avg
  from public.contractors
  where id = p_contractor_id;

  update public.contractors
     set avg_response_hours = round(
           ((v_avg * (v_received - 1)) + least(p_hours, 999)) / v_received, 2
         )
   where id = p_contractor_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Shared precondition check for both contractor actions.
--
-- Returns the pending assignment, or raises with a message the UI can show.
-- Note it does NOT reject an offer whose window has technically lapsed but
-- which the sweep has not yet reclaimed: the contractor answered while it was
-- still theirs, and punishing them for the scheduler's 15-minute granularity
-- would be wrong.
-- ---------------------------------------------------------------------------
create or replace function app.claim_pending_offer(p_opportunity_id uuid)
returns public.opportunity_assignments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_contractor uuid := app.my_contractor_id();
  v_opp        public.opportunities;
  v_assignment public.opportunity_assignments;
begin
  if v_contractor is null then
    raise exception 'Only a contractor account can respond to an opportunity';
  end if;

  -- Lock first. Without this, a decline racing the expiry sweep could both
  -- advance the ladder and produce two live offers for one job.
  select * into v_opp
  from public.opportunities
  where id = p_opportunity_id
  for update;

  if not found then
    raise exception 'That opportunity no longer exists';
  end if;

  if v_opp.status <> 'offered' then
    raise exception 'That opportunity is no longer available to respond to';
  end if;

  select * into v_assignment
  from public.opportunity_assignments
  where opportunity_id = p_opportunity_id
    and contractor_id = v_contractor
    and outcome = 'pending';

  if not found then
    raise exception 'This opportunity is not currently offered to you';
  end if;

  return v_assignment;
end;
$$;

-- ---------------------------------------------------------------------------
-- Accept
-- ---------------------------------------------------------------------------
create or replace function public.accept_opportunity(p_opportunity_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_assignment public.opportunity_assignments;
  v_contractor public.contractors;
  v_opp        public.opportunities;
  v_request    public.repair_requests;
  v_hours      numeric;
begin
  v_assignment := app.claim_pending_offer(p_opportunity_id);
  v_hours := extract(epoch from (now() - v_assignment.offered_at)) / 3600.0;

  update public.opportunity_assignments
     set outcome = 'accepted', responded_at = now()
   where id = v_assignment.id;

  update public.opportunities
     set status        = 'accepted',
         contractor_id = v_assignment.contractor_id,
         accepted_at   = now()
   where id = p_opportunity_id;

  update public.contractors
     set offers_accepted = offers_accepted + 1
   where id = v_assignment.contractor_id;

  perform app.record_response(v_assignment.contractor_id, v_hours);

  -- Tell the agent. This is the moment the contractor gains access to the
  -- address, the agent's contact details and the inspection report — RLS
  -- flips over automatically because can_view_request() keys off exactly this
  -- accepted opportunity.
  select * into v_opp from public.opportunities where id = p_opportunity_id;
  select * into v_request from public.repair_requests where id = v_opp.request_id;
  select * into v_contractor from public.contractors where id = v_assignment.contractor_id;

  insert into public.notifications (recipient_id, kind, title, body, link)
  values (
    v_request.created_by,
    'opportunity_accepted',
    v_contractor.business_name || ' accepted ' || v_opp.code,
    (select label from public.trades where key = v_opp.trade_key)
      || ' scope at ' || v_request.address_line1 || '.',
    '/agent/properties/' || v_request.id
  );

  return jsonb_build_object(
    'opportunity_id', p_opportunity_id,
    'status',         v_opp.status,
    'contractor_id',  v_assignment.contractor_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Decline — records the answer and advances the rotation in one transaction.
-- ---------------------------------------------------------------------------
create or replace function public.decline_opportunity(p_opportunity_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_assignment public.opportunity_assignments;
  v_hours      numeric;
  v_next       uuid;
begin
  v_assignment := app.claim_pending_offer(p_opportunity_id);
  v_hours := extract(epoch from (now() - v_assignment.offered_at)) / 3600.0;

  update public.opportunity_assignments
     set outcome = 'declined', responded_at = now()
   where id = v_assignment.id;

  perform app.record_response(v_assignment.contractor_id, v_hours);

  -- Same entry point every other route uses, so the ladder, the notification
  -- to the next contractor and the coverage-gap alert all behave identically.
  v_next := app.route_opportunity(p_opportunity_id);

  return jsonb_build_object(
    'opportunity_id',  p_opportunity_id,
    'next_contractor', v_next
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Administrative re-route ("Offer to next" on the Routing Monitor).
--
-- Withdraws any live offer first. Without that, routing would add a second
-- pending assignment and the job would be offered to two contractors at once.
-- ---------------------------------------------------------------------------
create or replace function public.reroute_opportunity(p_opportunity_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_opp  public.opportunities;
  v_next uuid;
begin
  if not app.is_admin() then
    raise exception 'Only an administrator can re-route an opportunity';
  end if;

  select * into v_opp from public.opportunities where id = p_opportunity_id for update;
  if not found then
    raise exception 'That opportunity no longer exists';
  end if;

  if v_opp.contractor_id is not null then
    raise exception 'That opportunity has already been accepted by a contractor';
  end if;

  update public.opportunity_assignments
     set outcome = 'withdrawn', responded_at = now()
   where opportunity_id = p_opportunity_id
     and outcome = 'pending';

  v_next := app.route_opportunity(p_opportunity_id);

  return jsonb_build_object('opportunity_id', p_opportunity_id, 'next_contractor', v_next);
end;
$$;

revoke all on function public.accept_opportunity(uuid)  from public, anon;
revoke all on function public.decline_opportunity(uuid) from public, anon;
revoke all on function public.reroute_opportunity(uuid) from public, anon;
grant execute on function public.accept_opportunity(uuid)  to authenticated;
grant execute on function public.decline_opportunity(uuid) to authenticated;
grant execute on function public.reroute_opportunity(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- An offer left to expire is a response too — the slowest possible one.
-- Recording it is what makes an unresponsive contractor drift down the
-- rotation instead of holding their position indefinitely.
-- ---------------------------------------------------------------------------
create or replace function app.expire_stale_offers(p_now timestamptz default now())
returns table (opportunity_id uuid, previous_contractor uuid, next_contractor uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lapsed record;
  v_next   uuid;
begin
  for v_lapsed in
    select a.id, a.opportunity_id, a.contractor_id, a.offered_at
    from public.opportunity_assignments a
    join public.opportunities o on o.id = a.opportunity_id
    where a.outcome = 'pending'
      and a.expires_at < p_now
      and o.status = 'offered'
    order by a.expires_at
  loop
    update public.opportunity_assignments
       set outcome = 'expired', responded_at = p_now
     where id = v_lapsed.id;

    perform app.record_response(
      v_lapsed.contractor_id,
      extract(epoch from (p_now - v_lapsed.offered_at)) / 3600.0
    );

    v_next := app.route_opportunity(v_lapsed.opportunity_id);

    opportunity_id      := v_lapsed.opportunity_id;
    previous_contractor := v_lapsed.contractor_id;
    next_contractor     := v_next;
    return next;
  end loop;
end;
$$;
