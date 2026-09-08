-- ===========================================================================
-- AskCENLA Repair Network — contractor accept / decline test suite
--
-- These three functions are SECURITY DEFINER, so they run with rights the
-- caller does not have. That makes their own authorisation checks the entire
-- security boundary, and the abuse cases below matter as much as the happy
-- path: accepting somebody else's offer, accepting twice, an agent posing as a
-- contractor, and re-routing work that is already under way.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Accept: 1047-P is offered to Wiley Plumbing.
-- ---------------------------------------------------------------------------
select tests.set_user('jerry@wileyplumbingla.com');
set role authenticated;

select tests.check('a contractor cannot see the address before accepting',
  (select count(*) from public.repair_requests where address_line1 = '7 Windemere Court'), 0::bigint);

select public.accept_opportunity((select id from public.opportunities where code = '1047-P'));

select tests.check('accepting claims the opportunity',
  (select status::text from public.opportunities where code = '1047-P'), 'accepted');

-- The whole pre-acceptance boundary flips on this one row, so check it from
-- the contractor's own session rather than from a privileged one.
select tests.check('accepting reveals the property to that contractor',
  (select address_line1 from public.repair_requests where address_line1 = '7 Windemere Court'),
  '7 Windemere Court');

select tests.check('accepting reveals the agent contact details',
  (select contact_email from public.repair_requests where address_line1 = '7 Windemere Court'),
  'marcus@redriverrealty.com');

select tests.check('accepting reveals the inspection report',
  (select count(*) from public.attachments a
   join public.repair_requests r on r.id = a.request_id
   where r.address_line1 = '7 Windemere Court' and a.kind = 'inspection_report'), 1::bigint);

reset role;
select tests.clear_user();

select tests.check('accepting records the contractor on the opportunity',
  (select c.business_name from public.opportunities o
   join public.contractors c on c.id = o.contractor_id
   where o.code = '1047-P'),
  'Wiley Plumbing');

select tests.check('the offer is marked accepted, not left pending',
  (select a.outcome::text from public.opportunity_assignments a
   join public.opportunities o on o.id = a.opportunity_id
   where o.code = '1047-P' and a.contractor_id = 'c0000000-0000-4000-8000-000000000001'),
  'accepted');

select tests.check('the agent is told who took the job',
  (select count(*) from public.notifications n
   join public.profiles p on p.id = n.recipient_id
   where p.email = 'marcus@redriverrealty.com'
     and n.title like 'Wiley Plumbing accepted 1047-P%'), 1::bigint);

select tests.check('accepting moves the parent request to in progress',
  (select status::text from public.repair_requests where address_line1 = '7 Windemere Court'),
  'in_progress');

-- ---------------------------------------------------------------------------
-- Accept: abuse cases
-- ---------------------------------------------------------------------------

-- Already accepted by this contractor.
select tests.set_user('jerry@wileyplumbingla.com');
set role authenticated;
select tests.check_raises('the same opportunity cannot be accepted twice',
  $sql$ select public.accept_opportunity((select id from public.opportunities where code = '1047-P')) $sql$);

-- Offered to somebody else entirely (1043-L is with Riverbend Tree Service).
select tests.check_raises('a contractor cannot accept an offer made to someone else',
  $sql$ select public.accept_opportunity((select id from public.opportunities where code = '1043-L')) $sql$);

-- Never offered to anyone in this trade.
select tests.check_raises('a contractor cannot accept an unrelated opportunity',
  $sql$ select public.accept_opportunity((select id from public.opportunities where code = '1042-E')) $sql$);
reset role;
select tests.clear_user();

select tests.check('a failed accept leaves the other contractor''s offer intact',
  (select a.outcome::text from public.opportunity_assignments a
   join public.opportunities o on o.id = a.opportunity_id
   where o.code = '1043-L'),
  'pending');

-- An agent has no contractor identity, so there is nothing for them to claim.
select tests.set_user('danielle@redriverrealty.com');
set role authenticated;
select tests.check_raises('an agent cannot accept an opportunity',
  $sql$ select public.accept_opportunity((select id from public.opportunities where code = '1045-R')) $sql$);
reset role;
select tests.clear_user();

-- ---------------------------------------------------------------------------
-- Decline: 1044-P is offered to Red River Plumbing after the Phase 4 sweep.
-- Wiley already expired on it, so declining should exhaust the ladder.
-- ---------------------------------------------------------------------------
update public.profiles
   set contractor_id = 'c0000000-0000-4000-8000-000000000002'
 where email = 'jerry@wileyplumbingla.com';

select tests.set_user('jerry@wileyplumbingla.com');
set role authenticated;
select public.decline_opportunity((select id from public.opportunities where code = '1044-P'));
reset role;
select tests.clear_user();

select tests.check('declining records the answer',
  (select a.outcome::text from public.opportunity_assignments a
   join public.opportunities o on o.id = a.opportunity_id
   where o.code = '1044-P' and a.contractor_id = 'c0000000-0000-4000-8000-000000000002'),
  'declined');

select tests.check('declining never assigns the job to the decliner',
  (select contractor_id from public.opportunities where code = '1044-P'),
  null::uuid);

-- Wiley (expired) and Red River (declined) were the only Pineville plumbers.
select tests.check('a decline that exhausts the ladder lands in awaiting_contractor',
  (select status::text from public.opportunities where code = '1044-P'),
  'awaiting_contractor');

select tests.check('the agent is told the trade needs sourcing',
  (select count(*) from public.notifications n
   join public.profiles p on p.id = n.recipient_id
   where p.email = 'marcus@redriverrealty.com' and n.title like '%1044-P%'), 1::bigint);

-- Restore the demo contractor link.
update public.profiles
   set contractor_id = 'c0000000-0000-4000-8000-000000000001'
 where email = 'jerry@wileyplumbingla.com';

-- ---------------------------------------------------------------------------
-- Decline that advances rather than exhausts.
-- 1042-R is awaiting a contractor; put a fresh offer on it and decline that.
-- ---------------------------------------------------------------------------
do $$
declare
  v_opp uuid;
begin
  select id into v_opp from public.opportunities where code = '1045-R';
  -- Reset 1045-R (left awaiting_contractor by the Phase 4 sweep) so Kisatchie
  -- can be offered it again, giving us a clean decline to observe.
  delete from public.opportunity_assignments where opportunity_id = v_opp;
  update public.opportunities set status = 'matching' where id = v_opp;
  perform app.route_opportunity(v_opp);
end $$;

select tests.check('the reset opportunity is offered to the roofing contractor',
  (select c.business_name from public.opportunity_assignments a
   join public.opportunities o on o.id = a.opportunity_id
   join public.contractors c on c.id = a.contractor_id
   where o.code = '1045-R' and a.outcome = 'pending'),
  'Kisatchie Roofing');

-- ---------------------------------------------------------------------------
-- Response times feed the routing score
-- ---------------------------------------------------------------------------
select tests.check('a response updates the contractor''s average response time',
  (select avg_response_hours <> 3.40 from public.contractors
   where id = 'c0000000-0000-4000-8000-000000000001'), true);

select tests.check('accepting increments the acceptance counter',
  (select offers_accepted from public.contractors
   where id = 'c0000000-0000-4000-8000-000000000001'), 28);

-- An ignored offer must cost the contractor, or there is no incentive to answer.
do $$
declare
  v_before numeric;
  v_after  numeric;
  v_opp    uuid;
begin
  select avg_response_hours into v_before
  from public.contractors where id = 'c0000000-0000-4000-8000-000000000008';

  select id into v_opp from public.opportunities where code = '1045-R';
  -- Backdate the OFFER as well as its deadline. The sweep only ever fires
  -- once the 24-hour window has elapsed, so an expiry always represents a
  -- day of silence — expiring an offer made seconds ago would record a
  -- suspiciously fast response and test nothing.
  update public.opportunity_assignments
     set offered_at = now() - interval '25 hours',
         expires_at = now() - interval '1 hour'
   where opportunity_id = v_opp and outcome = 'pending';

  perform app.expire_stale_offers();

  select avg_response_hours into v_after
  from public.contractors where id = 'c0000000-0000-4000-8000-000000000008';

  perform set_config('tests.avg_before', v_before::text, false);
  perform set_config('tests.avg_after', v_after::text, false);
end $$;

select tests.check('letting an offer expire worsens the response average',
  (current_setting('tests.avg_after')::numeric > current_setting('tests.avg_before')::numeric),
  true);

-- ---------------------------------------------------------------------------
-- Administrative re-route
-- ---------------------------------------------------------------------------
select tests.set_user('jerry@wileyplumbingla.com');
set role authenticated;
select tests.check_raises('a contractor cannot re-route an opportunity',
  $sql$ select public.reroute_opportunity((select id from public.opportunities where code = '1043-L')) $sql$);
reset role;
select tests.clear_user();

select tests.set_user('admin@askcenla.com');
set role authenticated;

-- Work already accepted must never be pulled out from under a contractor.
select tests.check_raises('an accepted opportunity cannot be re-routed',
  $sql$ select public.reroute_opportunity((select id from public.opportunities where code = '1047-P')) $sql$);

-- 1043-L is offered to the only tree contractor, so re-routing withdraws that
-- offer and finds nobody — the important part is that it does not end up with
-- two live offers.
select public.reroute_opportunity((select id from public.opportunities where code = '1043-L'));
reset role;
select tests.clear_user();

select tests.check('re-routing withdraws the offer it replaced',
  (select a.outcome::text from public.opportunity_assignments a
   join public.opportunities o on o.id = a.opportunity_id
   where o.code = '1043-L' and a.contractor_id = 'c0000000-0000-4000-8000-00000000000c'),
  'withdrawn');

select tests.check('an opportunity never has two live offers at once',
  (select count(*) from (
     select a.opportunity_id
     from public.opportunity_assignments a
     where a.outcome = 'pending'
     group by a.opportunity_id
     having count(*) > 1
   ) doubled), 0::bigint);
