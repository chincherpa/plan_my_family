-- Baseline schema. The original 001_initial.sql was applied directly
-- (dashboard/SQL editor) and never committed, so migration history did not
-- match the live database. This file re-establishes a from-scratch baseline
-- so `supabase db reset` can rebuild the schema.
--
-- The RLS section below was diffed against the live project's pg_policies
-- and pg_proc on 2026-08-21 and now mirrors it (policy names included), so
-- a local reset reproduces production rather than an idealised guess.

create table if not exists families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  calendar_start_hour smallint not null default 0,
  calendar_end_hour smallint not null default 24,
  created_at timestamptz not null default now()
);

create table if not exists family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  color text not null,
  cannot_be_alone boolean not null default false,
  is_guardian boolean not null default false,
  user_id uuid references auth.users(id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists vehicles (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  icon_emoji text not null default '🚗',
  created_at timestamptz not null default now()
);

create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  title text not null,
  notes text,
  start_time timestamptz not null,
  end_time timestamptz not null,
  travel_before_min integer not null default 0,
  travel_after_min integer not null default 0,
  vehicle_id uuid references vehicles(id) on delete set null,
  owner_id uuid references family_members(id) on delete set null,
  is_all_family boolean not null default false,
  is_event boolean not null default false,
  is_all_day boolean not null default false,
  recurrence_rule text,
  recurrence_parent_id uuid references appointments(id) on delete cascade,
  exception_date date,
  is_deleted boolean not null default false,
  color text,
  created_at timestamptz not null default now()
);

create table if not exists appointment_participants (
  appointment_id uuid not null references appointments(id) on delete cascade,
  member_id uuid not null references family_members(id) on delete cascade,
  is_supervisor boolean not null default false,
  primary key (appointment_id, member_id)
);

-- Meal planning is free text: one row per family and day holding the
-- dish names. No recipe database.
create table if not exists meals (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  date date not null,
  lunch text,
  dinner text,
  created_at timestamptz not null default now(),
  unique (family_id, date)
);

create table if not exists keep_alive (
  id bigint generated always as identity primary key,
  update text not null
);

-- Row Level Security -------------------------------------------------------

alter table families enable row level security;
alter table family_members enable row level security;
alter table vehicles enable row level security;
alter table appointments enable row level security;
alter table appointment_participants enable row level security;
alter table meals enable row level security;
-- Deliberately policy-less: RLS on with no policy denies every client.
alter table keep_alive enable row level security;

-- Backbone of every policy below. SECURITY DEFINER so it reads
-- family_members without re-entering that table's own RLS.
-- `set search_path` is required: without it a caller-controlled search_path
-- could resolve `family_members` to a shadowing table.
create or replace function get_my_family_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select family_id from family_members where user_id = auth.uid();
$$;

-- "Is this family still empty?" for the registration bootstrap, in a
-- SECURITY DEFINER helper so the members_insert policy does not recurse
-- into family_members (42P17).
create or replace function family_is_empty(fid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select not exists (select 1 from family_members where family_id = fid);
$$;

-- These back RLS policies and are not meant as public API endpoints.
-- EXECUTE defaults to PUBLIC, which every Supabase role inherits, so the
-- default has to be revoked before granting it back deliberately.
-- `authenticated` is required: policy expressions are evaluated as the
-- querying role and would fail with "permission denied for function".
revoke execute on function get_my_family_ids() from public;
grant execute on function get_my_family_ids() to authenticated, service_role;
revoke execute on function family_is_empty(uuid) from public;
grant execute on function family_is_empty(uuid) to authenticated, service_role;

create policy families_select on families
  for select using (id in (select get_my_family_ids()));
create policy families_insert on families
  for insert with check (auth.uid() is not null);
create policy families_update on families
  for update using (id in (select get_my_family_ids()));

create policy members_select on family_members
  for select using (family_id in (select get_my_family_ids()));
create policy members_insert on family_members
  for insert with check (
    (user_id = auth.uid() and family_is_empty(family_id))
    or family_id in (select get_my_family_ids())
  );
create policy members_update on family_members
  for update using (family_id in (select get_my_family_ids()));
create policy members_delete on family_members
  for delete using (family_id in (select get_my_family_ids()));

create policy vehicles_all on vehicles
  for all using (family_id in (select get_my_family_ids()));

create policy appointments_all on appointments
  for all using (family_id in (select get_my_family_ids()));

create policy participants_all on appointment_participants
  for all using (
    appointment_id in (
      select id from appointments where family_id in (select get_my_family_ids())
    )
  );

create policy meals_all on meals
  for all using (family_id in (select get_my_family_ids()));
