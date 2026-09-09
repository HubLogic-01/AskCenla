-- ===========================================================================
-- AskCENLA Repair Network — billing test suite
--
-- Webhook correctness is not "did the HTTP call succeed" — that is the Edge
-- Function's job and Stripe's SDK verifies the signature. What can actually go
-- wrong is here: applying the same event twice, applying a stale one, mapping
-- a payment state to the wrong membership decision, and letting billing
-- overrule an administrator.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- The mapping, value by value. This function decides who keeps receiving work.
-- ---------------------------------------------------------------------------
select tests.check('an active subscription means an active membership',
  app.membership_for_stripe_status('active')::text, 'active');
select tests.check('a trialing subscription means a trial membership',
  app.membership_for_stripe_status('trialing')::text, 'trial');
select tests.check('a failed payment pauses rather than cancels',
  app.membership_for_stripe_status('past_due')::text, 'past_due');
select tests.check('an unpaid subscription pauses too',
  app.membership_for_stripe_status('unpaid')::text, 'past_due');
select tests.check('a canceled subscription ends the membership',
  app.membership_for_stripe_status('canceled')::text, 'cancelled');
select tests.check('an expired incomplete checkout ends the membership',
  app.membership_for_stripe_status('incomplete_expired')::text, 'cancelled');

-- 'incomplete' is checkout in flight: nothing paid, so nothing granted and
-- nothing taken away.
select tests.check('checkout in flight changes nothing',
  app.membership_for_stripe_status('incomplete'), null::public.membership_status);
select tests.check('an unrecognised Stripe status changes nothing',
  app.membership_for_stripe_status('something_new_from_stripe'), null::public.membership_status);

-- ---------------------------------------------------------------------------
-- Applying an event. Riverbend Tree Service is seeded on a trial.
-- ---------------------------------------------------------------------------
select tests.check('the contractor starts on a trial',
  (select membership_status::text from public.contractors
   where id = 'c0000000-0000-4000-8000-00000000000c'), 'trial');

select public.apply_subscription_event(
  'evt_001', 'customer.subscription.updated', now() - interval '10 minutes',
  'c0000000-0000-4000-8000-00000000000c',
  jsonb_build_object(
    'id', 'sub_riverbend', 'customer', 'cus_riverbend', 'status', 'active',
    'price_id', 'price_membership_199',
    'current_period_start', (now() - interval '1 day')::text,
    'current_period_end', (now() + interval '29 days')::text,
    'cancel_at_period_end', false
  )
);

select tests.check('a paid subscription activates the membership',
  (select membership_status::text from public.contractors
   where id = 'c0000000-0000-4000-8000-00000000000c'), 'active');

select tests.check('the subscription row is created',
  (select stripe_subscription_id from public.subscriptions
   where contractor_id = 'c0000000-0000-4000-8000-00000000000c'), 'sub_riverbend');

select tests.check('the renewal date is stored',
  (select current_period_end > now() from public.subscriptions
   where contractor_id = 'c0000000-0000-4000-8000-00000000000c'), true);

-- ---------------------------------------------------------------------------
-- Idempotency. Stripe retries on any non-2xx and can redeliver on success.
-- ---------------------------------------------------------------------------
select (public.apply_subscription_event(
  'evt_001', 'customer.subscription.updated', now() - interval '10 minutes',
  'c0000000-0000-4000-8000-00000000000c',
  jsonb_build_object('id', 'sub_riverbend', 'customer', 'cus_riverbend', 'status', 'active')
) ->> 'reason') as duplicate_reason \gset

select tests.check('a redelivered event is recognised as a duplicate',
  :'duplicate_reason'::text, 'duplicate'::text);

select tests.check('a redelivered event is recorded only once',
  (select count(*) from public.billing_events where stripe_event_id = 'evt_001'), 1::bigint);

-- ---------------------------------------------------------------------------
-- Out-of-order delivery. Stripe guarantees delivery, not sequence.
-- ---------------------------------------------------------------------------
select public.apply_subscription_event(
  'evt_002', 'customer.subscription.updated', now(),
  'c0000000-0000-4000-8000-00000000000c',
  jsonb_build_object('id', 'sub_riverbend', 'customer', 'cus_riverbend', 'status', 'past_due')
);

select tests.check('a later event applies',
  (select membership_status::text from public.contractors
   where id = 'c0000000-0000-4000-8000-00000000000c'), 'past_due');

-- An event created BEFORE the one already applied must not revive a stale state.
select (public.apply_subscription_event(
  'evt_003', 'customer.subscription.updated', now() - interval '1 hour',
  'c0000000-0000-4000-8000-00000000000c',
  jsonb_build_object('id', 'sub_riverbend', 'customer', 'cus_riverbend', 'status', 'active')
) ->> 'reason') as stale_reason \gset

select tests.check('an event that arrives late but happened earlier is ignored',
  :'stale_reason'::text, 'stale'::text);

select tests.check('a stale event does not revive the old membership',
  (select membership_status::text from public.contractors
   where id = 'c0000000-0000-4000-8000-00000000000c'), 'past_due');

-- ---------------------------------------------------------------------------
-- The consequence that matters: a failed payment stops the work.
-- ---------------------------------------------------------------------------
select tests.check('a past-due contractor stops receiving opportunities',
  (select count(*) from app.eligible_contractors('tree_landscaping', null, '{}') ec
   where ec.contractor_id = 'c0000000-0000-4000-8000-00000000000c'), 0::bigint);

-- Riverbend has no linked sign-in account in the seed, so prove the
-- notification with a contractor that does. Asserting zero above would have
-- passed for the wrong reason.
select public.apply_subscription_event(
  'evt_wiley_pastdue', 'invoice.payment_failed', now(),
  'c0000000-0000-4000-8000-000000000001',
  jsonb_build_object('id', 'sub_wiley', 'customer', 'cus_wiley', 'status', 'past_due')
);

select tests.check('the contractor is told why their work stopped',
  (select count(*) from public.notifications n
   join public.profiles p on p.id = n.recipient_id
   where p.email = 'jerry@wileyplumbingla.com'
     and n.title = 'Payment problem — new opportunities paused'), 1::bigint);

select public.apply_subscription_event(
  'evt_wiley_recovered', 'invoice.paid', now() + interval '1 second',
  'c0000000-0000-4000-8000-000000000001',
  jsonb_build_object('id', 'sub_wiley', 'customer', 'cus_wiley', 'status', 'active')
);

select tests.check('a recovering contractor is told they are back',
  (select count(*) from public.notifications n
   join public.profiles p on p.id = n.recipient_id
   where p.email = 'jerry@wileyplumbingla.com'
     and n.title = 'Payment received — you are back in the rotation'), 1::bigint);

select public.apply_subscription_event(
  'evt_wiley_renewal', 'invoice.paid', now() + interval '2 seconds',
  'c0000000-0000-4000-8000-000000000001',
  jsonb_build_object('id', 'sub_wiley', 'customer', 'cus_wiley', 'status', 'active')
);

-- A monthly renewal of an already-active membership is not news.
select tests.check('a renewal that changes nothing sends no second notice',
  (select count(*) from public.notifications n
   join public.profiles p on p.id = n.recipient_id
   where p.email = 'jerry@wileyplumbingla.com'
     and n.title = 'Payment received — you are back in the rotation'), 1::bigint);

select tests.check('the platform owner is told the network shrank',
  (select count(*) from public.notifications n
   join public.profiles p on p.id = n.recipient_id
   where p.role = 'admin'
     and n.title like 'Riverbend Tree Service membership is past_due%'), 1::bigint);

-- Recovery.
select public.apply_subscription_event(
  'evt_004', 'invoice.paid', now() + interval '1 minute',
  'c0000000-0000-4000-8000-00000000000c',
  jsonb_build_object('id', 'sub_riverbend', 'customer', 'cus_riverbend', 'status', 'active')
);

select tests.check('a successful payment restores the membership',
  (select membership_status::text from public.contractors
   where id = 'c0000000-0000-4000-8000-00000000000c'), 'active');

select tests.check('a restored contractor receives opportunities again',
  (select count(*) from app.eligible_contractors('tree_landscaping', null, '{}') ec
   where ec.contractor_id = 'c0000000-0000-4000-8000-00000000000c'), 1::bigint);

-- ---------------------------------------------------------------------------
-- Billing must not overrule an administrator
--
-- Heritage Flooring was approved in the admin suite. Put it back to pending and
-- confirm that paying does not let it in through the side door.
-- ---------------------------------------------------------------------------
select tests.set_user('admin@askcenla.com');
set role authenticated;
select public.set_contractor_membership('c0000000-0000-4000-8000-00000000000d', 'pending_approval', false);
reset role;
select tests.clear_user();

select public.apply_subscription_event(
  'evt_005', 'customer.subscription.created', now(),
  'c0000000-0000-4000-8000-00000000000d',
  jsonb_build_object('id', 'sub_heritage', 'customer', 'cus_heritage', 'status', 'active')
);

select tests.check('paying does not activate an account awaiting review',
  (select is_active from public.contractors
   where id = 'c0000000-0000-4000-8000-00000000000d'), false);

select tests.check('an unreviewed contractor still receives no work',
  (select count(*) from app.eligible_contractors('flooring', null, '{}') ec
   where ec.contractor_id = 'c0000000-0000-4000-8000-00000000000d'), 0::bigint);

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
select tests.set_user('jerry@wileyplumbingla.com');
set role authenticated;

select tests.check_raises('a contractor cannot apply a subscription event',
  $sql$ select public.apply_subscription_event('evt_hack', 'x', now(),
        app.my_contractor_id(), '{"status":"active"}'::jsonb) $sql$);

select tests.check('a contractor can read their own membership',
  ((public.my_membership() ->> 'monthly_fee')::numeric), 199::numeric);

select tests.check('raw billing payloads are not readable by a contractor',
  (select count(*) from public.billing_events), 0::bigint);

reset role;
select tests.clear_user();

select tests.set_user('danielle@redriverrealty.com');
set role authenticated;
select tests.check_raises('an agent has no membership to read',
  $sql$ select public.my_membership() $sql$);
select tests.check('raw billing payloads are not readable by an agent',
  (select count(*) from public.billing_events), 0::bigint);
reset role;
select tests.clear_user();

select tests.set_user('admin@askcenla.com');
set role authenticated;
select tests.check('an administrator can audit billing events',
  (select count(*) > 0 from public.billing_events), true);
reset role;
select tests.clear_user();
