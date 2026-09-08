-- ===========================================================================
-- AskCENLA Repair Network — Row Level Security test suite
--
-- Proves the policies in 0002_rls.sql actually isolate data, by impersonating
-- each demo user and asserting exactly what they can and cannot read.
--
-- Run with:  npm run db:test
-- Any failure exits non-zero and prints the offending row.
--
-- These tests are the reason the security claims in the README are claims
-- about behaviour rather than about intent.
-- ===========================================================================

create schema if not exists tests;

drop table if exists tests.results;
create table tests.results (
  id       serial primary key,
  name     text    not null,
  passed   boolean not null,
  expected text,
  actual   text
);

-- Impersonate a signed-in user exactly the way PostgREST does: publish the
-- JWT claims that auth.uid() reads, then assume the `authenticated` role.
-- The `set role` is issued as a plain statement rather than from inside a
-- function, because PostgreSQL forbids SET ROLE in a SECURITY DEFINER body.
create or replace function tests.set_user(p_email text)
returns void
language plpgsql
security definer
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.profiles where email = p_email;
  if v_id is null then
    raise exception 'No profile for %', p_email;
  end if;
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_id, 'role', 'authenticated', 'email', p_email)::text,
                     false);
end;
$$;

create or replace function tests.clear_user()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', false);
end;
$$;

-- Deliberately NOT security definer: these run as the impersonated role, so
-- every count below is genuinely what that user's session can see.
create or replace function tests.check(p_name text, p_actual anyelement, p_expected anyelement)
returns void
language plpgsql
as $$
begin
  insert into tests.results (name, passed, expected, actual)
  values (p_name, p_actual is not distinct from p_expected, p_expected::text, p_actual::text);
end;
$$;

-- Asserts a statement is rejected. Used for the privilege-escalation tests,
-- where the correct behaviour is an exception rather than a row count.
create or replace function tests.check_raises(p_name text, p_sql text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
    insert into tests.results (name, passed, expected, actual)
    values (p_name, false, 'rejected', 'ALLOWED');
  exception when others then
    insert into tests.results (name, passed, expected, actual)
    values (p_name, true, 'rejected', 'rejected: ' || left(sqlerrm, 60));
  end;
end;
$$;

grant usage on schema tests to authenticated;
grant select, insert on tests.results to authenticated;
grant usage, select on sequence tests.results_id_seq to authenticated;
grant execute on all functions in schema tests to authenticated;

-- ===========================================================================
-- AGENT — Danielle owns requests 1042, 1043 and 1046.
-- ===========================================================================
select tests.set_user('danielle@redriverrealty.com');
set role authenticated;

select tests.check('agent sees only their own requests',
  (select count(*) from public.repair_requests), 3::bigint);

select tests.check('agent cannot see another agent''s property',
  (select count(*) from public.repair_requests where reference = 1044), 0::bigint);

select tests.check('agent sees every opportunity on their own properties',
  (select count(*) from public.opportunities), 8::bigint);

select tests.check('agent sees the inspection reports they uploaded',
  (select count(*) from public.attachments), 4::bigint);

select tests.check('agent cannot see another agent''s inspection report',
  (select count(*) from public.attachments a
   join public.repair_requests r on r.id = a.request_id
   where r.reference in (1044, 1045, 1047)), 0::bigint);

-- The single most important quote rule: a contractor's unsent draft is
-- invisible to the other side of the transaction.
select tests.check('agent sees submitted quotes on their properties',
  (select count(*) from public.quotes), 2::bigint);

select tests.check('agent never sees a contractor draft quote',
  (select count(*) from public.quotes where status = 'draft'), 0::bigint);

select tests.check('agent sees the assigned contractor''s details',
  (select count(*) from public.contractors), 4::bigint);

select tests.check('agent cannot browse the contractor network',
  (select count(*) from public.contractors where business_name = 'Heritage Flooring of Cenla'), 0::bigint);

select tests.check('agent sees only their own notifications',
  (select count(*) from public.notifications), 3::bigint);

reset role;
select tests.clear_user();

-- Privilege escalation: the profile row is legitimately theirs, so RLS allows
-- the UPDATE. The column guard is what stops the role change.
select tests.set_user('danielle@redriverrealty.com');
set role authenticated;
select tests.check_raises('agent cannot promote themselves to admin',
  $sql$ update public.profiles set role = 'admin' where id = auth.uid() $sql$);
reset role;
select tests.clear_user();

-- ===========================================================================
-- BROKER — Renee oversees Red River Realty Group.
-- ===========================================================================
select tests.set_user('renee@redriverrealty.com');
set role authenticated;

select tests.check('broker sees every request in their brokerage',
  (select count(*) from public.repair_requests), 6::bigint);

select tests.check('broker sees every opportunity in their brokerage',
  (select count(*) from public.opportunities), 15::bigint);

select tests.check('broker sees the agents in their brokerage',
  (select count(*) from public.profiles), 4::bigint);

select tests.check('broker never sees a contractor draft quote',
  (select count(*) from public.quotes where status = 'draft'), 0::bigint);

reset role;
select tests.clear_user();

-- ===========================================================================
-- CONTRACTOR — Jerry / Wiley Plumbing.
--   ACCEPTED:      1042-P, 1046-P
--   OFFERED ONLY:  1044-P, 1047-P   <- must stay anonymous
-- ===========================================================================
select tests.set_user('jerry@wileyplumbingla.com');
set role authenticated;

select tests.check('contractor sees offered and accepted opportunities',
  (select count(*) from public.opportunities), 4::bigint);

select tests.check('contractor cannot see another contractor''s opportunity',
  (select count(*) from public.opportunities where code = '1042-E'), 0::bigint);

-- THE CORE PRIVACY GUARANTEE: an offer reveals the trade, the city and the
-- scope, but not the address, the agent, or the inspection report.
select tests.check('contractor sees the property only after accepting',
  (select count(*) from public.repair_requests), 2::bigint);

select tests.check('an offered-but-unaccepted property stays hidden',
  (select count(*) from public.repair_requests where reference in (1044, 1047)), 0::bigint);

select tests.check('contractor cannot read the inspection report before accepting',
  (select count(*) from public.attachments a
   join public.repair_requests r on r.id = a.request_id
   where r.reference in (1044, 1047)), 0::bigint);

select tests.check('contractor can read documents once accepted',
  (select count(*) from public.attachments), 3::bigint);

-- ...but the pre-acceptance feed still gives them enough to decide.
select tests.check('pre-acceptance feed shows the pending offers',
  (select count(*) from public.offered_opportunities), 2::bigint);

select tests.check('pre-acceptance feed exposes the general location',
  (select count(*) from public.offered_opportunities where city is not null and zip is not null), 2::bigint);

select tests.check('pre-acceptance feed has no street address column',
  (select count(*) from information_schema.columns
   where table_name = 'offered_opportunities'
     and column_name in ('address_line1', 'mls_number', 'contact_name', 'contact_phone', 'contact_email')),
  0::bigint);

select tests.check('contractor sees only their own rungs of the routing ladder',
  (select count(*) from public.opportunity_assignments), 4::bigint);

select tests.check('contractor cannot see who else was offered a job',
  (select count(*) from public.opportunity_assignments
   where contractor_id <> 'c0000000-0000-4000-8000-000000000001'), 0::bigint);

select tests.check('contractor cannot browse other contractors',
  (select count(*) from public.contractors), 1::bigint);

select tests.check('contractor sees their own quotes',
  (select count(*) from public.quotes), 2::bigint);

select tests.check('contractor cannot see a rival''s draft quote',
  (select count(*) from public.quotes where quote_number = 'Q-1044H-01'), 0::bigint);

reset role;
select tests.clear_user();

select tests.set_user('jerry@wileyplumbingla.com');
set role authenticated;
select tests.check_raises('contractor cannot change their own membership status',
  $sql$ update public.contractors set membership_status = 'trial' where id = app.my_contractor_id() $sql$);
reset role;
select tests.clear_user();

select tests.set_user('jerry@wileyplumbingla.com');
set role authenticated;
select tests.check_raises('contractor cannot flip their own active flag',
  $sql$ update public.contractors set is_active = false where id = app.my_contractor_id() $sql$);
reset role;
select tests.clear_user();

select tests.set_user('jerry@wileyplumbingla.com');
set role authenticated;
select tests.check_raises('contractor cannot inflate their own routing stats',
  $sql$ update public.contractors set rotation_priority = 0 where id = app.my_contractor_id() $sql$);
reset role;
select tests.clear_user();

-- A contractor updating a field they legitimately own must still work.
select tests.set_user('jerry@wileyplumbingla.com');
set role authenticated;
update public.contractors set accepting_opportunities = false where id = app.my_contractor_id();
select tests.check('contractor can pause their own opportunities',
  (select accepting_opportunities from public.contractors where id = app.my_contractor_id()), false);
update public.contractors set accepting_opportunities = true where id = app.my_contractor_id();
reset role;
select tests.clear_user();

-- ===========================================================================
-- ADMIN — full marketplace visibility.
-- ===========================================================================
select tests.set_user('admin@askcenla.com');
set role authenticated;

select tests.check('admin sees every request',       (select count(*) from public.repair_requests), 6::bigint);
select tests.check('admin sees every opportunity',   (select count(*) from public.opportunities), 15::bigint);
select tests.check('admin sees every contractor',    (select count(*) from public.contractors), 13::bigint);
select tests.check('admin sees the full ladder',     (select count(*) from public.opportunity_assignments), 16::bigint);
select tests.check('admin sees drafts and submitted quotes', (select count(*) from public.quotes), 3::bigint);
select tests.check('admin sees every profile',       (select count(*) from public.profiles), 6::bigint);

reset role;
select tests.clear_user();

-- Admins are the only role that may change a membership status.
select tests.set_user('admin@askcenla.com');
set role authenticated;
update public.contractors set membership_status = 'active'
  where id = 'c0000000-0000-4000-8000-00000000000d';
select tests.check('admin can approve a contractor',
  (select membership_status::text from public.contractors where id = 'c0000000-0000-4000-8000-00000000000d'),
  'active');
update public.contractors set membership_status = 'pending_approval'
  where id = 'c0000000-0000-4000-8000-00000000000d';
reset role;
select tests.clear_user();

-- ===========================================================================
-- STORAGE — file access must track row access exactly.
-- ===========================================================================
insert into storage.objects (bucket_id, name, owner)
select 'attachments', a.storage_path, r.created_by
from public.attachments a
join public.repair_requests r on r.id = a.request_id
on conflict do nothing;

select tests.set_user('jerry@wileyplumbingla.com');
set role authenticated;
select tests.check('contractor can download files for accepted work only',
  (select count(*) from storage.objects), 3::bigint);
reset role;
select tests.clear_user();

select tests.set_user('danielle@redriverrealty.com');
set role authenticated;
select tests.check('agent can download their own files',
  (select count(*) from storage.objects), 4::bigint);
reset role;
select tests.clear_user();

-- ===========================================================================
-- Report
-- ===========================================================================
\pset format aligned
select
  case when passed then 'PASS' else 'FAIL' end as result,
  name,
  case when passed then '' else 'expected ' || expected || ', got ' || actual end as detail
from tests.results
order by id;

select count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       count(*) as total
from tests.results;

-- Non-zero exit if anything failed, so this is usable in CI.
do $$
declare v_failed integer;
begin
  select count(*) into v_failed from tests.results where not passed;
  if v_failed > 0 then
    raise exception '% RLS test(s) failed', v_failed;
  end if;
end $$;
