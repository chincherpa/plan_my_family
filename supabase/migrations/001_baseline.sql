-- Baseline schema, reconstructed from src/lib/supabase/types.ts and the
-- now-removed 002_is_event.sql / 003_is_all_day.sql / 004_calendar_hours.sql.
-- The original 001_initial.sql was applied directly (dashboard/SQL editor)
-- and never committed to this repo, so migration history did not match the
-- live database. This file re-establishes a from-scratch baseline so
-- `supabase db reset` can rebuild the schema. RLS policies below follow the
-- app's family-scoped access pattern but were not diffed against the live
-- database's actual policies — verify before relying on this for a fresh
-- environment.

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

-- Row Level Security -------------------------------------------------------

alter table families enable row level security;
alter table family_members enable row level security;
alter table vehicles enable row level security;
alter table appointments enable row level security;
alter table appointment_participants enable row level security;
alter table meals enable row level security;

create or replace function is_family_member(target_family_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from family_members
    where family_id = target_family_id
      and user_id = auth.uid()
  );
$$;

-- Used by the family_invites policies in 005/006.
create or replace function get_my_family_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select family_id from family_members where user_id = auth.uid();
$$;

create policy "family members can read their family" on families
  for select using (is_family_member(id));

create policy "family members can read family_members" on family_members
  for select using (is_family_member(family_id));
create policy "family members can manage family_members" on family_members
  for all using (is_family_member(family_id)) with check (is_family_member(family_id));

create policy "family members can manage vehicles" on vehicles
  for all using (is_family_member(family_id)) with check (is_family_member(family_id));

create policy "family members can manage appointments" on appointments
  for all using (is_family_member(family_id)) with check (is_family_member(family_id));

create policy "family members can manage appointment_participants" on appointment_participants
  for all using (
    exists (select 1 from appointments a where a.id = appointment_id and is_family_member(a.family_id))
  ) with check (
    exists (select 1 from appointments a where a.id = appointment_id and is_family_member(a.family_id))
  );

create policy "family members can manage meals" on meals
  for all using (is_family_member(family_id)) with check (is_family_member(family_id));
