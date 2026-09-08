-- ===========================================================================
-- LOCAL TEST HARNESS — DO NOT RUN THIS AGAINST A SUPABASE PROJECT.
--
-- Supabase provides the `auth` and `storage` schemas, the auth.uid() helper
-- and the anon/authenticated/service_role database roles. This file recreates
-- just enough of them on a plain PostgreSQL server so the real migrations and
-- the RLS test suite can be executed and verified locally, in CI, or on a
-- laptop with no Supabase project.
--
-- Everything the migrations rely on is stubbed here with the same signatures
-- Supabase uses, so a policy that passes here behaves the same way there.
-- ===========================================================================

create extension if not exists pgcrypto;

-- Supabase's database roles.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant anon, authenticated, service_role to current_user;

-- ---------------------------------------------------------------------------
-- auth schema
-- ---------------------------------------------------------------------------
create schema if not exists auth;

create table if not exists auth.users (
  instance_id        uuid,
  id                 uuid primary key,
  aud                varchar(255),
  role               varchar(255),
  email              varchar(255) unique,
  encrypted_password varchar(255),
  email_confirmed_at timestamptz,
  raw_app_meta_data  jsonb,
  raw_user_meta_data jsonb,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create table if not exists auth.identities (
  provider_id     text        not null,
  user_id         uuid        not null references auth.users (id) on delete cascade,
  identity_data   jsonb       not null,
  provider        text        not null,
  last_sign_in_at timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  primary key (provider, provider_id)
);

-- Same behaviour as Supabase: read the subject out of the request's JWT claims.
-- Tests set the claims GUC directly to impersonate a user.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', 'anon');
$$;

create or replace function auth.email()
returns text
language sql
stable
as $$
  select current_setting('request.jwt.claims', true)::jsonb ->> 'email';
$$;

grant usage on schema auth to authenticated, service_role, anon;
grant execute on all functions in schema auth to authenticated, service_role, anon;

-- ---------------------------------------------------------------------------
-- storage schema
-- ---------------------------------------------------------------------------
create schema if not exists storage;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text,
  owner      uuid,
  metadata   jsonb,
  created_at timestamptz default now()
);

alter table storage.objects enable row level security;

-- Splits 'requests/<uuid>/file.pdf' into {requests, <uuid>} — Supabase drops
-- the final path segment (the file name), and so does this.
create or replace function storage.foldername(name text)
returns text[]
language plpgsql
immutable
as $$
declare
  parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[1 : array_length(parts, 1) - 1];
end;
$$;

grant usage on schema storage to authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
