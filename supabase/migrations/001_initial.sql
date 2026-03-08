-- ============================================================
-- Family Planner - Initial Schema
-- WICHTIG: Erst alle Tabellen anlegen, dann alle Policies!
-- ============================================================

create extension if not exists "uuid-ossp";

-- ============================================================
-- TABELLEN
-- ============================================================

create table public.families (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.family_members (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  color text not null default '#6366f1',
  cannot_be_alone boolean not null default false,
  is_guardian boolean not null default false,
  user_id uuid references auth.users(id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.vehicles (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  icon_emoji text not null default '🚗',
  created_at timestamptz not null default now()
);

create table public.appointments (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null,
  notes text,
  start_time timestamptz not null,
  end_time timestamptz not null,
  travel_before_min int not null default 0,
  travel_after_min int not null default 0,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  owner_id uuid references public.family_members(id) on delete set null,
  is_all_family boolean not null default false,
  recurrence_rule text,
  recurrence_parent_id uuid references public.appointments(id) on delete cascade,
  exception_date date,
  is_deleted boolean not null default false,
  color text,
  created_at timestamptz not null default now(),
  constraint valid_times check (end_time > start_time)
);

create index appointments_family_id_idx on public.appointments(family_id);
create index appointments_start_time_idx on public.appointments(start_time);
create index appointments_parent_idx on public.appointments(recurrence_parent_id);

create table public.appointment_participants (
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  member_id uuid not null references public.family_members(id) on delete cascade,
  is_supervisor boolean not null default false,
  primary key (appointment_id, member_id)
);

-- ============================================================
-- RLS AKTIVIEREN
-- ============================================================

alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.vehicles enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_participants enable row level security;

-- ============================================================
-- POLICIES: FAMILIES
-- Policies referenzieren family_members — jetzt existiert die Tabelle bereits
-- ============================================================

create policy "families_select"
  on public.families for select
  using (
    id in (
      select family_id from public.family_members
      where user_id = auth.uid()
    )
  );

create policy "families_update"
  on public.families for update
  using (
    id in (
      select family_id from public.family_members
      where user_id = auth.uid()
    )
  );

-- Jeder eingeloggte User darf eine Familie erstellen (für Registrierung)
create policy "families_insert"
  on public.families for insert
  with check (auth.uid() is not null);

-- ============================================================
-- POLICIES: FAMILY_MEMBERS
-- Bootstrapping-Problem: Beim ersten Insert gibt es noch keinen Eintrag.
-- Lösung: Insert erlaubt wenn user_id = auth.uid() (eigener Eintrag)
--         ODER wenn bereits Mitglied der Familie ist.
-- ============================================================

create policy "members_select"
  on public.family_members for select
  using (
    family_id in (
      select family_id from public.family_members fm2
      where fm2.user_id = auth.uid()
    )
  );

-- Erster Eintrag: user_id muss dem eingeloggten User gehören
-- Weitere Einträge: User muss bereits in der Familie sein
create policy "members_insert"
  on public.family_members for insert
  with check (
    -- Eigenen Eintrag anlegen (erster Member beim Registrieren)
    user_id = auth.uid()
    or
    -- Weiteres Mitglied hinzufügen (User ist bereits in der Familie)
    family_id in (
      select family_id from public.family_members fm2
      where fm2.user_id = auth.uid()
    )
  );

create policy "members_update"
  on public.family_members for update
  using (
    family_id in (
      select family_id from public.family_members fm2
      where fm2.user_id = auth.uid()
    )
  );

create policy "members_delete"
  on public.family_members for delete
  using (
    family_id in (
      select family_id from public.family_members fm2
      where fm2.user_id = auth.uid()
    )
  );

-- ============================================================
-- POLICIES: VEHICLES
-- ============================================================

create policy "vehicles_select"
  on public.vehicles for select
  using (
    family_id in (
      select family_id from public.family_members
      where user_id = auth.uid()
    )
  );

create policy "vehicles_all"
  on public.vehicles for all
  using (
    family_id in (
      select family_id from public.family_members
      where user_id = auth.uid()
    )
  );

-- ============================================================
-- POLICIES: APPOINTMENTS
-- ============================================================

create policy "appointments_select"
  on public.appointments for select
  using (
    family_id in (
      select family_id from public.family_members
      where user_id = auth.uid()
    )
  );

create policy "appointments_all"
  on public.appointments for all
  using (
    family_id in (
      select family_id from public.family_members
      where user_id = auth.uid()
    )
  );

-- ============================================================
-- POLICIES: APPOINTMENT_PARTICIPANTS
-- ============================================================

create policy "participants_select"
  on public.appointment_participants for select
  using (
    appointment_id in (
      select id from public.appointments a
      where a.family_id in (
        select family_id from public.family_members
        where user_id = auth.uid()
      )
    )
  );

create policy "participants_all"
  on public.appointment_participants for all
  using (
    appointment_id in (
      select id from public.appointments a
      where a.family_id in (
        select family_id from public.family_members
        where user_id = auth.uid()
      )
    )
  );

-- ============================================================
-- REALTIME
-- ============================================================
alter publication supabase_realtime add table public.appointments;
alter publication supabase_realtime add table public.appointment_participants;
alter publication supabase_realtime add table public.family_members;
alter publication supabase_realtime add table public.vehicles;
