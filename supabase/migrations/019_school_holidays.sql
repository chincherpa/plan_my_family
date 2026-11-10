-- Schulferien und Serientermine, die in den Ferien ausfallen.
--
-- school_holidays: ein Ferienzeitraum pro Zeile, start_date/end_date jeweils
-- einschließlich (lokale Kalendertage). Im Kalender erscheinen sie als
-- ganztägiger Hinweis an jedem Tag des Zeitraums.
--
-- appointments.skip_school_holidays: Vorkommen einer Serie, die in Schulferien
-- fallen, werden beim Aufklappen der Serie übersprungen und zählen bei
-- COUNT=n nicht mit (die Serie läuft entsprechend länger). Die Auswertung
-- passiert im Client (expandAppointments), die Regel selbst bleibt unverändert.

create table school_holidays (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  constraint school_holidays_name_length check (char_length(btrim(name)) between 1 and 100),
  constraint school_holidays_range_valid check (end_date >= start_date)
);

create index school_holidays_family_start_idx on school_holidays (family_id, start_date);

alter table school_holidays enable row level security;

create policy school_holidays_all on school_holidays
  for all using (family_id in (select get_my_family_ids()))
  with check (family_id in (select get_my_family_ids()));

alter table school_holidays replica identity full;
alter publication supabase_realtime add table school_holidays;

-- Ferientermine Schuljahre 2027/28 bis 2029/30 (für jede vorhandene Familie;
-- laut 014 gibt es genau eine).
insert into school_holidays (family_id, name, start_date, end_date)
select f.id, h.name, h.start_date::date, h.end_date::date
from families f
cross join (values
  ('Sommerferien 2027',          '2027-07-29', '2027-09-11'),
  ('Herbstferien 2027',          '2027-11-02', '2027-11-06'),
  ('Weihnachtsferien 2027/2028', '2027-12-23', '2028-01-08'),
  ('Osterferien 2028',           '2028-04-18', '2028-04-22'),
  ('Pfingstferien 2028',         '2028-06-06', '2028-06-17'),
  ('Sommerferien 2028',          '2028-07-27', '2028-09-09'),
  ('Herbstferien 2028',          '2028-10-30', '2028-11-03'),
  ('Weihnachtsferien 2028/2029', '2028-12-23', '2029-01-05'),
  ('Osterferien 2029',           '2029-03-26', '2029-04-07'),
  ('Pfingstferien 2029',         '2029-05-22', '2029-06-01'),
  ('Sommerferien 2029',          '2029-07-26', '2029-09-08'),
  ('Herbstferien 2029',          '2029-10-29', '2029-11-02'),
  ('Weihnachtsferien 2029/2030', '2029-12-22', '2030-01-05'),
  ('Osterferien 2030',           '2030-04-15', '2030-04-26'),
  ('Pfingstferien 2030',         '2030-06-11', '2030-06-21')
) as h(name, start_date, end_date);

alter table appointments
  add column skip_school_holidays boolean not null default false;

-- Wie 009, zusätzlich mit skip_school_holidays. anniversary_* bleibt weiterhin
-- unangetastet (siehe 016).
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
      recurrence_parent_id, exception_date, skip_school_holidays
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
      (appointment_data ->> 'exception_date')::date,
      coalesce((appointment_data ->> 'skip_school_holidays')::boolean, false)
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
      recurrence_rule = appointment_data ->> 'recurrence_rule',
      skip_school_holidays = coalesce((appointment_data ->> 'skip_school_holidays')::boolean, false)
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
