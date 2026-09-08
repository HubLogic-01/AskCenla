-- ===========================================================================
-- AskCENLA Repair Network — submission and routing test suite
--
-- Exercises public.submit_repair_request() and app.route_opportunity() as a
-- real signed-in agent, and checks both the happy path (one property becomes
-- N routed opportunities) and the abuse cases (filing as someone else,
-- routing to a past-due contractor, a genuine coverage gap).
--
-- Depends on the helpers created by 01_rls_test.sql.
-- ===========================================================================

-- Which contractor an opportunity was most recently offered to.
create or replace function tests.offered_to(p_opportunity_id uuid)
returns uuid
language sql
stable
security definer
as $$
  select contractor_id
  from public.opportunity_assignments
  where opportunity_id = p_opportunity_id
  order by position desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Happy path: four trades, one submission.
-- ---------------------------------------------------------------------------
select tests.set_user('danielle@redriverrealty.com');
set role authenticated;

select public.submit_repair_request($json${
  "address_line1": "77 Elliott Street",
  "city": "Alexandria",
  "state": "LA",
  "zip": "71301",
  "mls_number": "CEN-190001",
  "transaction_type": "buyer_side",
  "contact_name": "Danielle Ortiz",
  "contact_brokerage": "Red River Realty Group",
  "contact_phone": "3184450112",
  "contact_email": "danielle@redriverrealty.com",
  "items": [
    {"trade": "plumbing",   "description": "Leak under the kitchen sink.",     "urgency": "urgent"},
    {"trade": "electrical", "description": "Panel needs GFCI protection.",     "urgency": "standard"},
    {"trade": "hvac",       "description": "Condenser not cooling.",           "urgency": "standard"},
    {"trade": "roofing",    "description": "Missing shingles on rear slope.",  "urgency": "flexible"}
  ]
}$json$::jsonb) as submission \gset

reset role;
select tests.clear_user();

-- The RPC returns the reference and the generated opportunity codes.
select tests.check('submit creates one request',
  (select count(*) from public.repair_requests where address_line1 = '77 Elliott Street'), 1::bigint);

select tests.check('submit creates one opportunity per trade',
  (select count(*) from public.opportunities o
   join public.repair_requests r on r.id = o.request_id
   where r.address_line1 = '77 Elliott Street'), 4::bigint);

select tests.check('submit creates one repair item per trade',
  (select count(*) from public.repair_items i
   join public.repair_requests r on r.id = i.request_id
   where r.address_line1 = '77 Elliott Street'), 4::bigint);

-- The code trigger runs regardless of who inserted the row.
select tests.check('opportunity codes are generated from reference + trade letter',
  (select string_agg(right(o.code, 1), ',' order by o.code)
   from public.opportunities o
   join public.repair_requests r on r.id = o.request_id
   where r.address_line1 = '77 Elliott Street'),
  'E,H,P,R');

select tests.check('the ZIP resolved to a service territory',
  (select t.name from public.repair_requests r
   join public.territories t on t.id = r.territory_id
   where r.address_line1 = '77 Elliott Street'),
  'Alexandria');

-- Routing ran inside the same call: every trade with a matching contractor is
-- already offered to exactly one of them.
select tests.check('every routable trade was offered immediately',
  (select count(*) from public.opportunities o
   join public.repair_requests r on r.id = o.request_id
   where r.address_line1 = '77 Elliott Street' and o.status = 'offered'), 4::bigint);

select tests.check('each offer went to exactly one contractor',
  (select count(*) from public.opportunity_assignments a
   join public.opportunities o on o.id = a.opportunity_id
   join public.repair_requests r on r.id = o.request_id
   where r.address_line1 = '77 Elliott Street'), 4::bigint);

select tests.check('offers carry a response deadline',
  (select count(*) from public.opportunities o
   join public.repair_requests r on r.id = o.request_id
   where r.address_line1 = '77 Elliott Street' and o.offer_expires_at > now()), 4::bigint);

-- Rotation: plumbing should go to Wiley (rotation_priority 1, best stats),
-- not to one of the other two plumbers.
select tests.check('routing picked the top-ranked contractor for the trade',
  (select c.business_name from public.opportunities o
   join public.repair_requests r on r.id = o.request_id
   join public.contractors c on c.id = tests.offered_to(o.id)
   where r.address_line1 = '77 Elliott Street' and o.trade_key = 'plumbing'),
  'Wiley Plumbing');

-- A past-due membership is skipped with no admin involvement. Ironwood Roofing
-- is past_due, so roofing must have gone to Kisatchie.
select tests.check('a past-due contractor is skipped automatically',
  (select c.business_name from public.opportunities o
   join public.repair_requests r on r.id = o.request_id
   join public.contractors c on c.id = tests.offered_to(o.id)
   where r.address_line1 = '77 Elliott Street' and o.trade_key = 'roofing'),
  'Kisatchie Roofing');

select tests.check('the offered contractor was notified',
  (select count(*) from public.notifications n
   where n.kind = 'opportunity_offered'
     and n.body like '%Alexandria, LA 71301%'), 1::bigint);

-- ---------------------------------------------------------------------------
-- Coverage gap: no active flooring contractor exists anywhere.
-- ---------------------------------------------------------------------------
select tests.set_user('danielle@redriverrealty.com');
set role authenticated;
select public.submit_repair_request($json${
  "address_line1": "9 Gap Street", "city": "Alexandria", "state": "LA", "zip": "71301",
  "transaction_type": "listing_prep", "contact_name": "Danielle Ortiz",
  "items": [{"trade": "flooring", "description": "Replace laundry room vinyl."}]
}$json$::jsonb);
reset role;
select tests.clear_user();

select tests.check('an unmatchable trade lands in awaiting_contractor',
  (select o.status::text from public.opportunities o
   join public.repair_requests r on r.id = o.request_id
   where r.address_line1 = '9 Gap Street'),
  'awaiting_contractor');

select tests.check('an unmatchable trade creates no phantom offer',
  (select count(*) from public.opportunity_assignments a
   join public.opportunities o on o.id = a.opportunity_id
   join public.repair_requests r on r.id = o.request_id
   where r.address_line1 = '9 Gap Street'), 0::bigint);

-- ---------------------------------------------------------------------------
-- Abuse cases
-- ---------------------------------------------------------------------------

-- The RPC is SECURITY DEFINER, so this is the important one: a payload that
-- names another user must NOT be able to file a request on their behalf.
select tests.set_user('marcus@redriverrealty.com');
set role authenticated;
select public.submit_repair_request($json${
  "address_line1": "1 Spoof Lane", "city": "Alexandria", "state": "LA", "zip": "71301",
  "created_by": "a0000000-0000-4000-8000-000000000001",
  "brokerage_id": "b0000000-0000-4000-8000-000000000002",
  "contact_name": "Marcus Webb",
  "items": [{"trade": "plumbing", "description": "Test."}]
}$json$::jsonb);
reset role;
select tests.clear_user();

select tests.check('ownership comes from the session, never the payload',
  (select p.email from public.repair_requests r
   join public.profiles p on p.id = r.created_by
   where r.address_line1 = '1 Spoof Lane'),
  'marcus@redriverrealty.com');

select tests.check('brokerage comes from the session, never the payload',
  (select r.brokerage_id::text from public.repair_requests r
   where r.address_line1 = '1 Spoof Lane'),
  'b0000000-0000-4000-8000-000000000001');

-- A contractor is not allowed to file repair requests at all.
select tests.set_user('jerry@wileyplumbingla.com');
set role authenticated;
select tests.check_raises('a contractor cannot submit a repair request',
  $sql$ select public.submit_repair_request('{"address_line1":"x","city":"Alexandria","state":"LA","zip":"71301","contact_name":"x","items":[{"trade":"plumbing","description":"x"}]}'::jsonb) $sql$);
reset role;
select tests.clear_user();

select tests.set_user('danielle@redriverrealty.com');
set role authenticated;
select tests.check_raises('a request with no trades is rejected',
  $sql$ select public.submit_repair_request('{"address_line1":"y","city":"Alexandria","state":"LA","zip":"71301","contact_name":"y","items":[]}'::jsonb) $sql$);
reset role;
select tests.clear_user();

-- A contractor must never be offered the same opportunity twice, no matter how
-- many times routing runs.
select tests.check('re-routing never offers the same contractor twice',
  (select count(*) from (
     select a.opportunity_id, a.contractor_id
     from public.opportunity_assignments a
     group by 1, 2 having count(*) > 1
   ) dupes), 0::bigint);

-- ---------------------------------------------------------------------------
-- Client contract.
--
-- This is the EXACT payload src/services/supabaseRepository.ts builds,
-- including the empty-string and null cases the wizard produces for optional
-- fields. If the client and the function ever drift apart, this fails.
-- ---------------------------------------------------------------------------
select tests.set_user('danielle@redriverrealty.com');
set role authenticated;
select public.submit_repair_request($json${
  "address_line1": "404 Contract Way",
  "city": "Pineville",
  "state": "LA",
  "zip": "71360",
  "mls_number": "",
  "transaction_type": "seller_side",
  "contact_name": "Danielle Ortiz",
  "contact_brokerage": "Red River Realty Group",
  "contact_phone": "3184450112",
  "contact_email": "danielle@redriverrealty.com",
  "items": [
    {"trade": "hvac", "description": "Upstairs unit not cooling.", "urgency": "urgent",
     "estimate_deadline": null, "notes": null},
    {"trade": "plumbing", "description": "Running toilet.", "urgency": "flexible",
     "estimate_deadline": "2026-12-01", "notes": "Lockbox on the front door."}
  ]
}$json$::jsonb);
reset role;
select tests.clear_user();

select tests.check('an empty MLS number is stored as null, not an empty string',
  (select mls_number from public.repair_requests where address_line1 = '404 Contract Way'),
  null::text);

select tests.check('a null estimate deadline is accepted',
  (select count(*) from public.repair_items i
   join public.repair_requests r on r.id = i.request_id
   where r.address_line1 = '404 Contract Way' and i.estimate_deadline is null), 1::bigint);

select tests.check('a supplied estimate deadline is stored',
  (select i.estimate_deadline::text from public.repair_items i
   join public.repair_requests r on r.id = i.request_id
   where r.address_line1 = '404 Contract Way' and i.trade_key = 'plumbing'),
  '2026-12-01');

select tests.check('contractor notes survive the round trip',
  (select i.notes from public.repair_items i
   join public.repair_requests r on r.id = i.request_id
   where r.address_line1 = '404 Contract Way' and i.trade_key = 'plumbing'),
  'Lockbox on the front door.');

select tests.check('a Pineville ZIP routes to the Pineville territory',
  (select t.name from public.repair_requests r
   join public.territories t on t.id = r.territory_id
   where r.address_line1 = '404 Contract Way'),
  'Pineville');
