-- ===========================================================================
-- AskCENLA Repair Network — 0004 auth bridge
--
-- Supabase Auth owns auth.users. The application needs a matching row in
-- public.profiles with a ROLE before it can do anything, so this trigger
-- creates one the moment a user signs up. Doing it in the database rather than
-- in the client means a profile can never be missing because a network call
-- failed halfway through sign-up.
-- ===========================================================================

create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_requested   text;
  v_role        public.user_role;
  v_full_name   text;
  v_contractor  uuid;
begin
  v_requested := coalesce(new.raw_user_meta_data ->> 'role', 'agent');
  v_full_name := coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), new.email);

  -- SECURITY: sign-up metadata is attacker-controlled — it is whatever the
  -- browser put in the signUp() call. Only the three self-service roles are
  -- honoured here. 'admin' is never grantable this way; an administrator is
  -- promoted by another administrator (or directly in the SQL editor).
  if v_requested in ('agent', 'broker', 'contractor') then
    v_role := v_requested::public.user_role;
  else
    v_role := 'agent';
  end if;

  -- A contractor profile must point at a contractor record. Create it as
  -- pending approval and inactive: the matching engine will not route to it
  -- until an administrator reviews the application.
  if v_role = 'contractor' then
    insert into public.contractors (
      business_name, contact_name, email, phone,
      membership_status, is_active, accepting_opportunities
    )
    values (
      coalesce(nullif(new.raw_user_meta_data ->> 'business_name', ''), v_full_name),
      v_full_name,
      new.email,
      coalesce(new.raw_user_meta_data ->> 'phone', ''),
      'pending_approval', false, true
    )
    returning id into v_contractor;
  end if;

  insert into public.profiles (id, role, full_name, email, phone, contractor_id)
  values (
    new.id,
    v_role,
    v_full_name,
    new.email,
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    v_contractor
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- Keep the profile's email in step when a user changes it through Supabase Auth.
create or replace function app.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function app.handle_user_email_change();
