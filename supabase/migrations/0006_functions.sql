-- ===========================================================================
-- AskCENLA Repair Network — 0006 request submission and routing
--
-- This file puts the matching engine in the database.
--
-- src/lib/matching.ts already expressed the routing rules as pure functions so
-- they could run anywhere. This is the "anywhere": the same eligibility rules
-- and the same additive score, in SQL, so routing happens no matter what
-- created the request — the web app today, an email intake or an Edge Function
-- later. The TypeScript version stays as the client-side preview and as the
-- reference implementation the admin Routing Monitor explains itself with.
--
-- Everything here runs in ONE transaction. A browser that dies halfway through
-- cannot leave a property request with no opportunities attached to it, which
-- is exactly what a sequence of separate insert() calls from the client would
-- risk.
-- ===========================================================================

-- Network rules. Kept together so there is one place to change them, and
-- deliberately mirroring the constants in src/lib/matching.ts.
create or replace function app.max_contractors_per_trade() returns integer
  language sql immutable as $$ select 3 $$;

create or replace function app.offer_response_hours() returns integer
  language sql immutable as $$ select 24 $$;

-- ---------------------------------------------------------------------------
-- Eligibility + ranking. The SQL twin of evaluateContractors() and
-- buildRoutingLadder() in src/lib/matching.ts.
-- ---------------------------------------------------------------------------
create or replace function app.eligible_contractors(
  p_trade      text,
  p_territory  uuid,
  p_exclude    uuid[] default '{}'
)
returns table (contractor_id uuid, score numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    c.id,
    -- Additive score, same weighting as scoreContractor() in matching.ts:
    -- rotation position dominates, then acceptance rate, then responsiveness.
    (100 - least(c.rotation_priority, 100)) * 2
      + case when c.offers_received > 0
             then (c.offers_accepted::numeric / c.offers_received) * 100
             else 60 end
      + greatest(0, 48 - c.avg_response_hours) * 1.5
      + case when c.availability = 'available' then 20 else 0 end
      as score
  from public.contractors c
  where c.is_active
    and c.accepting_opportunities
    -- A past-due membership stops receiving work with no admin action.
    and c.membership_status in ('active', 'trial')
    and c.availability <> 'unavailable'
    and exists (
      select 1 from public.contractor_trades ct
      where ct.contractor_id = c.id and ct.trade_key = p_trade
    )
    -- A null territory means the ZIP is outside mapped coverage: fall through
    -- to trade-only matching rather than silently matching nobody.
    and (
      p_territory is null
      or exists (
        select 1 from public.contractor_territories cte
        where cte.contractor_id = c.id and cte.territory_id = p_territory
      )
    )
    and not (c.id = any(p_exclude))
  order by score desc, c.rotation_priority asc, c.created_at asc
  limit app.max_contractors_per_trade();
$$;

-- ---------------------------------------------------------------------------
-- Offer an opportunity to the next contractor in the rotation.
--
-- This is the single entry point for routing. It is called when an
-- opportunity is created, and it is what a decline, an expiry sweep or an
-- admin "offer to next" will call in later phases — so automatic reassignment
-- becomes a scheduler calling this on a timer, not new logic.
-- ---------------------------------------------------------------------------
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

  -- Never offer the same opportunity to the same contractor twice.
  select coalesce(array_agg(contractor_id), '{}'), count(*)
    into v_already, v_position
  from public.opportunity_assignments
  where opportunity_id = p_opportunity_id;

  select ec.contractor_id into v_next
  from app.eligible_contractors(v_opp.trade_key, v_opp.territory_id, v_already) ec
  limit 1;

  if v_next is null then
    -- Nobody left. This is a coverage gap, and it surfaces on the admin
    -- Routing Monitor rather than sitting silently in a queue.
    update public.opportunities
       set status = 'awaiting_contractor',
           offer_expires_at = null
     where id = p_opportunity_id;
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

  -- In-app notification now; email delivery arrives in Phase 9.
  select * into v_request from public.repair_requests where id = v_opp.request_id;
  select id into v_profile from public.profiles where contractor_id = v_next;

  if v_profile is not null then
    insert into public.notifications (recipient_id, kind, title, body, link)
    values (
      v_profile,
      'opportunity_offered',
      'New opportunity — ' || v_opp.code || ' ' ||
        (select label from public.trades where key = v_opp.trade_key),
      -- General location only. The street address stays hidden until they accept.
      v_request.city || ', ' || v_request.state || ' ' || v_request.zip ||
        ' · respond within ' || app.offer_response_hours() || ' hours',
      '/contractor/opportunities/' || p_opportunity_id
    );
  end if;

  return v_next;
end;
$$;

-- ---------------------------------------------------------------------------
-- Submit a repair request: the multi-trade fan-out, atomically.
--
-- Takes the whole wizard payload as one JSON document and returns what the
-- confirmation screen needs. SECURITY DEFINER because it writes the
-- opportunity and assignment rows that no browser session is allowed to insert
-- directly — but it derives the owner from auth.uid() and never from the
-- payload, so it cannot be used to file a request as somebody else.
-- ---------------------------------------------------------------------------
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

  -- One repair item and one independently-routed opportunity per trade.
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

    -- The opportunities_set_code trigger derives "1042-P" from the reference
    -- and the trade's letter, so the code is right regardless of caller.
    insert into public.opportunities (
      request_id, repair_item_id, trade_key, territory_id, status
    ) values (
      v_request_id, v_item_id, v_item ->> 'trade', v_territory, 'matching'
    )
    returning id into v_opp_id;

    -- Route immediately. No admin sits in the normal path.
    perform app.route_opportunity(v_opp_id);

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
