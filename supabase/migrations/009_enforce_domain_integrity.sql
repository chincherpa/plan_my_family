-- Enforce family boundaries and appointment invariants at the database edge.
-- Requires PostgreSQL 15+ for the column-subset form of ON DELETE SET NULL.

create unique index family_members_user_id_unique
  on family_members (user_id)
  where user_id is not null;

alter table families
  add constraint families_calendar_hours_valid
  check (calendar_start_hour >= 0 and calendar_start_hour < calendar_end_hour and calendar_end_hour <= 24) not valid;

-- The composite foreign keys below reference these (id, family_id) pairs, so the
-- unique constraints backing them must already exist when the keys are added.
alter table family_members
  add constraint family_members_id_family_id_unique unique (id, family_id);

alter table vehicles
  add constraint vehicles_id_family_id_unique unique (id, family_id);

alter table appointments
  add constraint appointments_id_family_id_unique unique (id, family_id);

alter table appointments
  add constraint appointments_time_range_valid
  check (end_time > start_time) not valid,
  add constraint appointments_travel_minutes_valid
  check (travel_before_min >= 0 and travel_after_min >= 0) not valid,
  -- Only the reference is cleared on delete. Without the column list Postgres
  -- would also null family_id, which is not null, turning every member or
  -- vehicle deletion into a constraint violation.
  add constraint appointments_owner_family_id_fkey
  foreign key (owner_id, family_id)
  references family_members (id, family_id) on delete set null (owner_id) not valid,
  add constraint appointments_vehicle_family_id_fkey
  foreign key (vehicle_id, family_id)
  references vehicles (id, family_id) on delete set null (vehicle_id) not valid,
  add constraint appointments_recurrence_parent_family_id_fkey
  foreign key (recurrence_parent_id, family_id)
  references appointments (id, family_id) on delete cascade not valid;

-- A realtime DELETE payload carries only the replica identity. With the default
-- (primary key) the client cannot tell which family a deleted row belonged to,
-- so deletions would never reach the other devices of that family.
alter table appointments replica identity full;
alter table family_members replica identity full;
alter table vehicles replica identity full;
alter table meals replica identity full;

create or replace function prevent_member_identity_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.user_id is distinct from new.user_id or old.family_id is distinct from new.family_id then
    raise exception 'family member identity cannot be changed';
  end if;
  return new;
end;
$$;

create trigger family_members_identity_immutable
  before update of user_id, family_id on family_members
  for each row execute function prevent_member_identity_change();

create or replace function validate_appointment_participant_family()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from appointments appointment
    join family_members member on member.id = new.member_id
    where appointment.id = new.appointment_id
      and appointment.family_id = member.family_id
  ) then
    raise exception 'appointment participant must belong to the appointment family';
  end if;
  return new;
end;
$$;

create trigger appointment_participants_family_valid
  before insert or update of appointment_id, member_id on appointment_participants
  for each row execute function validate_appointment_participant_family();

create or replace function save_appointment_with_participants(
  appointment_data jsonb,
  participant_data jsonb,
  existing_appointment_id uuid default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  saved appointments%rowtype;
begin
  if existing_appointment_id is null then
    insert into appointments (
      family_id, title, notes, owner_id, is_all_family, is_event, is_all_day,
      start_time, end_time, travel_before_min, travel_after_min, vehicle_id, recurrence_rule,
      recurrence_parent_id, exception_date
    ) values (
      (appointment_data ->> 'family_id')::uuid,
      appointment_data ->> 'title',
      appointment_data ->> 'notes',
      (appointment_data ->> 'owner_id')::uuid,
      coalesce((appointment_data ->> 'is_all_family')::boolean, false),
      coalesce((appointment_data ->> 'is_event')::boolean, false),
      coalesce((appointment_data ->> 'is_all_day')::boolean, false),
      (appointment_data ->> 'start_time')::timestamptz,
      (appointment_data ->> 'end_time')::timestamptz,
      coalesce((appointment_data ->> 'travel_before_min')::integer, 0),
      coalesce((appointment_data ->> 'travel_after_min')::integer, 0),
      (appointment_data ->> 'vehicle_id')::uuid,
      appointment_data ->> 'recurrence_rule',
      (appointment_data ->> 'recurrence_parent_id')::uuid,
      (appointment_data ->> 'exception_date')::date
    ) returning * into saved;
  else
    update appointments
    set
      title = appointment_data ->> 'title',
      notes = appointment_data ->> 'notes',
      owner_id = (appointment_data ->> 'owner_id')::uuid,
      is_all_family = coalesce((appointment_data ->> 'is_all_family')::boolean, false),
      is_event = coalesce((appointment_data ->> 'is_event')::boolean, false),
      is_all_day = coalesce((appointment_data ->> 'is_all_day')::boolean, false),
      start_time = (appointment_data ->> 'start_time')::timestamptz,
      end_time = (appointment_data ->> 'end_time')::timestamptz,
      travel_before_min = coalesce((appointment_data ->> 'travel_before_min')::integer, 0),
      travel_after_min = coalesce((appointment_data ->> 'travel_after_min')::integer, 0),
      vehicle_id = (appointment_data ->> 'vehicle_id')::uuid,
      recurrence_rule = appointment_data ->> 'recurrence_rule'
    where id = existing_appointment_id
    returning * into saved;

    if not found then
      raise exception 'appointment_not_found';
    end if;

    delete from appointment_participants where appointment_id = saved.id;
  end if;

  insert into appointment_participants (appointment_id, member_id, is_supervisor)
  select
    saved.id,
    (participant ->> 'member_id')::uuid,
    coalesce((participant ->> 'is_supervisor')::boolean, false)
  from jsonb_array_elements(participant_data) participant;

  return (
    select to_jsonb(saved) || jsonb_build_object(
      'participants', coalesce(jsonb_agg(to_jsonb(participant)), '[]'::jsonb)
    )
    from appointment_participants participant
    where participant.appointment_id = saved.id
  );
end;
$$;

revoke execute on function save_appointment_with_participants(jsonb, jsonb, uuid) from public;
grant execute on function save_appointment_with_participants(jsonb, jsonb, uuid) to authenticated, service_role;

create or replace function reorder_family_members(member_ids uuid[])
returns void
language plpgsql
set search_path = public
as $$
declare
  target_family_id uuid;
begin
  select family_id into target_family_id from family_members where id = member_ids[1];

  if target_family_id is null
    or cardinality(member_ids) <> (select count(*) from family_members where family_id = target_family_id)
    or exists (
      select 1 from family_members
      where family_id = target_family_id and id <> all(member_ids)
    ) then
    raise exception 'member_ids must contain every member of one family exactly once';
  end if;

  update family_members member
  set sort_order = ordered.position - 1
  from unnest(member_ids) with ordinality as ordered(id, position)
  where member.id = ordered.id;
end;
$$;

revoke execute on function reorder_family_members(uuid[]) from public;
grant execute on function reorder_family_members(uuid[]) to authenticated, service_role;