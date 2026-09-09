-- ===========================================================================
-- AskCENLA Repair Network — 0014 write guards
--
-- WHY THIS EXISTS
--
-- Phases 3-10 moved every multi-table operation into a SECURITY DEFINER
-- function, and those functions check their own rules carefully: a contractor
-- cannot accept their own quote, a submitted quote cannot be edited, routing
-- decides who gets a job.
--
-- But the RPC layer is not the security boundary. PostgREST exposes every
-- table a role can write, so a session holding an anon key can PATCH a row
-- directly and never touch those functions. An audit of the running database
-- confirmed all of the following were possible:
--
--   * a contractor accepting their own quote
--   * a contractor rewriting a SUBMITTED quote's notes, and adding a $5,000
--     line item to it after the agent had accepted
--   * an agent rewriting the contractor's exclusions on a quote they were sent
--   * an agent assigning any contractor to an opportunity, which grants that
--     contractor the address, agent contact and inspection report without the
--     job ever being offered to them
--   * an agent moving their request into another brokerage, exposing it to
--     that brokerage's broker
--   * an agent manufacturing opportunities aimed at contractors in unrelated
--     territories
--
-- RLS decides which ROWS you may touch; it cannot express which COLUMNS or
-- which state transitions. The pattern for that already existed here — the
-- guard triggers on `profiles` and `contractors` from 0002 — it had simply not
-- been applied to the tables that grew write policies later.
--
-- Every guard below keys off app.is_browser_session(), so the platform's own
-- SECURITY DEFINER functions continue to work unchanged.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Quotes: a sent quote is a document, not a draft
--
-- Both sides rely on the figures in a submitted quote. Once it leaves the
-- contractor, its content is frozen and only the decision on it may change.
-- ---------------------------------------------------------------------------
create or replace function app.guard_quote_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not app.is_browser_session() then
    return new;
  end if;

  -- Content is immutable once the quote has been sent. This is the rule
  -- save_quote() enforces; without it here, either party could simply PATCH
  -- the row instead of calling it.
  if old.status <> 'draft' and (
       new.quote_number   is distinct from old.quote_number
    or new.opportunity_id is distinct from old.opportunity_id
    or new.contractor_id  is distinct from old.contractor_id
    or new.notes          is distinct from old.notes
    or new.exclusions     is distinct from old.exclusions
    or new.tax_rate       is distinct from old.tax_rate
    or new.expires_on     is distinct from old.expires_on
    or new.submitted_at   is distinct from old.submitted_at
  ) then
    raise exception 'A submitted quote cannot be changed. Build a new one instead.';
  end if;

  -- The rule decide_quote() enforces: nobody approves their own pricing.
  if new.status is distinct from old.status
     and new.status in ('accepted', 'declined')
     and app.my_contractor_id() is not null
     and app.my_contractor_id() = old.contractor_id
  then
    raise exception 'A contractor cannot accept or decline their own quote';
  end if;

  -- A decision is final. Reversing it is a new quote, not an edit.
  if old.status in ('accepted', 'declined') and new.status is distinct from old.status then
    raise exception 'That quote has already been decided';
  end if;

  return new;
end;
$$;

create trigger quotes_guard_columns before update on public.quotes
  for each row execute function app.guard_quote_columns();

-- ---------------------------------------------------------------------------
-- Quote line items: the pricing IS the document
--
-- Guarding the quote row alone would have been useless — the money lives in a
-- separate table, and the audit showed a $5,000 line could be appended to an
-- already-accepted quote.
-- ---------------------------------------------------------------------------
-- NOT security definer, for the same reason as the guards in 0002: inside a
-- definer function current_user is the owner, so app.is_browser_session()
-- could never return true and this would silently allow everything.
create or replace function app.guard_quote_items()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_quote_id uuid := coalesce(new.quote_id, old.quote_id);
  v_status   public.quote_status;
begin
  if not app.is_browser_session() then
    return coalesce(new, old);
  end if;

  select status into v_status from public.quotes where id = v_quote_id;

  if v_status is distinct from 'draft' then
    raise exception 'The line items on a submitted quote cannot be changed';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger quote_items_guard
  before insert or update or delete on public.quote_items
  for each row execute function app.guard_quote_items();

-- ---------------------------------------------------------------------------
-- Opportunities: routing owns everything except progress
--
-- A contractor updates the status of work they hold, and an agent may cancel.
-- Nothing else about an opportunity is a browser's business: who it belongs to
-- is decided by accept_opportunity(), and assigning it by hand would hand a
-- contractor the inspection report without an offer ever being made.
-- ---------------------------------------------------------------------------
create or replace function app.guard_opportunity_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not app.is_browser_session() then
    return new;
  end if;

  if new.code             is distinct from old.code
  or new.request_id       is distinct from old.request_id
  or new.repair_item_id   is distinct from old.repair_item_id
  or new.trade_key        is distinct from old.trade_key
  or new.territory_id     is distinct from old.territory_id
  or new.contractor_id    is distinct from old.contractor_id
  or new.routing_position is distinct from old.routing_position
  or new.offered_at       is distinct from old.offered_at
  or new.offer_expires_at is distinct from old.offer_expires_at
  or new.accepted_at      is distinct from old.accepted_at
  then
    raise exception 'Only the status of an opportunity can be changed directly';
  end if;

  return new;
end;
$$;

create trigger opportunities_guard_columns before update on public.opportunities
  for each row execute function app.guard_opportunity_columns();

-- Opportunities are created by submit_repair_request(), which is SECURITY
-- DEFINER and bypasses RLS. Nothing legitimate inserts one from a browser, and
-- leaving the policy in place let an agent manufacture work aimed at
-- contractors in any territory they chose.
drop policy if exists opportunities_insert on public.opportunities;

-- ---------------------------------------------------------------------------
-- Repair requests: ownership and identity are fixed at submission
-- ---------------------------------------------------------------------------
create or replace function app.guard_request_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not app.is_browser_session() then
    return new;
  end if;

  if new.created_by is distinct from old.created_by then
    raise exception 'A repair request cannot be reassigned to another agent';
  end if;

  if new.reference is distinct from old.reference then
    raise exception 'A repair request reference cannot be changed';
  end if;

  -- Moving a request between brokerages would expose it to a broker who was
  -- never party to it.
  if new.brokerage_id is distinct from old.brokerage_id then
    raise exception 'Only an administrator can move a request between brokerages';
  end if;

  return new;
end;
$$;

create trigger repair_requests_guard_columns before update on public.repair_requests
  for each row execute function app.guard_request_columns();

-- ---------------------------------------------------------------------------
-- Repair items: the trade is what generated the opportunity
--
-- The scope text stays editable — an agent correcting a description is normal.
-- Changing the trade after routing has happened would leave the opportunity
-- describing different work from the item it came from.
-- ---------------------------------------------------------------------------
create or replace function app.guard_repair_item_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not app.is_browser_session() then
    return new;
  end if;

  if new.trade_key  is distinct from old.trade_key
  or new.request_id is distinct from old.request_id then
    raise exception 'The trade on a submitted repair item cannot be changed';
  end if;

  return new;
end;
$$;

create trigger repair_items_guard_columns before update on public.repair_items
  for each row execute function app.guard_repair_item_columns();

-- ---------------------------------------------------------------------------
-- Notifications: a recipient marks one read, nothing more
-- ---------------------------------------------------------------------------
create or replace function app.guard_notification_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not app.is_browser_session() then
    return new;
  end if;

  if new.recipient_id is distinct from old.recipient_id
  or new.kind         is distinct from old.kind
  or new.title        is distinct from old.title
  or new.body         is distinct from old.body
  or new.link         is distinct from old.link
  or new.email_status is distinct from old.email_status
  then
    raise exception 'Only the read state of a notification can be changed';
  end if;

  return new;
end;
$$;

create trigger notifications_guard_columns before update on public.notifications
  for each row execute function app.guard_notification_columns();
