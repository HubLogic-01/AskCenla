-- ===========================================================================
-- AskCENLA Repair Network — direct-write guard test suite
--
-- Every assertion here is an attack that WORKED against the running database
-- before 0014. They are written as the attacker would perform them: not by
-- calling the RPC that refuses them, but by writing the table directly, the
-- way anyone holding an anon key and the REST endpoint can.
--
-- This is the regression suite for a whole class of mistake — enforcing a rule
-- in a function while leaving the table writable — so each case names the
-- function whose guard was being bypassed.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Quotes. Bypasses decide_quote() and save_quote().
-- ---------------------------------------------------------------------------
select tests.set_user('jerry@wileyplumbingla.com');
set role authenticated;

select tests.check_raises('a contractor cannot accept their own quote by writing the table',
  $sql$ update public.quotes set status = 'accepted'
        where quote_number = 'Q-1042P-01' $sql$);

select tests.check_raises('a contractor cannot rewrite a submitted quote by writing the table',
  $sql$ update public.quotes set notes = 'Price revised upward after acceptance.'
        where quote_number = 'Q-1042P-01' $sql$);

-- The money lives in a separate table, so guarding the quote row alone would
-- have achieved nothing.
select tests.check_raises('a contractor cannot append a line item to a sent quote',
  $sql$ insert into public.quote_items (quote_id, position, description, quantity, unit_price)
        select id, 99, 'Surprise extra charge', 1, 5000
        from public.quotes where quote_number = 'Q-1042P-01' $sql$);

select tests.check_raises('a contractor cannot reprice a line item on a sent quote',
  $sql$ update public.quote_items set unit_price = 9999
        where quote_id = (select id from public.quotes where quote_number = 'Q-1042P-01') $sql$);

select tests.check_raises('a contractor cannot delete a line item from a sent quote',
  $sql$ delete from public.quote_items
        where quote_id = (select id from public.quotes where quote_number = 'Q-1042P-01') $sql$);

reset role;
select tests.clear_user();

select tests.check('the sent quote still says what the contractor sent',
  (select sum(quantity * unit_price) from public.quote_items qi
   join public.quotes q on q.id = qi.quote_id
   where q.quote_number = 'Q-1042P-01'), 550.00::numeric);

select tests.check('the sent quote is still awaiting a decision',
  (select status::text from public.quotes where quote_number = 'Q-1042P-01'), 'submitted');

-- The other side of the same document.
select tests.set_user('danielle@redriverrealty.com');
set role authenticated;

select tests.check_raises('an agent cannot rewrite the contractor''s exclusions',
  $sql$ update public.quotes set exclusions = 'Nothing is excluded, actually.'
        where quote_number = 'Q-1042P-01' $sql$);

select tests.check_raises('an agent cannot change a quote''s expiry',
  $sql$ update public.quotes set expires_on = current_date + 400
        where quote_number = 'Q-1042P-01' $sql$);

-- An agent legitimately decides; that must still work as a plain update,
-- because the guard constrains columns rather than blocking the table.
update public.quotes set status = 'declined' where quote_number = 'Q-1042P-01';
select tests.check('an agent can still decide a quote sent to them',
  (select status::text from public.quotes where quote_number = 'Q-1042P-01'), 'declined');

select tests.check_raises('a decided quote cannot be flipped back',
  $sql$ update public.quotes set status = 'accepted'
        where quote_number = 'Q-1042P-01' $sql$);

reset role;
select tests.clear_user();

-- ---------------------------------------------------------------------------
-- Opportunities. Bypasses accept_opportunity() and routing itself.
-- ---------------------------------------------------------------------------
select tests.set_user('danielle@redriverrealty.com');
set role authenticated;

-- The serious one: assigning a contractor by hand grants them the address,
-- the agent's contact details and the inspection report, with no offer ever
-- made and no rung on the ladder.
select tests.check_raises('an agent cannot hand an opportunity to a contractor',
  $sql$ update public.opportunities
        set contractor_id = 'c0000000-0000-4000-8000-00000000000b'
        where code = '1042-R' $sql$);

select tests.check_raises('an agent cannot move an opportunity to another trade',
  $sql$ update public.opportunities set trade_key = 'septic' where code = '1042-R' $sql$);

select tests.check_raises('an agent cannot extend an offer deadline',
  $sql$ update public.opportunities set offer_expires_at = now() + interval '30 days'
        where code = '1042-R' $sql$);

-- A row the agent cannot see at all is stopped a step earlier: RLS makes the
-- update match nothing, so there is no exception and nothing changes.
update public.opportunities set status = 'cancelled' where code = '1045-R';

-- Manufacturing work aimed at contractors in an unrelated territory.
select tests.check_raises('an agent cannot create an opportunity directly',
  $sql$ insert into public.opportunities (request_id, repair_item_id, trade_key, territory_id, status)
        select r.id, i.id, 'pest_control',
               (select id from public.territories where name = 'Marksville'), 'matching'
        from public.repair_requests r
        join public.repair_items i on i.request_id = r.id
        where r.reference = 1043 limit 1 $sql$);

reset role;
select tests.clear_user();

select tests.check('the opportunity still belongs to nobody',
  (select contractor_id from public.opportunities where code = '1042-R'), null::uuid);

-- A contractor updating progress on work they hold must still work.
select tests.set_user('jerry@wileyplumbingla.com');
set role authenticated;
update public.opportunities set status = 'inspection_scheduled'
 where code = '1042-P' and contractor_id = app.my_contractor_id();
select tests.check('a contractor can still report progress on their own job',
  (select status::text from public.opportunities where code = '1042-P'), 'inspection_scheduled');

-- 1043-L is offered to a different contractor, so it is not visible to this
-- one at all: the update matches no rows rather than raising.
update public.opportunities set contractor_id = app.my_contractor_id() where code = '1043-L';
reset role;
select tests.clear_user();

select tests.check('a contractor cannot take an opportunity offered to someone else',
  (select contractor_id from public.opportunities where code = '1043-L'), null::uuid);

select tests.check('an invisible opportunity is untouched by a blind write',
  (select status <> 'cancelled' from public.opportunities where code = '1045-R'), true);

-- ---------------------------------------------------------------------------
-- Repair requests and items
-- ---------------------------------------------------------------------------
select tests.set_user('danielle@redriverrealty.com');
set role authenticated;

select tests.check_raises('an agent cannot move a request into another brokerage',
  $sql$ update public.repair_requests set brokerage_id = 'b0000000-0000-4000-8000-000000000002'
        where reference = 1042 $sql$);

select tests.check_raises('an agent cannot reassign a request to another agent',
  $sql$ update public.repair_requests
        set created_by = (select id from public.profiles where email = 'marcus@redriverrealty.com')
        where reference = 1042 $sql$);

select tests.check_raises('an agent cannot change a request''s reference number',
  $sql$ update public.repair_requests set reference = 9999 where reference = 1042 $sql$);

select tests.check_raises('an agent cannot switch a repair item to another trade',
  $sql$ update public.repair_items set trade_key = 'septic'
        where request_id = (select id from public.repair_requests where reference = 1042)
          and trade_key = 'roofing' $sql$);

-- Correcting the scope text is normal and must still be allowed.
update public.repair_items set description = description || ' (updated after a second look)'
 where request_id = (select id from public.repair_requests where reference = 1042)
   and trade_key = 'roofing';
select tests.check('an agent can still correct a scope description',
  (select description like '%second look%' from public.repair_items
   where request_id = (select id from public.repair_requests where reference = 1042)
     and trade_key = 'roofing'), true);

reset role;
select tests.clear_user();

select tests.check('the request is still with its own brokerage',
  (select brokerage_id::text from public.repair_requests where reference = 1042),
  'b0000000-0000-4000-8000-000000000001');

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
select tests.set_user('danielle@redriverrealty.com');
set role authenticated;

select tests.check_raises('a recipient cannot rewrite a notification',
  $sql$ update public.notifications set title = 'Something else entirely'
        where recipient_id = auth.uid() $sql$);

select tests.check_raises('a recipient cannot mark their own email as already sent',
  $sql$ update public.notifications set email_status = 'sent'
        where recipient_id = auth.uid() $sql$);

update public.notifications set read_at = now() where recipient_id = auth.uid();
select tests.check('a recipient can still mark notifications read',
  (select count(*) from public.notifications
   where recipient_id = auth.uid() and read_at is null), 0::bigint);

reset role;
select tests.clear_user();
