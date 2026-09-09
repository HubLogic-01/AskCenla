-- ===========================================================================
-- AskCENLA Repair Network — 0009 quotes
--
-- The RLS policies for quotes and their line items already exist (0002) and
-- are tested: a contractor may only write a quote against an opportunity they
-- accepted, and a draft is invisible to the other side of the transaction
-- until it is submitted. So this file is not new security work — it exists
-- because each of these operations spans more than one table and must not be
-- half-done:
--
--   creating a draft   -> a quote, a starter line item, and the opportunity's
--                         status all move together
--   saving             -> line items are REPLACED, so a failure between the
--                         delete and the insert would empty a contractor's
--                         pricing
--   submitting         -> the quote, the opportunity and the agent's
--                         notification are one event
--   deciding           -> likewise, in the other direction
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Shared ownership check. Returns the quote, or raises with a message the UI
-- can put in front of the user.
-- ---------------------------------------------------------------------------
create or replace function app.own_quote(p_quote_id uuid, p_require_draft boolean default true)
returns public.quotes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quote public.quotes;
begin
  if app.my_contractor_id() is null then
    raise exception 'Only a contractor account can work on a quote';
  end if;

  select * into v_quote from public.quotes where id = p_quote_id for update;

  if not found then
    raise exception 'That quote no longer exists';
  end if;

  if v_quote.contractor_id <> app.my_contractor_id() then
    raise exception 'That quote belongs to another contractor';
  end if;

  -- A submitted quote is a document the agent has already seen. Editing it
  -- underneath them would make the figures they are looking at untrue.
  if p_require_draft and v_quote.status <> 'draft' then
    raise exception 'A submitted quote cannot be changed. Build a new one instead.';
  end if;

  return v_quote;
end;
$$;

-- ---------------------------------------------------------------------------
-- Create a draft
--
-- The quote number is generated here rather than in the browser so it is
-- unique, sequential per opportunity, and consistent no matter what created it.
-- ---------------------------------------------------------------------------
create or replace function public.create_draft_quote(p_opportunity_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_contractor uuid := app.my_contractor_id();
  v_opp        public.opportunities;
  v_reference  bigint;
  v_trade_code text;
  v_sequence   integer;
  v_number     text;
  v_quote_id   uuid;
begin
  if v_contractor is null then
    raise exception 'Only a contractor account can build a quote';
  end if;

  select * into v_opp from public.opportunities where id = p_opportunity_id for update;
  if not found then
    raise exception 'That opportunity no longer exists';
  end if;

  -- Quoting is for work you hold. This mirrors the quotes_insert policy, but
  -- has to be stated again because this function runs as its definer.
  if v_opp.contractor_id is distinct from v_contractor then
    raise exception 'You can only quote an opportunity you have accepted';
  end if;

  select reference into v_reference from public.repair_requests where id = v_opp.request_id;
  select code      into v_trade_code from public.trades         where key = v_opp.trade_key;

  -- Sequential per opportunity, skipping any number already taken so a
  -- withdrawn or deleted draft cannot collide with a new one.
  select coalesce(count(*), 0) + 1 into v_sequence
  from public.quotes where opportunity_id = p_opportunity_id;

  loop
    v_number := 'Q-' || v_reference || v_trade_code || '-' || lpad(v_sequence::text, 2, '0');
    exit when not exists (select 1 from public.quotes where quote_number = v_number);
    v_sequence := v_sequence + 1;
    if v_sequence > 99 then
      raise exception 'Too many quotes on this opportunity';
    end if;
  end loop;

  insert into public.quotes (quote_number, opportunity_id, contractor_id, status)
  values (v_number, p_opportunity_id, v_contractor, 'draft')
  returning id into v_quote_id;

  -- One empty row so the builder opens with something to type into.
  insert into public.quote_items (quote_id, position, description, quantity, unit_price)
  values (v_quote_id, 0, '', 1, 0);

  update public.opportunities
     set status = 'quote_in_progress'
   where id = p_opportunity_id
     and status in ('accepted', 'inspection_scheduled');

  return jsonb_build_object('quote_id', v_quote_id, 'quote_number', v_number);
end;
$$;

-- ---------------------------------------------------------------------------
-- Save a draft
--
-- Line items are replaced wholesale: the builder lets a contractor reorder,
-- edit and delete rows, and diffing that client-side would be more code and
-- more ways to be wrong. Delete-then-insert is safe here precisely because it
-- is inside one transaction.
-- ---------------------------------------------------------------------------
create or replace function public.save_quote(
  p_quote_id uuid,
  p_quote    jsonb,
  p_items    jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item     jsonb;
  v_position integer := 0;
begin
  perform app.own_quote(p_quote_id);

  update public.quotes
     set notes      = nullif(p_quote ->> 'notes', ''),
         exclusions = nullif(p_quote ->> 'exclusions', ''),
         tax_rate   = coalesce((p_quote ->> 'tax_rate')::numeric, 0),
         expires_on = nullif(p_quote ->> 'expires_on', '')::date
   where id = p_quote_id;

  delete from public.quote_items where quote_id = p_quote_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    insert into public.quote_items (quote_id, position, description, quantity, unit_price)
    values (
      p_quote_id,
      v_position,
      coalesce(v_item ->> 'description', ''),
      greatest(coalesce((v_item ->> 'quantity')::numeric, 0), 0),
      greatest(coalesce((v_item ->> 'unit_price')::numeric, 0), 0)
    );
    v_position := v_position + 1;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Submit — the moment the quote becomes visible to the agent
-- ---------------------------------------------------------------------------
create or replace function public.submit_quote(p_quote_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quote      public.quotes;
  v_opp        public.opportunities;
  v_request    public.repair_requests;
  v_contractor public.contractors;
  v_items      integer;
begin
  v_quote := app.own_quote(p_quote_id);

  select count(*) into v_items from public.quote_items where quote_id = p_quote_id;
  if v_items = 0 then
    raise exception 'Add at least one line item before submitting this quote';
  end if;

  update public.quotes
     set status = 'submitted', submitted_at = now()
   where id = p_quote_id;

  select * into v_opp     from public.opportunities   where id = v_quote.opportunity_id;
  select * into v_request from public.repair_requests where id = v_opp.request_id;
  select * into v_contractor from public.contractors  where id = v_quote.contractor_id;

  update public.opportunities
     set status = 'quote_submitted'
   where id = v_quote.opportunity_id;

  insert into public.notifications (recipient_id, kind, title, body, link)
  values (
    v_request.created_by,
    'quote_submitted',
    'Quote received — ' || v_opp.code || ' ' ||
      (select label from public.trades where key = v_opp.trade_key),
    v_contractor.business_name || ' submitted a quote for ' || v_request.address_line1 || '.',
    '/agent/quotes/' || p_quote_id
  );

  return jsonb_build_object('quote_id', p_quote_id, 'status', 'submitted');
end;
$$;

-- ---------------------------------------------------------------------------
-- Decide — the agent's accept or decline
-- ---------------------------------------------------------------------------
create or replace function public.decide_quote(p_quote_id uuid, p_decision text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quote     public.quotes;
  v_opp       public.opportunities;
  v_request   public.repair_requests;
  v_recipient uuid;
begin
  if p_decision not in ('accepted', 'declined') then
    raise exception 'A quote can only be accepted or declined';
  end if;

  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found then
    raise exception 'That quote no longer exists';
  end if;

  -- The obvious abuse: a contractor approving their own pricing.
  if app.my_contractor_id() is not null and app.my_contractor_id() = v_quote.contractor_id then
    raise exception 'A contractor cannot accept or decline their own quote';
  end if;

  if v_quote.status <> 'submitted' then
    raise exception 'Only a submitted quote can be accepted or declined';
  end if;

  select * into v_opp     from public.opportunities   where id = v_quote.opportunity_id;
  select * into v_request from public.repair_requests where id = v_opp.request_id;

  if not (app.is_admin() or v_request.created_by = auth.uid()) then
    raise exception 'Only the agent who submitted this request can decide on its quotes';
  end if;

  update public.quotes
     set status = p_decision::public.quote_status, decided_at = now()
   where id = p_quote_id;

  update public.opportunities
     set status = (case when p_decision = 'accepted' then 'quote_accepted'
                        else 'quote_declined' end)::public.opportunity_status
   where id = v_quote.opportunity_id;

  select id into v_recipient from public.profiles where contractor_id = v_quote.contractor_id;
  if v_recipient is not null then
    insert into public.notifications (recipient_id, kind, title, body, link)
    values (
      v_recipient,
      (case when p_decision = 'accepted' then 'quote_accepted' else 'quote_declined' end)::public.notification_kind,
      'Quote ' || p_decision || ' — ' || v_opp.code,
      'The agent ' || p_decision || ' your quote ' || v_quote.quote_number || '.',
      '/contractor/opportunities/' || v_opp.id
    );
  end if;

  return jsonb_build_object('quote_id', p_quote_id, 'status', p_decision);
end;
$$;

revoke all on function public.create_draft_quote(uuid)      from public, anon;
revoke all on function public.save_quote(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.submit_quote(uuid)             from public, anon;
revoke all on function public.decide_quote(uuid, text)       from public, anon;
grant execute on function public.create_draft_quote(uuid)      to authenticated;
grant execute on function public.save_quote(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.submit_quote(uuid)             to authenticated;
grant execute on function public.decide_quote(uuid, text)       to authenticated;
