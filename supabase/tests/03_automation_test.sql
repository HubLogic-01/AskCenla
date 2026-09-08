-- ===========================================================================
-- AskCENLA Repair Network — routing automation test suite
--
-- Proves the platform keeps routing when nobody is watching: opportunities
-- route themselves on creation, lapsed offers advance to the next contractor
-- on a timer, exhausting the ladder tells a human, and statuses stay truthful.
--
-- app.expire_stale_offers() takes `now` as a parameter precisely so this can
-- be tested in milliseconds rather than over 24 hours.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Routing happens on INSERT, not because a caller remembered to ask
-- ---------------------------------------------------------------------------
do $$
declare
  v_request uuid;
  v_item    uuid;
  v_opp     uuid;
begin
  -- A request created by something other than the wizard — an import, an
  -- admin, a future email intake.
  insert into public.repair_requests (
    created_by, address_line1, city, state, zip, territory_id, contact_name, status, submitted_at
  )
  select p.id, '500 Trigger Road', 'Alexandria', 'LA', '71301',
         (select territory_id from public.territory_zips where zip = '71301'),
         'Danielle Ortiz', 'submitted', now()
  from public.profiles p where p.email = 'danielle@redriverrealty.com'
  returning id into v_request;

  insert into public.repair_items (request_id, trade_key, description, urgency)
  values (v_request, 'electrical', 'Panel replacement.', 'standard')
  returning id into v_item;

  -- 'matching' is the caller asking to be routed.
  insert into public.opportunities (request_id, repair_item_id, trade_key, territory_id, status)
  values (v_request, v_item, 'electrical',
          (select territory_id from public.territory_zips where zip = '71301'), 'matching')
  returning id into v_opp;

  perform set_config('tests.trigger_opp', v_opp::text, false);
end $$;

select tests.check('an opportunity routes itself on insert',
  (select status::text from public.opportunities
   where id = current_setting('tests.trigger_opp')::uuid),
  'offered');

select tests.check('routing on insert records the offer',
  (select count(*) from public.opportunity_assignments
   where opportunity_id = current_setting('tests.trigger_opp')::uuid), 1::bigint);

-- Inserting with any other status means "do not route this", so an import or a
-- directly-placed job is not hijacked by the automation.
do $$
declare
  v_request uuid;
  v_item    uuid;
  v_opp     uuid;
begin
  select id into v_request from public.repair_requests where address_line1 = '500 Trigger Road';

  insert into public.repair_items (request_id, trade_key, description, urgency)
  values (v_request, 'hvac', 'Pre-assigned to a specific vendor.', 'standard')
  returning id into v_item;

  insert into public.opportunities (request_id, repair_item_id, trade_key, territory_id, status)
  values (v_request, v_item, 'hvac',
          (select territory_id from public.territory_zips where zip = '71301'), 'new')
  returning id into v_opp;

  perform set_config('tests.unrouted_opp', v_opp::text, false);
end $$;

select tests.check('an opportunity created with another status is left alone',
  (select status::text from public.opportunities
   where id = current_setting('tests.unrouted_opp')::uuid),
  'new');

select tests.check('a deliberately unrouted opportunity gets no offer',
  (select count(*) from public.opportunity_assignments
   where opportunity_id = current_setting('tests.unrouted_opp')::uuid), 0::bigint);

-- ---------------------------------------------------------------------------
-- 2. The sweep advances a lapsed offer to the next contractor
--
-- 1044-P is a Pineville plumbing job currently offered to Wiley Plumbing.
-- Red River Plumbing also covers Pineville, so the rotation has somewhere to go.
-- ---------------------------------------------------------------------------
update public.opportunity_assignments a
   set expires_at = now() - interval '1 hour'
  from public.opportunities o
 where o.id = a.opportunity_id
   and o.code = '1044-P'
   and a.outcome = 'pending';

select count(*) as swept from app.expire_stale_offers() \gset

select tests.check('the lapsed offer is marked expired, not left pending',
  (select a.outcome::text from public.opportunity_assignments a
   join public.opportunities o on o.id = a.opportunity_id
   where o.code = '1044-P'
     and a.contractor_id = 'c0000000-0000-4000-8000-000000000001'),
  'expired');

select tests.check('the opportunity advanced to the next contractor',
  (select c.business_name from public.opportunity_assignments a
   join public.opportunities o on o.id = a.opportunity_id
   join public.contractors c on c.id = a.contractor_id
   where o.code = '1044-P' and a.outcome = 'pending'),
  'Red River Plumbing Co.');

select tests.check('the advanced offer sits at the next rung of the ladder',
  (select a.position from public.opportunity_assignments a
   join public.opportunities o on o.id = a.opportunity_id
   where o.code = '1044-P' and a.outcome = 'pending'), 1);

select tests.check('the opportunity is still offered, not stalled',
  (select status::text from public.opportunities where code = '1044-P'),
  'offered');

select tests.check('the new offer has a fresh response window',
  (select count(*) from public.opportunities
   where code = '1044-P' and offer_expires_at > now()), 1::bigint);

-- ---------------------------------------------------------------------------
-- 3. The sweep does not disturb work a contractor already accepted
--
-- A stale pending row against an ACCEPTED opportunity must be left alone —
-- otherwise a late sweep could re-route a job somebody is already doing.
-- ---------------------------------------------------------------------------
insert into public.opportunity_assignments
  (opportunity_id, contractor_id, position, outcome, offered_at, expires_at)
select o.id, 'c0000000-0000-4000-8000-000000000005', 1, 'pending',
       now() - interval '2 days', now() - interval '1 day'
from public.opportunities o where o.code = '1042-E';

select count(*) as swept2 from app.expire_stale_offers() \gset

select tests.check('a stale offer on an accepted job is not swept',
  (select a.outcome::text from public.opportunity_assignments a
   join public.opportunities o on o.id = a.opportunity_id
   where o.code = '1042-E' and a.contractor_id = 'c0000000-0000-4000-8000-000000000005'),
  'pending');

select tests.check('an accepted opportunity keeps its contractor',
  (select c.business_name from public.opportunities o
   join public.contractors c on c.id = o.contractor_id
   where o.code = '1042-E'),
  'Smith Electric');

-- ---------------------------------------------------------------------------
-- 4. Exhausting the ladder tells a human
--
-- 1045-R is roofing in Ball. Kisatchie covers Ball; Ironwood is past due and
-- only covers Alexandria. Once Kisatchie lapses there is genuinely nobody left.
-- ---------------------------------------------------------------------------
update public.opportunity_assignments a
   set expires_at = now() - interval '1 hour'
  from public.opportunities o
 where o.id = a.opportunity_id
   and o.code = '1045-R'
   and a.outcome = 'pending';

select count(*) as swept3 from app.expire_stale_offers() \gset

select tests.check('an exhausted ladder lands in awaiting_contractor',
  (select status::text from public.opportunities where code = '1045-R'),
  'awaiting_contractor');

select tests.check('an exhausted ladder clears the response deadline',
  (select offer_expires_at from public.opportunities where code = '1045-R'),
  null::timestamptz);

select tests.check('the agent is told their trade needs sourcing',
  (select count(*) from public.notifications n
   join public.profiles p on p.id = n.recipient_id
   where p.email = 'tasha@redriverrealty.com' and n.title like '%1045-R%'), 1::bigint);

select tests.check('the platform owner is told about the coverage gap',
  (select count(*) from public.notifications n
   join public.profiles p on p.id = n.recipient_id
   where p.role = 'admin' and n.title like 'Unmatched: 1045-R%'), 1::bigint);

-- Routing runs repeatedly on a schedule, so the notice must not repeat with it.
select app.notify_unmatched((select id from public.opportunities where code = '1045-R'));
select app.notify_unmatched((select id from public.opportunities where code = '1045-R'));

select tests.check('an unmatched opportunity is reported once, not once per sweep',
  (select count(*) from public.notifications n
   join public.profiles p on p.id = n.recipient_id
   where p.email = 'tasha@redriverrealty.com' and n.title like '%1045-R%'), 1::bigint);

-- ---------------------------------------------------------------------------
-- 5. Status history is recorded by the database, not by a call site
-- ---------------------------------------------------------------------------
select tests.check('routing a new opportunity is recorded in history',
  (select count(*) from public.status_history
   where entity_type = 'opportunity'
     and entity_id = current_setting('tests.trigger_opp')::uuid
     and from_status = 'matching' and to_status = 'offered'), 1::bigint);

select tests.check('an expiry re-route is recorded in history',
  (select count(*) from public.status_history
   where entity_type = 'opportunity'
     and entity_id = (select id from public.opportunities where code = '1045-R')
     and to_status = 'awaiting_contractor'), 1::bigint);

-- ---------------------------------------------------------------------------
-- 6. A request's status follows its opportunities
-- ---------------------------------------------------------------------------
select tests.set_user('danielle@redriverrealty.com');
set role authenticated;
select public.submit_repair_request($json${
  "address_line1": "12 Lifecycle Lane", "city": "Alexandria", "state": "LA", "zip": "71301",
  "transaction_type": "buyer_side", "contact_name": "Danielle Ortiz",
  "items": [
    {"trade": "plumbing",   "description": "Leak."},
    {"trade": "electrical", "description": "Panel."}
  ]
}$json$::jsonb);
reset role;
select tests.clear_user();

select tests.check('a freshly routed request is still just submitted',
  (select status::text from public.repair_requests where address_line1 = '12 Lifecycle Lane'),
  'submitted');

update public.opportunities set status = 'accepted'
where request_id = (select id from public.repair_requests where address_line1 = '12 Lifecycle Lane')
  and trade_key = 'plumbing';

select tests.check('one accepted trade moves the request to in progress',
  (select status::text from public.repair_requests where address_line1 = '12 Lifecycle Lane'),
  'in_progress');

update public.opportunities set status = 'completed'
where request_id = (select id from public.repair_requests where address_line1 = '12 Lifecycle Lane');

select tests.check('every trade finished completes the request',
  (select status::text from public.repair_requests where address_line1 = '12 Lifecycle Lane'),
  'completed');

select tests.check('the request status change is recorded in history',
  (select count(*) from public.status_history
   where entity_type = 'repair_request'
     and entity_id = (select id from public.repair_requests where address_line1 = '12 Lifecycle Lane')
     and to_status = 'completed'), 1::bigint);

-- ---------------------------------------------------------------------------
-- 7. The manual sweep is for administrators only
-- ---------------------------------------------------------------------------
select tests.set_user('danielle@redriverrealty.com');
set role authenticated;
select tests.check_raises('an agent cannot run the offer sweep',
  $sql$ select public.run_offer_sweep() $sql$);
reset role;
select tests.clear_user();

select tests.set_user('jerry@wileyplumbingla.com');
set role authenticated;
select tests.check_raises('a contractor cannot run the offer sweep',
  $sql$ select public.run_offer_sweep() $sql$);
reset role;
select tests.clear_user();

select tests.set_user('admin@askcenla.com');
set role authenticated;
select tests.check('an administrator can run the offer sweep on demand',
  (select public.run_offer_sweep() >= 0), true);
reset role;
select tests.clear_user();
