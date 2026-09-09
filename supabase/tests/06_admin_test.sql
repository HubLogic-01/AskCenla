-- ===========================================================================
-- AskCENLA Repair Network — administration test suite
--
-- Covers the contractor approval workflow, set-replacement of trades and
-- territories, and the marketplace metrics view.
--
-- The view matters as much as the functions: it is not security_invoker, so it
-- runs with the owner's rights and its own WHERE clause is the only thing
-- stopping any signed-in user from reading whole-marketplace numbers.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Metrics view: admin only
-- ---------------------------------------------------------------------------
select tests.set_user('danielle@redriverrealty.com');
set role authenticated;
select tests.check('an agent gets no marketplace metrics',
  (select count(*) from public.marketplace_metrics), 0::bigint);
reset role;
select tests.clear_user();

select tests.set_user('jerry@wileyplumbingla.com');
set role authenticated;
select tests.check('a contractor gets no marketplace metrics',
  (select count(*) from public.marketplace_metrics), 0::bigint);
reset role;
select tests.clear_user();

select tests.set_user('renee@redriverrealty.com');
set role authenticated;
select tests.check('a broker gets no marketplace metrics',
  (select count(*) from public.marketplace_metrics), 0::bigint);
reset role;
select tests.clear_user();

select tests.set_user('admin@askcenla.com');
set role authenticated;
select tests.check('an administrator gets exactly one metrics row',
  (select count(*) from public.marketplace_metrics), 1::bigint);
reset role;
select tests.clear_user();

-- The numbers must match what a direct count says, or the dashboard is fiction.
-- These run inside an admin session because the view is empty without one —
-- which is the point of the four checks above.
select tests.set_user('admin@askcenla.com');
set role authenticated;

select tests.check('unmatched opportunities are counted correctly',
  (select m.unmatched_opportunities::numeric from public.marketplace_metrics m),
  (select count(*)::numeric from public.opportunities where status = 'awaiting_contractor'));

select tests.check('active members are counted correctly',
  (select m.active_members::numeric from public.marketplace_metrics m),
  (select count(*)::numeric from public.contractors where membership_status = 'active'));

select tests.check('recurring revenue is members times the fee',
  (select m.monthly_recurring_revenue::numeric from public.marketplace_metrics m),
  (select (count(*) * 199)::numeric from public.contractors where membership_status = 'active'));

select tests.check('requests this month are counted correctly',
  (select m.requests_this_month::numeric from public.marketplace_metrics m),
  (select count(*)::numeric from public.repair_requests
   where date_trunc('month', submitted_at) = date_trunc('month', now())));

select tests.check('the acceptance rate is a percentage, not a fraction',
  (select m.acceptance_rate between 0 and 100 from public.marketplace_metrics m), true);

select tests.check('average response time is measured from the ladder',
  (select m.avg_response_hours > 0 from public.marketplace_metrics m), true);

reset role;
select tests.clear_user();

-- ---------------------------------------------------------------------------
-- Approving a contractor
--
-- Heritage Flooring is seeded as pending_approval and inactive, which is why
-- the flooring gap on 1044-O is a genuine gap.
-- ---------------------------------------------------------------------------
select tests.check('an unapproved contractor is invisible to matching',
  (select count(*) from app.eligible_contractors('flooring', null, '{}')), 0::bigint);

select tests.set_user('jerry@wileyplumbingla.com');
set role authenticated;
select tests.check_raises('a contractor cannot approve themselves',
  $sql$ select public.set_contractor_membership(app.my_contractor_id(), 'active', true) $sql$);
select tests.check_raises('a contractor cannot approve a rival',
  $sql$ select public.set_contractor_membership('c0000000-0000-4000-8000-00000000000d', 'active', true) $sql$);
reset role;
select tests.clear_user();

select tests.set_user('danielle@redriverrealty.com');
set role authenticated;
select tests.check_raises('an agent cannot approve a contractor',
  $sql$ select public.set_contractor_membership('c0000000-0000-4000-8000-00000000000d', 'active', true) $sql$);
reset role;
select tests.clear_user();

select tests.set_user('admin@askcenla.com');
set role authenticated;
select public.set_contractor_membership('c0000000-0000-4000-8000-00000000000d', 'active', true);
reset role;
select tests.clear_user();

select tests.check('approving sets the membership status',
  (select membership_status::text from public.contractors
   where id = 'c0000000-0000-4000-8000-00000000000d'), 'active');

select tests.check('approving activates the account',
  (select is_active from public.contractors
   where id = 'c0000000-0000-4000-8000-00000000000d'), true);

-- The point of approving: the coverage gap closes.
select tests.check('an approved contractor becomes visible to matching',
  (select count(*) from app.eligible_contractors('flooring', null, '{}')), 1::bigint);

-- Approval is worth telling someone about, but only when it is an approval.
select tests.check('the contractor is told their membership went live',
  (select count(*) from public.notifications n
   where n.title = 'Your AskCENLA membership is active'), 0::bigint);

-- (Heritage has no linked profile in the seed, hence zero above. Do it again
-- with a contractor that does have one, to prove the notification fires.)
select tests.set_user('admin@askcenla.com');
set role authenticated;
select public.set_contractor_membership('c0000000-0000-4000-8000-000000000001', 'past_due', false);
select public.set_contractor_membership('c0000000-0000-4000-8000-000000000001', 'active', true);
reset role;
select tests.clear_user();

select tests.check('reinstating a contractor with an account notifies them',
  (select count(*) from public.notifications n
   join public.profiles p on p.id = n.recipient_id
   where p.email = 'jerry@wileyplumbingla.com'
     and n.title = 'Your AskCENLA membership is active'), 1::bigint);

-- Suspending must actually stop the work reaching them.
select tests.set_user('admin@askcenla.com');
set role authenticated;
select public.set_contractor_membership('c0000000-0000-4000-8000-000000000001', 'past_due', true);
reset role;
select tests.clear_user();

select tests.check('a past-due contractor drops out of matching',
  (select count(*) from app.eligible_contractors('plumbing', null, '{}') ec
   where ec.contractor_id = 'c0000000-0000-4000-8000-000000000001'), 0::bigint);

select tests.set_user('admin@askcenla.com');
set role authenticated;
select public.set_contractor_membership('c0000000-0000-4000-8000-000000000001', 'active', true);
reset role;
select tests.clear_user();

-- ---------------------------------------------------------------------------
-- Trades and territories: replace-the-set
-- ---------------------------------------------------------------------------
select tests.set_user('admin@askcenla.com');
set role authenticated;
select public.set_contractor_trades('c0000000-0000-4000-8000-00000000000d',
  array['flooring', 'carpentry']);
reset role;
select tests.clear_user();

select tests.check('setting trades replaces the whole set',
  (select string_agg(trade_key, ',' order by trade_key) from public.contractor_trades
   where contractor_id = 'c0000000-0000-4000-8000-00000000000d'),
  'carpentry,flooring');

select tests.set_user('admin@askcenla.com');
set role authenticated;
select public.set_contractor_trades('c0000000-0000-4000-8000-00000000000d', array['flooring']);
reset role;
select tests.clear_user();

select tests.check('setting trades again removes what was dropped',
  (select string_agg(trade_key, ',' order by trade_key) from public.contractor_trades
   where contractor_id = 'c0000000-0000-4000-8000-00000000000d'),
  'flooring');

-- A contractor manages their own trades; that is their business profile.
select tests.set_user('jerry@wileyplumbingla.com');
set role authenticated;
select public.set_contractor_trades(app.my_contractor_id(), array['plumbing', 'septic']);
select tests.check_raises('a contractor cannot set another contractor''s trades',
  $sql$ select public.set_contractor_trades('c0000000-0000-4000-8000-00000000000d', array['flooring']) $sql$);
select tests.check_raises('an unknown trade is rejected',
  $sql$ select public.set_contractor_trades(app.my_contractor_id(), array['teleportation']) $sql$);
reset role;
select tests.clear_user();

select tests.check('a contractor can set their own trades',
  (select string_agg(trade_key, ',' order by trade_key) from public.contractor_trades
   where contractor_id = 'c0000000-0000-4000-8000-000000000001'),
  'plumbing,septic');

select tests.check('a rejected trade change leaves the previous set untouched',
  (select string_agg(trade_key, ',' order by trade_key) from public.contractor_trades
   where contractor_id = 'c0000000-0000-4000-8000-00000000000d'),
  'flooring');

-- Territories behave the same way.
select tests.set_user('admin@askcenla.com');
set role authenticated;
select public.set_contractor_territories('c0000000-0000-4000-8000-00000000000d',
  array[(select id from public.territories where name = 'Alexandria'),
        (select id from public.territories where name = 'Pineville')]);
reset role;
select tests.clear_user();

select tests.check('setting territories replaces the whole set',
  (select count(*) from public.contractor_territories
   where contractor_id = 'c0000000-0000-4000-8000-00000000000d'), 2::bigint);

select tests.set_user('admin@askcenla.com');
set role authenticated;
select tests.check_raises('an unknown territory is rejected',
  $sql$ select public.set_contractor_territories('c0000000-0000-4000-8000-00000000000d',
        array['00000000-0000-4000-8000-000000000000'::uuid]) $sql$);
reset role;
select tests.clear_user();

select tests.check('a rejected territory change leaves the previous set untouched',
  (select count(*) from public.contractor_territories
   where contractor_id = 'c0000000-0000-4000-8000-00000000000d'), 2::bigint);

-- ---------------------------------------------------------------------------
-- Status history is readable by the people who own the work
-- ---------------------------------------------------------------------------
select tests.set_user('danielle@redriverrealty.com');
set role authenticated;
select tests.check('an agent sees history for their own property',
  (select count(*) > 0 from public.status_history h
   where h.entity_type = 'opportunity'
     and h.entity_id in (select o.id from public.opportunities o
                         join public.repair_requests r on r.id = o.request_id
                         where r.reference = 1042)), true);

select tests.check('an agent sees no history for another agent''s property',
  (select count(*) from public.status_history h
   where h.entity_type = 'opportunity'
     and h.entity_id in (select o.id from public.opportunities o
                         join public.repair_requests r on r.id = o.request_id
                         where r.reference = 1044)), 0::bigint);
reset role;
select tests.clear_user();
