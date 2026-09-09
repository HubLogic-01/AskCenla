-- ===========================================================================
-- AskCENLA Repair Network — 0012 email schedule
--
-- Schedules the worker in supabase/functions/send-notifications.
--
-- The schedule needs two project-specific values (where the function lives and
-- the secret it authenticates on), so they are read from a small settings
-- table rather than pasted into this file. That keeps the migration generic
-- and keeps the values out of version control.
--
-- IMPORTANT: only the CRON SECRET is stored here, never the service-role key.
-- The function is deployed with --no-verify-jwt and authenticates on that
-- secret; its own service-role key lives in the function's environment
-- (`supabase secrets set`) and never touches the database. A settings table
-- holding a service-role key would be a far worse thing to leak than a table
-- holding a value that only triggers an already-idempotent job.
-- ===========================================================================

create table if not exists app.settings (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);

comment on table app.settings is
  'Deployment configuration for scheduled jobs. No table grants: readable only by superuser and service_role. Never store a service-role key here.';

-- Deliberately no grants to `authenticated` or `anon`. Schema `app` has USAGE
-- granted for its functions; without a table grant these rows are unreachable
-- from any browser session.
revoke all on app.settings from public, anon, authenticated;

-- Placeholders so the rows exist and the setup step is an UPDATE with an
-- obvious before/after rather than a guess at the schema.
insert into app.settings (key, value) values
  ('edge_function_url', 'https://YOUR-PROJECT-REF.functions.supabase.co'),
  ('cron_secret',       'CHANGE-ME')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Invoke the worker.
--
-- Wrapped in a function so the cron entries stay readable and there is one
-- place to change how the call is made.
-- ---------------------------------------------------------------------------
create or replace function app.invoke_email_worker(p_mode text)
returns void
language plpgsql
security definer
set search_path = app, public, pg_temp
as $$
declare
  v_url    text;
  v_secret text;
begin
  select value into v_url    from app.settings where key = 'edge_function_url';
  select value into v_secret from app.settings where key = 'cron_secret';

  if v_url is null or v_url like '%YOUR-PROJECT-REF%' or v_secret = 'CHANGE-ME' then
    raise notice 'Email worker is not configured; skipping. See README, "Turn on email".';
    return;
  end if;

  -- pg_net sends this asynchronously: the scheduler is not held open for the
  -- length of an HTTP round trip.
  perform net.http_post(
    url     := v_url || '/send-notifications',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-secret', v_secret
               ),
    body    := jsonb_build_object('mode', p_mode)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Schedules. Guarded the same way as the offer sweep in 0007, so this
-- migration is safe to run on a project that has not enabled the extensions
-- yet, and safe to re-run once it has.
-- ---------------------------------------------------------------------------
do $$
declare
  v_has_cron boolean := exists (select 1 from pg_namespace where nspname = 'cron');
  v_has_net  boolean := exists (select 1 from pg_namespace where nspname = 'net');
begin
  if not v_has_cron or not v_has_net then
    raise notice
      'Email is NOT scheduled: pg_cron is %, pg_net is %. Enable both under '
      'Database -> Extensions and re-run this migration.',
      case when v_has_cron then 'present' else 'missing' end,
      case when v_has_net  then 'present' else 'missing' end;
    return;
  end if;

  perform cron.unschedule(j.jobname)
  from cron.job j
  where j.jobname in ('askcenla-email-immediate', 'askcenla-email-digest', 'askcenla-email-owner');

  -- Time-sensitive: a contractor has 24 hours to answer an offer, so waiting
  -- an hour to tell them is a meaningful slice of their window.
  perform cron.schedule('askcenla-email-immediate', '*/5 * * * *',
    $cron$select app.invoke_email_worker('immediate')$cron$);

  -- 07:00 UTC is 01:00 or 02:00 in Central Louisiana, so the digest is waiting
  -- when the recipient starts their day rather than arriving during it.
  perform cron.schedule('askcenla-email-digest', '0 7 * * *',
    $cron$select app.invoke_email_worker('digest')$cron$);

  perform cron.schedule('askcenla-email-owner', '30 12 * * *',
    $cron$select app.invoke_email_worker('owner')$cron$);

  raise notice 'Email schedules created. Set edge_function_url and cron_secret in app.settings to switch them on.';
end $$;
