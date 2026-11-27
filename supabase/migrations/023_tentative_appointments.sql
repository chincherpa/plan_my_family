-- appointments.is_tentative: Termin ist eingetragen, aber noch nicht zugesagt
-- („Zusage ausstehend“). Der Kalender zeigt solche Termine abgeschwächt an.

alter table appointments
  add column is_tentative boolean not null default false;

-- Wie 019, zusätzlich mit is_tentative. anniversary_* bleibt weiterhin
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
      recurrence_parent_id, exception_date, skip_school_holidays, is_tentative
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
      coalesce((appointment_data ->> 'skip_school_holidays')::boolean, false),
      coalesce((appointment_data ->> 'is_tentative')::boolean, false)
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
      skip_school_holidays = coalesce((appointment_data ->> 'skip_school_holidays')::boolean, false),
      is_tentative = coalesce((appointment_data ->> 'is_tentative')::boolean, false)
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
