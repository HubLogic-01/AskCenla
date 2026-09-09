-- ===========================================================================
-- AskCENLA Repair Network — 0011 email delivery
--
-- In-app notifications already exist: the database writes one at every event
-- that matters. What was missing is delivery — an owner with a full-time job
-- and a contractor on a roof are not sitting on the dashboard waiting.
--
-- THE SPLIT. The database owns WHAT to send and all the delivery bookkeeping;
-- an Edge Function owns only HOW to send it (one HTTPS call to an email
-- provider). That matters because everything here is testable against a plain
-- PostgreSQL server, while the part that needs the internet is about thirty
-- lines with no business logic in it. Swapping Resend for Postmark later
-- touches one file and no rules.
--
-- The queue is the notifications table itself rather than a second table:
-- every row already has a recipient, a title, a body and a link, and giving it
-- a delivery state keeps "what the user saw in the app" and "what we emailed
-- them" from ever disagreeing.
-- ===========================================================================

create type public.email_delivery_status as enum (
  'pending',   -- waiting to be sent immediately
  'digest',    -- held for this recipient's daily summary
  'sending',   -- claimed by a worker; not eligible to be claimed again
  'sent',
  'failed',    -- gave up after repeated attempts
  'skipped'    -- recipient has email turned off
);

alter table public.notifications
  add column email_status     public.email_delivery_status not null default 'pending',
  add column email_attempts   integer     not null default 0,
  add column email_last_error text,
  add column email_claimed_at timestamptz,
  add column email_sent_at    timestamptz;

-- The worker's hot path: find the next few things to send.
create index notifications_email_queue_idx
  on public.notifications (email_status, created_at)
  where email_status in ('pending', 'digest', 'sending');

-- ---------------------------------------------------------------------------
-- Per-user preference.
--
-- A column on profiles rather than a preferences table: there is exactly one
-- setting, every profile needs a value, and a join table would be three
-- statements to read one enum.
-- ---------------------------------------------------------------------------
create type public.email_mode as enum (
  'immediate',  -- send as it happens
  'daily',      -- collect into one summary a day
  'off'         -- in-app only
);

alter table public.profiles
  add column email_mode public.email_mode not null default 'immediate';

comment on column public.profiles.email_mode is
  'How this person wants notifications delivered by email. In-app notifications are always created regardless.';

-- ---------------------------------------------------------------------------
-- Route each new notification the moment it is written.
--
-- Doing this on insert rather than in the worker means the queue always
-- reflects the preference as it was when the event happened, and a recipient
-- switching to "off" never silently swallows something already queued.
-- ---------------------------------------------------------------------------
create or replace function app.route_notification_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mode public.email_mode;
begin
  select email_mode into v_mode from public.profiles where id = new.recipient_id;

  new.email_status := case coalesce(v_mode, 'immediate')
    when 'immediate' then 'pending'
    when 'daily'     then 'digest'
    else                  'skipped'
  end::public.email_delivery_status;

  return new;
end;
$$;

create trigger notifications_route_email
  before insert on public.notifications
  for each row execute function app.route_notification_email();

-- How long a claimed row may sit before another worker may take it back. Long
-- enough that a slow provider call is never double-sent, short enough that a
-- crashed worker does not strand a message for a working day.
create or replace function app.email_claim_timeout() returns interval
  language sql immutable as $$ select interval '15 minutes' $$;

-- ---------------------------------------------------------------------------
-- Claim a batch to send.
--
-- `for update skip locked` is what makes this safe to run from more than one
-- worker, or from a worker overlapping the previous run: two callers never
-- claim the same row, so nobody is emailed twice.
--
-- It also RECLAIMS rows left in 'sending' beyond the timeout. A worker that
-- dies between claiming and reporting would otherwise strand those messages
-- permanently — they are not 'pending' any more, so nothing would ever look at
-- them again. The attempt counter still applies, so a row that repeatedly
-- kills its worker eventually gives up rather than cycling forever.
-- ---------------------------------------------------------------------------
create or replace function public.claim_notification_emails(p_limit integer default 50)
returns table (
  notification_id uuid,
  recipient_email text,
  recipient_name  text,
  kind            public.notification_kind,
  title           text,
  body            text,
  link            text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with claimed as (
    update public.notifications n
       set email_status     = 'sending',
           email_attempts   = n.email_attempts + 1,
           email_claimed_at = now()
     where n.id in (
       select q.id
       from public.notifications q
       join public.profiles pr on pr.id = q.recipient_id
       where q.email_attempts < 5
         and (
           q.email_status = 'pending'
           -- Abandoned by a worker that never reported back.
           or (q.email_status = 'sending'
               and pr.email_mode = 'immediate'
               and q.email_claimed_at < now() - app.email_claim_timeout())
         )
       order by q.created_at
       limit greatest(p_limit, 1)
       for update skip locked
     )
    returning n.*
  )
  select c.id, p.email, p.full_name, c.kind, c.title, c.body, c.link
  from claimed c
  join public.profiles p on p.id = c.recipient_id
  order by c.created_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Record the outcome.
--
-- A failure goes back to 'pending' so the next run retries it, until the
-- attempt ceiling in claim_notification_emails() stops it becoming an infinite
-- loop against a permanently bad address.
-- ---------------------------------------------------------------------------
create or replace function public.record_notification_delivery(
  p_notification_id uuid,
  p_delivered       boolean,
  p_error           text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_delivered then
    update public.notifications
       set email_status = 'sent', email_sent_at = now(), email_last_error = null
     where id = p_notification_id;
  else
    update public.notifications
       set email_status = (case when email_attempts >= 5 then 'failed' else 'pending' end)::public.email_delivery_status,
           email_last_error = left(coalesce(p_error, 'Unknown error'), 500)
     where id = p_notification_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Daily digests.
--
-- One row per recipient, with their held notifications rolled into a JSON
-- array the Edge Function renders. Claiming works the same way as above.
-- ---------------------------------------------------------------------------
create or replace function public.claim_notification_digests()
returns table (
  profile_id      uuid,
  recipient_email text,
  recipient_name  text,
  items           jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with claimed as (
    update public.notifications n
       set email_status     = 'sending',
           email_attempts   = n.email_attempts + 1,
           email_claimed_at = now()
     where n.id in (
       select q.id
       from public.notifications q
       join public.profiles pr on pr.id = q.recipient_id
       where q.email_attempts < 5
         and (
           q.email_status = 'digest'
           -- Same reclaim rule as the immediate queue; scoped by the
           -- recipient's mode so a stranded row returns to the queue it
           -- actually belongs to.
           or (q.email_status = 'sending'
               and pr.email_mode = 'daily'
               and q.email_claimed_at < now() - app.email_claim_timeout())
         )
       for update skip locked
     )
    returning n.*
  )
  select
    p.id,
    p.email,
    p.full_name,
    jsonb_agg(
      jsonb_build_object('title', c.title, 'body', c.body, 'link', c.link, 'at', c.created_at)
      order by c.created_at
    )
  from claimed c
  join public.profiles p on p.id = c.recipient_id
  group by p.id, p.email, p.full_name;
end;
$$;

create or replace function public.record_digest_delivery(
  p_profile_id uuid,
  p_delivered  boolean,
  p_error      text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_delivered then
    update public.notifications
       set email_status = 'sent', email_sent_at = now(), email_last_error = null
     where recipient_id = p_profile_id and email_status = 'sending';
  else
    update public.notifications
       set email_status = (case when email_attempts >= 5 then 'failed' else 'digest' end)::public.email_delivery_status,
           email_last_error = left(coalesce(p_error, 'Unknown error'), 500)
     where recipient_id = p_profile_id and email_status = 'sending';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- The owner's daily digest.
--
-- Not a notification: a standing summary of the things only a human can fix.
-- This is the "manage exceptions rather than coordinate every repair" idea
-- delivered to an inbox instead of waiting on a dashboard visit.
-- ---------------------------------------------------------------------------
create or replace function public.owner_digest()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not app.is_admin() and current_user <> 'service_role' then
    raise exception 'Only an administrator can read the owner digest';
  end if;

  select jsonb_build_object(
    'generated_at', now(),

    'unmatched', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', o.code,
        'trade', t.label,
        'territory', coalesce(ter.name, 'Unmapped area'),
        'address', r.address_line1 || ', ' || r.city,
        'waiting_since', o.updated_at
      ) order by o.updated_at)
      from public.opportunities o
      join public.trades t on t.key = o.trade_key
      join public.repair_requests r on r.id = o.request_id
      left join public.territories ter on ter.id = o.territory_id
      where o.status = 'awaiting_contractor'
    ), '[]'::jsonb),

    'pending_applications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'business_name', c.business_name,
        'contact_name', c.contact_name,
        'email', c.email,
        'applied_at', c.created_at
      ) order by c.created_at)
      from public.contractors c
      where c.membership_status = 'pending_approval'
    ), '[]'::jsonb),

    'past_due', coalesce((
      select jsonb_agg(jsonb_build_object(
        'business_name', c.business_name,
        'email', c.email
      ) order by c.business_name)
      from public.contractors c
      where c.membership_status = 'past_due'
    ), '[]'::jsonb),

    -- Offers about to lapse. The sweep will handle them automatically; this is
    -- so the owner can see churn building up before it becomes a pattern.
    'offers_expiring_soon', coalesce((
      select count(*)
      from public.opportunity_assignments a
      join public.opportunities o on o.id = a.opportunity_id
      where a.outcome = 'pending'
        and o.status = 'offered'
        and a.expires_at between now() and now() + interval '6 hours'
    ), 0),

    'credentials_expiring', coalesce((
      select jsonb_agg(jsonb_build_object(
        'business_name', c.business_name,
        'license_expires_on', c.license_expires_on,
        'insurance_expires_on', c.insurance_expires_on
      ) order by c.business_name)
      from public.contractors c
      where c.is_active
        and (
          (c.license_expires_on   is not null and c.license_expires_on   < current_date + 30)
          or (c.insurance_expires_on is not null and c.insurance_expires_on < current_date + 30)
        )
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants.
--
-- The queue functions belong to the worker, which authenticates with the
-- service_role key. No browser session has any business claiming or marking
-- deliveries, so `authenticated` is not granted them.
-- ---------------------------------------------------------------------------
revoke all on function public.claim_notification_emails(integer)          from public, anon, authenticated;
revoke all on function public.record_notification_delivery(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.claim_notification_digests()                from public, anon, authenticated;
revoke all on function public.record_digest_delivery(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_notification_emails(integer)          to service_role;
grant execute on function public.record_notification_delivery(uuid, boolean, text) to service_role;
grant execute on function public.claim_notification_digests()                to service_role;
grant execute on function public.record_digest_delivery(uuid, boolean, text) to service_role;

-- The owner digest is readable by an administrator in the app as well as by
-- the worker that emails it.
revoke all on function public.owner_digest() from public, anon;
grant execute on function public.owner_digest() to authenticated, service_role;
