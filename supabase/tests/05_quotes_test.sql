-- ===========================================================================
-- AskCENLA Repair Network — quote test suite
--
-- The security rules for quotes are already proven in 01_rls_test.sql (an
-- agent never sees a contractor's draft). What is tested here is the part
-- these functions add: that each multi-table operation is all-or-nothing, that
-- a contractor can only work on their own quote, and that nobody can approve
-- their own pricing.
--
-- Depends on 04, which left Wiley Plumbing holding an accepted 1047-P.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Create a draft against work the contractor holds
-- ---------------------------------------------------------------------------
select tests.set_user('jerry@wileyplumbingla.com');
set role authenticated;

select (public.create_draft_quote(
  (select id from public.opportunities where code = '1047-P')
) ->> 'quote_id')::uuid as new_quote \gset

reset role;
select tests.clear_user();

select tests.check('creating a draft numbers it from the request and trade',
  (select quote_number from public.quotes where id = :'new_quote'), 'Q-1047P-01');

select tests.check('a new draft opens with one line item to type into',
  (select count(*) from public.quote_items where quote_id = :'new_quote'), 1::bigint);

select tests.check('creating a draft moves the opportunity to quote in progress',
  (select status::text from public.opportunities where code = '1047-P'), 'quote_in_progress');

select tests.check('a draft starts as a draft',
  (select status::text from public.quotes where id = :'new_quote'), 'draft');

-- ---------------------------------------------------------------------------
-- A draft is still invisible to the agent — re-checked here because this quote
-- was created through the RPC rather than seeded.
-- ---------------------------------------------------------------------------
select tests.set_user('marcus@redriverrealty.com');
set role authenticated;
select tests.check('the agent cannot see a draft created by the contractor',
  (select count(*) from public.quotes where id = :'new_quote'), 0::bigint);
select tests.check('the agent cannot see the draft''s line items',
  (select count(*) from public.quote_items where quote_id = :'new_quote'), 0::bigint);
reset role;
select tests.clear_user();

-- ---------------------------------------------------------------------------
-- Saving replaces the line items wholesale
-- ---------------------------------------------------------------------------
select tests.set_user('jerry@wileyplumbingla.com');
set role authenticated;

select public.save_quote(
  :'new_quote',
  '{"notes":"Includes parts and labor.","exclusions":"Excludes drywall repair.","tax_rate":"0","expires_on":"2026-12-31"}'::jsonb,
  '[{"description":"Camera scope of the main line","quantity":"1","unit_price":"325"},
    {"description":"Replace cast iron section","quantity":"12","unit_price":"48.50"}]'::jsonb
);

reset role;
select tests.clear_user();

select tests.check('saving replaces the starter row rather than adding to it',
  (select count(*) from public.quote_items where quote_id = :'new_quote'), 2::bigint);

select tests.check('line items keep the order they were sent in',
  (select description from public.quote_items where quote_id = :'new_quote' and position = 0),
  'Camera scope of the main line');

select tests.check('quantities and prices survive as numbers',
  (select sum(quantity * unit_price) from public.quote_items where quote_id = :'new_quote'),
  907.00::numeric);

select tests.check('terms are stored with the quote',
  (select exclusions from public.quotes where id = :'new_quote'), 'Excludes drywall repair.');

select tests.check('an expiry date is stored',
  (select expires_on::text from public.quotes where id = :'new_quote'), '2026-12-31');

-- A second save must not accumulate rows.
select tests.set_user('jerry@wileyplumbingla.com');
set role authenticated;
select public.save_quote(:'new_quote', '{"tax_rate":"0"}'::jsonb,
  '[{"description":"Camera scope of the main line","quantity":"1","unit_price":"325"}]'::jsonb);
reset role;
select tests.clear_user();

select tests.check('saving again replaces rather than appends',
  (select count(*) from public.quote_items where quote_id = :'new_quote'), 1::bigint);

-- ---------------------------------------------------------------------------
-- Ownership
-- ---------------------------------------------------------------------------
update public.profiles set contractor_id = 'c0000000-0000-4000-8000-000000000002'
 where email = 'jerry@wileyplumbingla.com';

select tests.set_user('jerry@wileyplumbingla.com');
set role authenticated;
select tests.check_raises('a contractor cannot edit another contractor''s quote',
  $sql$ select public.save_quote('00000000-0000-0000-0000-000000000000'::uuid, '{}'::jsonb, '[]'::jsonb) $sql$);
select tests.check_raises('a contractor cannot submit another contractor''s quote',
  $sql$ select public.submit_quote((select id from public.quotes where quote_number = 'Q-1047P-01')) $sql$);
reset role;
select tests.clear_user();

update public.profiles set contractor_id = 'c0000000-0000-4000-8000-000000000001'
 where email = 'jerry@wileyplumbingla.com';

-- An agent has no contractor identity, so there is nothing for them to build on.
select tests.set_user('marcus@redriverrealty.com');
set role authenticated;
select tests.check_raises('an agent cannot create a quote',
  $sql$ select public.create_draft_quote((select id from public.opportunities where code = '1047-P')) $sql$);
reset role;
select tests.clear_user();

-- Quoting requires holding the work, not merely being offered it.
select tests.set_user('jerry@wileyplumbingla.com');
set role authenticated;
select tests.check_raises('a contractor cannot quote work they do not hold',
  $sql$ select public.create_draft_quote((select id from public.opportunities where code = '1042-E')) $sql$);
reset role;
select tests.clear_user();

-- ---------------------------------------------------------------------------
-- Submitting
-- ---------------------------------------------------------------------------
select tests.set_user('jerry@wileyplumbingla.com');
set role authenticated;
select public.submit_quote(:'new_quote');
reset role;
select tests.clear_user();

select tests.check('submitting marks the quote sent',
  (select status::text from public.quotes where id = :'new_quote'), 'submitted');

select tests.check('submitting moves the opportunity to quote submitted',
  (select status::text from public.opportunities where code = '1047-P'), 'quote_submitted');

select tests.check('submitting notifies the agent',
  (select count(*) from public.notifications n
   join public.profiles p on p.id = n.recipient_id
   where p.email = 'marcus@redriverrealty.com'
     and n.title like 'Quote received — 1047-P%'), 1::bigint);

-- Now, and only now, the other side can see it.
select tests.set_user('marcus@redriverrealty.com');
set role authenticated;
select tests.check('the agent can read the quote once it is submitted',
  (select quote_number from public.quotes where id = :'new_quote'), 'Q-1047P-01');
select tests.check('the agent can read its line items',
  (select count(*) from public.quote_items where quote_id = :'new_quote'), 1::bigint);
reset role;
select tests.clear_user();

-- A sent quote is a document the agent is looking at; it must not change.
select tests.set_user('jerry@wileyplumbingla.com');
set role authenticated;
select tests.check_raises('a submitted quote cannot be edited',
  $sql$ select public.save_quote((select id from public.quotes where quote_number = 'Q-1047P-01'), '{}'::jsonb, '[]'::jsonb) $sql$);
select tests.check_raises('a quote cannot be submitted twice',
  $sql$ select public.submit_quote((select id from public.quotes where quote_number = 'Q-1047P-01')) $sql$);
reset role;
select tests.clear_user();

-- An empty quote is almost always a mistake, so the database refuses it too.
select tests.set_user('jerry@wileyplumbingla.com');
set role authenticated;
select (public.create_draft_quote(
  (select id from public.opportunities where code = '1042-P')
) ->> 'quote_id')::uuid as empty_quote \gset
select public.save_quote(:'empty_quote', '{"tax_rate":"0"}'::jsonb, '[]'::jsonb);
select set_config('tests.empty', :'empty_quote', false);
select tests.check_raises('a quote with no line items cannot be submitted',
  $sql$ select public.submit_quote(current_setting('tests.empty')::uuid) $sql$);
reset role;
select tests.clear_user();

-- ---------------------------------------------------------------------------
-- Deciding
-- ---------------------------------------------------------------------------

-- The obvious abuse: approving your own pricing.
select tests.set_user('jerry@wileyplumbingla.com');
set role authenticated;
select tests.check_raises('a contractor cannot accept their own quote',
  $sql$ select public.decide_quote((select id from public.quotes where quote_number = 'Q-1047P-01'), 'accepted') $sql$);
reset role;
select tests.clear_user();

-- Nor can an unrelated agent decide on someone else's property.
select tests.set_user('danielle@redriverrealty.com');
set role authenticated;
select tests.check_raises('another agent cannot decide on a quote that is not theirs',
  $sql$ select public.decide_quote((select id from public.quotes where quote_number = 'Q-1047P-01'), 'accepted') $sql$);
reset role;
select tests.clear_user();

select tests.set_user('marcus@redriverrealty.com');
set role authenticated;
select tests.check_raises('a quote can only be accepted or declined',
  $sql$ select public.decide_quote((select id from public.quotes where quote_number = 'Q-1047P-01'), 'maybe') $sql$);
select public.decide_quote((select id from public.quotes where quote_number = 'Q-1047P-01'), 'accepted');
reset role;
select tests.clear_user();

select tests.check('accepting records the decision on the quote',
  (select status::text from public.quotes where quote_number = 'Q-1047P-01'), 'accepted');

select tests.check('accepting moves the opportunity to quote accepted',
  (select status::text from public.opportunities where code = '1047-P'), 'quote_accepted');

select tests.check('the contractor is told their quote was accepted',
  (select count(*) from public.notifications n
   join public.profiles p on p.id = n.recipient_id
   where p.email = 'jerry@wileyplumbingla.com'
     and n.title like 'Quote accepted — 1047-P%'), 1::bigint);

select tests.check('a decided quote cannot be decided again',
  (select count(*) from public.quotes where quote_number = 'Q-1047P-01' and status = 'accepted'), 1::bigint);

select tests.set_user('marcus@redriverrealty.com');
set role authenticated;
select tests.check_raises('an already-decided quote cannot be reversed',
  $sql$ select public.decide_quote((select id from public.quotes where quote_number = 'Q-1047P-01'), 'declined') $sql$);
reset role;
select tests.clear_user();
