-- ===========================================================================
-- AskCENLA Repair Network — 0013 Stripe membership
--
-- The groundwork has been in place since Phase 2: contractors.membership_status
-- decides who the matching engine will route to, and it has refused a
-- past-due account from the beginning. This file connects that column to
-- Stripe.
--
-- WHAT LIVES HERE vs IN THE EDGE FUNCTIONS
--   Here: translating a Stripe subscription state into a membership decision,
--         and doing it exactly once per event even when Stripe sends the same
--         one three times.
--   There: talking to Stripe, and verifying that a webhook really came from
--         Stripe.
--
-- The reason for the split is the same as for email in 0011: webhook
-- correctness is not "did the HTTP call work", it is idempotency, ordering and
-- what a failed payment should mean. All three are testable in SQL.
-- ===========================================================================

alter table public.subscriptions
  add column stripe_price_id      text,
  add column current_period_start timestamptz,
  -- Stripe does not guarantee webhook ORDER, only delivery. This is how a
  -- late-arriving older event is ignored instead of resurrecting a stale state.
  add column last_event_at        timestamptz,
  add column canceled_at          timestamptz;

-- ---------------------------------------------------------------------------
-- Every webhook Stripe delivers, recorded before it is acted on.
--
-- Stripe retries on any non-2xx response and can deliver the same event more
-- than once even on success. The primary key is the event id, so a repeat is a
-- conflict rather than a second application.
-- ---------------------------------------------------------------------------
create table public.billing_events (
  stripe_event_id text primary key,
  type            text        not null,
  contractor_id   uuid references public.contractors (id) on delete set null,
  payload         jsonb       not null,
  applied         boolean     not null default false,
  error           text,
  received_at     timestamptz not null default now()
);
create index billing_events_received_idx on public.billing_events (received_at desc);

alter table public.billing_events enable row level security;

-- 0002 granted table privileges to `authenticated` for the tables that existed
-- THEN; a table created later needs its own grant or the RLS policy below is
-- unreachable and every role gets a permission error instead of zero rows.
grant select on public.billing_events to authenticated;

-- No policy for `authenticated`: raw billing payloads are for the platform and
-- the webhook, not for browsers. RLS with no policy denies everyone; the
-- webhook uses service_role, which bypasses it.
create policy billing_events_admin_read on public.billing_events
  for select to authenticated using (app.is_admin());

-- ---------------------------------------------------------------------------
-- The business rule: what a Stripe subscription state means for membership.
--
-- Deliberately a function rather than inline logic, because this is the one
-- place that decides whether a contractor keeps receiving work, and it should
-- be readable in isolation and testable value by value.
-- ---------------------------------------------------------------------------
create or replace function app.membership_for_stripe_status(p_status text)
returns public.membership_status
language sql
immutable
as $$
  select case p_status
    when 'active'             then 'active'
    when 'trialing'           then 'trial'
    -- Payment failed but Stripe is still retrying. Routing pauses; the account
    -- is not cancelled, because most of these recover.
    when 'past_due'           then 'past_due'
    when 'unpaid'             then 'past_due'
    when 'canceled'           then 'cancelled'
    when 'incomplete_expired' then 'cancelled'
    when 'paused'             then 'past_due'
    -- 'incomplete' is checkout in flight: nothing has been paid, so the
    -- contractor stays wherever they were rather than being granted access.
    else null
  end::public.membership_status;
$$;

-- ---------------------------------------------------------------------------
-- Apply one webhook.
--
-- Called by the Stripe webhook function with the service-role key, after that
-- function has verified the signature. Everything below assumes the payload is
-- genuine and concerns itself only with applying it correctly.
-- ---------------------------------------------------------------------------
create or replace function public.apply_subscription_event(
  p_event_id      text,
  p_type          text,
  p_created       timestamptz,
  p_contractor_id uuid,
  p_subscription  jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status      text := p_subscription ->> 'status';
  v_membership  public.membership_status;
  v_existing    public.subscriptions;
  v_previous    public.membership_status;
  v_profile     uuid;
  v_admin       record;
  v_business    text;
begin
  -- Idempotency. A repeat delivery conflicts here and returns without doing
  -- anything a second time.
  insert into public.billing_events (stripe_event_id, type, contractor_id, payload)
  values (p_event_id, p_type, p_contractor_id, p_subscription)
  on conflict (stripe_event_id) do nothing;

  if not found then
    return jsonb_build_object('applied', false, 'reason', 'duplicate');
  end if;

  if p_contractor_id is null then
    update public.billing_events
       set error = 'No contractor id on the event'
     where stripe_event_id = p_event_id;
    return jsonb_build_object('applied', false, 'reason', 'no_contractor');
  end if;

  select * into v_existing from public.subscriptions
   where contractor_id = p_contractor_id for update;

  -- Out-of-order delivery: Stripe guarantees delivery, not sequence. An event
  -- older than the one already applied would otherwise revive a stale status.
  if v_existing.last_event_at is not null and p_created < v_existing.last_event_at then
    update public.billing_events
       set error = 'Superseded by a newer event'
     where stripe_event_id = p_event_id;
    return jsonb_build_object('applied', false, 'reason', 'stale');
  end if;

  insert into public.subscriptions (
    contractor_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
    status, current_period_start, current_period_end, cancel_at_period_end,
    canceled_at, last_event_at
  ) values (
    p_contractor_id,
    p_subscription ->> 'customer',
    p_subscription ->> 'id',
    p_subscription ->> 'price_id',
    coalesce(v_status, 'incomplete'),
    nullif(p_subscription ->> 'current_period_start', '')::timestamptz,
    nullif(p_subscription ->> 'current_period_end', '')::timestamptz,
    coalesce((p_subscription ->> 'cancel_at_period_end')::boolean, false),
    nullif(p_subscription ->> 'canceled_at', '')::timestamptz,
    p_created
  )
  on conflict (contractor_id) do update set
    stripe_customer_id     = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    stripe_price_id        = excluded.stripe_price_id,
    status                 = excluded.status,
    current_period_start   = excluded.current_period_start,
    current_period_end     = excluded.current_period_end,
    cancel_at_period_end   = excluded.cancel_at_period_end,
    canceled_at            = excluded.canceled_at,
    last_event_at          = excluded.last_event_at;

  v_membership := app.membership_for_stripe_status(v_status);

  -- An unmapped status (notably 'incomplete') leaves membership alone: nothing
  -- has been paid, so nothing should be granted, and nothing should be taken
  -- away from a contractor who is mid-checkout on a renewal.
  if v_membership is null then
    update public.billing_events set applied = true where stripe_event_id = p_event_id;
    return jsonb_build_object('applied', true, 'membership_status', null);
  end if;

  select membership_status, business_name into v_previous, v_business
  from public.contractors where id = p_contractor_id;

  update public.contractors
     set membership_status = v_membership
   where id = p_contractor_id;

  -- Billing must never overrule an administrator's approval decision: paying
  -- does not activate an account that has not been reviewed.
  update public.contractors
     set is_active = true
   where id = p_contractor_id
     and v_membership in ('active', 'trial')
     and membership_status <> 'pending_approval'
     and is_active = false
     and exists (
       select 1 from public.billing_events be
       where be.contractor_id = p_contractor_id and be.applied
     );

  select id into v_profile from public.profiles where contractor_id = p_contractor_id;

  -- Tell people when something changed, not on every renewal ping.
  if v_previous is distinct from v_membership then
    if v_membership = 'past_due' and v_profile is not null then
      insert into public.notifications (recipient_id, kind, title, body, link)
      values (
        v_profile,
        'system',
        'Payment problem — new opportunities paused',
        'We could not take your membership payment. New opportunities are paused '
          || 'until it goes through. Work you have already accepted is unaffected.',
        '/contractor/membership'
      );
    elsif v_membership = 'active' and v_previous = 'past_due' and v_profile is not null then
      insert into public.notifications (recipient_id, kind, title, body, link)
      values (
        v_profile,
        'system',
        'Payment received — you are back in the rotation',
        'Thanks. Your membership is active again and opportunities will resume.',
        '/contractor/membership'
      );
    end if;

    -- A lapsed membership shrinks the network, which is the owner's problem.
    if v_membership in ('past_due', 'cancelled') then
      for v_admin in select id from public.profiles where role = 'admin'
      loop
        insert into public.notifications (recipient_id, kind, title, body, link)
        values (
          v_admin.id,
          'system',
          v_business || ' membership is ' || v_membership,
          'They have stopped receiving opportunities. Coverage in their trades '
            || 'and territories may now be thin.',
          '/admin/contractors'
        );
      end loop;
    end if;
  end if;

  update public.billing_events set applied = true where stripe_event_id = p_event_id;

  return jsonb_build_object(
    'applied', true,
    'membership_status', v_membership,
    'previous_status', v_previous
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- What the contractor's own billing screen reads.
--
-- The RLS policy on subscriptions already limits a contractor to their own row;
-- this exists so the screen gets the membership fee and a renewal date without
-- knowing the table's shape.
-- ---------------------------------------------------------------------------
create or replace function public.my_membership()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_contractor uuid := app.my_contractor_id();
  v_sub        public.subscriptions;
  v_c          public.contractors;
begin
  if v_contractor is null then
    raise exception 'Only a contractor account has a membership';
  end if;

  select * into v_c   from public.contractors  where id = v_contractor;
  select * into v_sub from public.subscriptions where contractor_id = v_contractor;

  return jsonb_build_object(
    'membership_status',    v_c.membership_status,
    'is_active',            v_c.is_active,
    'monthly_fee',          app.membership_fee(),
    'has_subscription',     v_sub.id is not null,
    'stripe_status',        v_sub.status,
    'current_period_end',   v_sub.current_period_end,
    'cancel_at_period_end', coalesce(v_sub.cancel_at_period_end, false)
  );
end;
$$;

revoke all on function public.apply_subscription_event(text, text, timestamptz, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_subscription_event(text, text, timestamptz, uuid, jsonb)
  to service_role;

revoke all on function public.my_membership() from public, anon;
grant execute on function public.my_membership() to authenticated;
