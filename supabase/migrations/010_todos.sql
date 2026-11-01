-- Family todo list: main todos with optional sub-items, both assignable to a
-- family member. Mirrors the family-scoped RLS pattern from 001_baseline.sql.
--
-- Uses plain (non-composite) foreign keys for assignee_id/todo_id, matching
-- appointments.owner_id/vehicle_id in the current live baseline — migration
-- 009 (composite family_id FKs) has not been applied to the live database
-- yet, so the (id, family_id) unique constraints it would add don't exist.

create table todos (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  title text not null,
  assignee_id uuid references family_members(id) on delete set null,
  is_done boolean not null default false,
  created_at timestamptz not null default now()
);

-- family_id is denormalized onto todo_items (rather than joined through
-- todos) so the RLS policy stays a single family_id check and a realtime
-- DELETE payload (replica identity full) carries family_id directly.
create table todo_items (
  id uuid primary key default gen_random_uuid(),
  todo_id uuid not null references todos(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  title text not null,
  assignee_id uuid references family_members(id) on delete set null,
  is_done boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index todos_family_id_idx on todos (family_id);
create index todo_items_todo_id_idx on todo_items (todo_id);

alter table todos enable row level security;
alter table todo_items enable row level security;

create policy todos_all on todos
  for all using (family_id in (select get_my_family_ids()));

create policy todo_items_all on todo_items
  for all using (family_id in (select get_my_family_ids()));

alter table todos replica identity full;
alter table todo_items replica identity full;
