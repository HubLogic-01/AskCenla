-- ===========================================================================
-- AskCENLA Repair Network — 0007 routing automation
--
-- Phase 3 routed opportunities, but only because submit_repair_request() asked
-- it to. That is fine while a person is watching a browser. This file makes
-- routing survive when nobody is:
--
--   1. Routing becomes a TRIGGER, so any opportunity created by any means is
--      offered to a contractor — a future email intake, an admin action, a
--      bulk import.
--   2. A sweep expires lapsed offers and advances the rotation, scheduled to
--      run without anyone present. This is the automatic reassignment the
--      architecture has been built toward since Phase 1.
--   3. Exhausting the ladder notifies the people who can do something about
--      it, instead of sitting silently in a table.
--   4. Every status change is recorded, so "what happened to 1042-R" has an
--      answer weeks later.
--   5. A repair request's status follows its opportunities, so an agent's
--      dashboard reflects reality without anyone maintaining it.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Route on insert
--
-- `status = 'matching'` is the caller's way of saying "please route this".
-- Inserting with any other status (an import, or an admin placing work
-- directly) is left alone, so the trigger is automatic without being
-- unavoidable.
-- ---------------------------------------------------------------------------
create or replace function app.route_new_opportunity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'matching' then
    perform app.route_opportunity(new.id);
  end if;
  return null;  -- AFTER trigger: return value is ignored
end;
$$;

create trigger opportunities_auto_route
  after insert on public.opportunities
  for each row execute function app.route_new_opportunity();

-- submit_repair_request() no longer routes by hand; the trigger above does it.
-- Replaced wholesale rather than patched so the file remains the single
-- readable definition of the function.
create or replace function public.submit_repair_request(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user       uuid := auth.uid();
  v_role       public.user_role;
  v_brokerage  uuid;
  v_zip        char(5);
  v_territory  uuid;
  v_request_id uuid;
  v_reference  bigint;
  v_item       jsonb;
  v_item_id    uuid;
  v_opp_id     uuid;
  v_result     jsonb := '[]'::jsonb;
  v_opp        public.opportunities;
begin
  if v_user is null then
    raise exception 'You must be signed in to submit a repair request';
  end if;

  select role, brokerage_id into v_role, v_brokerage
  from public.profiles where id = v_user;

  if v_role not in ('agent', 'broker', 'admin') then
    raise exception 'Only agents and brokers can submit repair requests';
  end if;

  if jsonb_array_length(coalesce(p_payload -> 'items', '[]'::jsonb)) = 0 then
    raise exception 'A repair request needs at least one trade';
  end if;

  v_zip := p_payload ->> 'zip';
  select territory_id into v_territory from public.territory_zips where zip = v_zip;

  insert into public.repair_requests (
    created_by, brokerage_id, address_line1, city, state, zip, territory_id,
    mls_number, transaction_type, status,
    contact_name, contact_brokerage, contact_phone, contact_email, submitted_at
  ) values (
    v_user,                                    -- never from the payload
    v_brokerage,                               -- never from the payload
    p_payload ->> 'address_line1',
    p_payload ->> 'city',
    coalesce(p_payload ->> 'state', 'LA'),
    v_zip,
    v_territory,
    nullif(p_payload ->> 'mls_number', ''),
    coalesce(nullif(p_payload ->> 'transaction_type', ''), 'buyer_side')::public.transaction_type,
    'submitted',
    p_payload ->> 'contact_name',
    coalesce(p_payload ->> 'contact_brokerage', ''),
    coalesce(p_payload ->> 'contact_phone', ''),
    coalesce(p_payload ->> 'contact_email', ''),
    now()
  )
  returning id, reference into v_request_id, v_reference;

  for v_item in select * from jsonb_array_elements(p_payload -> 'items')
  loop
    insert into public.repair_items (
      request_id, trade_key, description, urgency, estimate_deadline, notes
    ) values (
      v_request_id,
      v_item ->> 'trade',
      coalesce(v_item ->> 'description', ''),
      coalesce(nullif(v_item ->> 'urgency', ''), 'standard')::public.urgency_level,
      nullif(v_item ->> 'estimate_deadline', '')::date,
      nullif(v_item ->> 'notes', '')
    )
    returning id into v_item_id;

    -- Inserting with status 'matching' is what asks the trigger to route it.
    insert into public.opportunities (
      request_id, repair_item_id, trade_key, territory_id, status
    ) values (
      v_request_id, v_item_id, v_item ->> 'trade', v_territory, 'matching'
    )
    returning id into v_opp_id;

    -- The AFTER INSERT trigger has already run by this point, so this reads
    -- the routed state rather than the row as it was written.
    select * into v_opp from public.opportunities where id = v_opp_id;
    v_result := v_result || jsonb_build_object(
      'id',     v_opp.id,
      'code',   v_opp.code,
      'trade',  v_opp.trade_key,
      'status', v_opp.status
    );
  end loop;

  return jsonb_build_object(
    'request_id',    v_request_id,
    'reference',     v_reference,
    'opportunities', v_result
  );
end;
$$;

revoke all on function public.submit_repair_request(jsonb) from public, anon;
grant execute on function public.submit_repair_request(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Tell someone when the ladder runs out
--
-- An opportunity nobody accepted is the one case the automation cannot
-- resolve on its own, so it is exactly the case a human must hear about.
-- app.route_opportunity() is replaced here to add this; the routing logic is
-- unchanged from 0006.
-- ---------------------------------------------------------------------------
create or replace function app.notify_unmatched(p_opportunity_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_opp     public.opportunities;
  v_request public.repair_requests;
  v_trade   text;
  v_admin   record;
begin
  select * into v_opp from public.opportunities where id = p_opportunity_id;
  select * into v_request from public.repair_requests where id = v_opp.request_id;
  select label into v_trade from public.trades where key = v_opp.trade_key;

  -- Don't nag: one unmatched notice per opportunity, not one per sweep.
  if exists (
    select 1 from public.notifications
    where link = '/agent/properties/' || v_request.id
      and kind = 'reminder'
      and title like '%' || v_opp.code || '%'
  ) then
    return;
  end if;

  insert into public.notifications (recipient_id, kind, title, body, link)
  values (
    v_request.created_by,
    'reminder',
    v_trade || ' (' || v_opp.code || ') still needs a contractor',
    'Every matching contractor has been approached. AskCENLA is expanding the '
      || 'search — you do not need to do anything.',
    '/agent/properties/' || v_request.id
  );

  -- The platform owner is the one who can actually fix a coverage gap by
  -- recruiting, so they hear about it too.
  for v_admin in select id from public.profiles where role = 'admin'
  loop
    insert into public.notifications (recipient_id, kind, title, body, link)
    values (
      v_admin.id,
      'system',
      'Unmatched: ' || v_opp.code || ' ' || v_trade,
      'No eligible contractor remains for this trade in '
        || coalesce((select name from public.territories where id = v_opp.territory_id), 'an unmapped area')
        || '.',
      '/admin/routing'
    );
  end loop;
end;
$$;

create or replace function app.route_opportunity(p_opportunity_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_opp        public.opportunities;
  v_already    uuid[];
  v_next       uuid;
  v_position   integer;
  v_expires    timestamptz;
  v_profile    uuid;
  v_request    public.repair_requests;
begin
  select * into v_opp from public.opportunities where id = p_opportunity_id;
  if not found then
    raise exception 'Opportunity % not found', p_opportunity_id;
  end if;

  select coalesce(array_agg(contractor_id), '{}'), count(*)
    into v_already, v_position
  from public.opportunity_assignments
  where opportunity_id = p_opportunity_id;

  select ec.contractor_id into v_next
  from app.eligible_contractors(v_opp.trade_key, v_opp.territory_id, v_already) ec
  limit 1;

  if v_next is null then
    update public.opportunities
       set status = 'awaiting_contractor',
           offer_expires_at = null
     where id = p_opportunity_id;
    perform app.notify_unmatched(p_opportunity_id);
    return null;
  end if;

  v_expires := now() + (app.offer_response_hours() || ' hours')::interval;

  insert into public.opportunity_assignments
    (opportunity_id, contractor_id, position, outcome, offered_at, expires_at)
  values
    (p_opportunity_id, v_next, v_position, 'pending', now(), v_expires);

  update public.opportunities
     set status           = 'offered',
         routing_position = v_position,
         offered_at       = now(),
         offer_expires_at = v_expires
   where id = p_opportunity_id;

  update public.contractors
     set offers_received = offers_received + 1
   where id = v_next;

  select * into v_request from public.repair_requests where id = v_opp.request_id;
  select id into v_profile from public.profiles where contractor_id = v_next;

  if v_profile is not null then
    insert into public.notifications (recipient_id, kind, title, body, link)
    values (
      v_profile,
      'opportunity_offered',
      'New opportunity — ' || v_opp.code || ' ' ||
        (select label from public.trades where key = v_opp.trade_key),
      v_request.city || ', ' || v_request.state || ' ' || v_request.zip ||
        ' · respond within ' || app.offer_response_hours() || ' hours',
      '/contractor/opportunities/' || p_opportunity_id
    );
  end if;

  return v_next;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. The expiry sweep
--
-- A contractor who neither accepts nor declines must not be able to sit on an
-- opportunity indefinitely. This marks lapsed offers as expired and advances
-- each opportunity to the next contractor.
--
-- Written as a plain function taking `now` as a parameter so it is testable
-- without waiting 24 hours.
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
    select a.id, a.opportunity_id, a.contractor_id
    from public.opportunity_assignments a
    join public.opportunities o on o.id = a.opportunity_id
    where a.outcome = 'pending'
      and a.expires_at < p_now
      -- Only sweep opportunities still waiting on this offer. If the
      -- contractor accepted in the meantime, leave it alone.
      and o.status = 'offered'
    order by a.expires_at
  loop
    update public.opportunity_assignments
       set outcome = 'expired', responded_at = p_now
     where id = v_lapsed.id;

    -- Same entry point routing has always used, now on a timer.
    v_next := app.route_opportunity(v_lapsed.opportunity_id);

    opportunity_id      := v_lapsed.opportunity_id;
    previous_contractor := v_lapsed.contractor_id;
    next_contractor     := v_next;
    return next;
  end loop;
end;
$$;

/**
 * Admin-facing wrapper, so the platform owner can run the sweep on demand
 * rather than waiting for the schedule. Returns how many offers were advanced.
 */
create or replace function public.run_offer_sweep()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if not app.is_admin() then
    raise exception 'Only an administrator can run the offer sweep';
  end if;
  select count(*) into v_count from app.expire_stale_offers();
  return v_count;
end;
$$;

revoke all on function public.run_offer_sweep() from public, anon;
grant execute on function public.run_offer_sweep() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Status history
--
-- Recorded by trigger rather than by application code, so it cannot be
-- forgotten at a call site and is correct regardless of what made the change.
-- ---------------------------------------------------------------------------
create or replace function app.record_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status then
    insert into public.status_history (entity_type, entity_id, from_status, to_status, actor_id)
    values (tg_argv[0], new.id, old.status::text, new.status::text, auth.uid());
  end if;
  return null;
end;
$$;

create trigger opportunities_status_history
  after update of status on public.opportunities
  for each row execute function app.record_status_change('opportunity');

create trigger repair_requests_status_history
  after update of status on public.repair_requests
  for each row execute function app.record_status_change('repair_request');

create trigger quotes_status_history
  after update of status on public.quotes
  for each row execute function app.record_status_change('quote');

-- ---------------------------------------------------------------------------
-- 5. A request's status follows its opportunities
--
-- Before this, a request said "Submitted" forever because nothing ever updated
-- it. Deriving it means the agent's dashboard is right without anyone
-- maintaining it.
-- ---------------------------------------------------------------------------
create or replace function app.sync_request_status(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total     integer;
  v_finished  integer;
  v_engaged   integer;
  v_current   public.request_status;
  v_next      public.request_status;
begin
  select status into v_current from public.repair_requests where id = p_request_id;

  -- A cancelled request stays cancelled; that is a human decision.
  if v_current = 'cancelled' then
    return;
  end if;

  select
    count(*),
    count(*) filter (where status in ('completed', 'won', 'lost', 'cancelled', 'quote_accepted')),
    count(*) filter (where status not in ('new', 'matching', 'offered', 'awaiting_contractor'))
  into v_total, v_finished, v_engaged
  from public.opportunities
  where request_id = p_request_id;

  if v_total = 0 then
    return;
  elsif v_finished = v_total then
    v_next := 'completed';
  elsif v_engaged > 0 then
    v_next := 'in_progress';
  else
    v_next := 'submitted';
  end if;

  if v_next is distinct from v_current then
    update public.repair_requests set status = v_next where id = p_request_id;
  end if;
end;
$$;

create or replace function app.sync_request_status_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.sync_request_status(new.request_id);
  return null;
end;
$$;

create trigger opportunities_sync_request_status
  after update of status on public.opportunities
  for each row execute function app.sync_request_status_trigger();

-- ---------------------------------------------------------------------------
-- 6. Schedule the sweep
--
-- pg_cron is enabled per project (Supabase: Database -> Extensions -> pg_cron).
-- This block schedules the job when it is available and says so when it is
-- not, so the migration is safe to run either way — including on a plain
-- PostgreSQL server during testing, which has no pg_cron.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule('askcenla-expire-offers')
    where exists (select 1 from cron.job where jobname = 'askcenla-expire-offers');

    perform cron.schedule(
      'askcenla-expire-offers',
      '*/15 * * * *',                       -- every 15 minutes
      $cron$select app.expire_stale_offers()$cron$
    );
    raise notice 'Scheduled askcenla-expire-offers every 15 minutes.';
  else
    raise notice
      'pg_cron is not enabled, so the offer sweep is NOT scheduled. Enable it '
      '(Supabase: Database -> Extensions -> pg_cron) and re-run this migration. '
      'Until then an administrator can run it by hand from the Routing Monitor.';
  end if;
end $$;
