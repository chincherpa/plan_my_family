-- Notizen: PIN-geschützter Bereich mit freien Text-Notizen.
--
-- Die App nutzt ein gemeinsames Familien-Login, eine reine UI-Sperre würde
-- also nichts schützen (jeder am Gerät könnte die Tabelle über die API
-- lesen). Deshalb:
--   * notes und family_secrets haben RLS ohne Policies — direkter Zugriff
--     liefert für anon/authenticated nichts.
--   * Zugriff nur über die security-definer-RPCs unten, die bei jedem Aufruf
--     die PIN prüfen.
--   * Die PIN liegt nur als bcrypt-Hash vor (pgcrypto), Default „0000“.
--   * Nach NOTES_MAX_FAILS Fehlversuchen ist die PIN für einige Minuten
--     gesperrt, damit sich 10.000 vierstellige PINs nicht durchprobieren lassen.
--     Die RPCs melden Fehler deshalb per Rückgabewert statt per Exception —
--     eine Exception würde den Fehlversuchszähler mit zurückrollen.
--   * PIN ändern dürfen nur Erwachsene (family_members.is_guardian) und nur
--     mit der aktuellen PIN.

create extension if not exists pgcrypto with schema extensions;

create table family_secrets (
  family_id uuid primary key references families(id) on delete cascade,
  notes_pin_hash text not null,
  notes_pin_failed_attempts integer not null default 0,
  notes_pin_locked_until timestamptz
);

alter table family_secrets enable row level security;

insert into family_secrets (family_id, notes_pin_hash)
select id, extensions.crypt('0000', extensions.gen_salt('bf'))
from families
on conflict do nothing;

create table notes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  title text not null default '',
  body text not null default '',
  is_important boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notes_title_length check (char_length(title) <= 200),
  constraint notes_body_length check (char_length(body) <= 20000),
  constraint notes_not_empty check (char_length(btrim(title)) > 0 or char_length(btrim(body)) > 0)
);

create index notes_family_idx on notes (family_id);

alter table notes enable row level security;

-- Familie des aufrufenden Logins (laut 014 gibt es genau eine).
create or replace function notes_caller_family()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select family_id from family_members where user_id = auth.uid() limit 1;
$$;

-- Prüft die PIN und führt den Fehlversuchszähler. Ergebnis: 'ok',
-- 'wrong_pin', 'locked' oder 'no_family'. Fehlt die Zeile in family_secrets
-- (Familie nach dieser Migration angelegt), gilt der Default „0000“.
create or replace function notes_check_pin(fid uuid, pin text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  secret family_secrets%rowtype;
  max_fails constant integer := 5;
  lock_interval constant interval := interval '5 minutes';
begin
  if fid is null then
    return 'no_family';
  end if;

  insert into family_secrets (family_id, notes_pin_hash)
  values (fid, extensions.crypt('0000', extensions.gen_salt('bf')))
  on conflict (family_id) do nothing;

  select * into secret from family_secrets where family_id = fid for update;

  if secret.notes_pin_locked_until is not null and secret.notes_pin_locked_until > now() then
    return 'locked';
  end if;

  if pin is not null and extensions.crypt(pin, secret.notes_pin_hash) = secret.notes_pin_hash then
    update family_secrets
    set notes_pin_failed_attempts = 0, notes_pin_locked_until = null
    where family_id = fid;
    return 'ok';
  end if;

  update family_secrets
  set
    notes_pin_failed_attempts = case
      when secret.notes_pin_failed_attempts + 1 >= max_fails then 0
      else secret.notes_pin_failed_attempts + 1
    end,
    notes_pin_locked_until = case
      when secret.notes_pin_failed_attempts + 1 >= max_fails then now() + lock_interval
      else null
    end
  where family_id = fid;

  return case when secret.notes_pin_failed_attempts + 1 >= max_fails then 'locked' else 'wrong_pin' end;
end;
$$;

-- Alle Notizen der Familie. Dient zugleich als „Entsperren“.
create or replace function notes_list(pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  fid uuid := notes_caller_family();
  check_result text := notes_check_pin(fid, pin);
begin
  if check_result <> 'ok' then
    return jsonb_build_object('error', check_result);
  end if;

  return jsonb_build_object('notes', coalesce(
    (select jsonb_agg(to_jsonb(n) order by n.is_important desc, n.updated_at desc)
     from notes n where n.family_id = fid),
    '[]'::jsonb
  ));
end;
$$;

-- Anlegen (note_id null) oder Bearbeiten. note_data: {title, body, is_important}.
create or replace function notes_save(pin text, note_data jsonb, note_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  fid uuid := notes_caller_family();
  check_result text := notes_check_pin(fid, pin);
  saved notes%rowtype;
  new_title text := btrim(coalesce(note_data ->> 'title', ''));
  new_body text := coalesce(note_data ->> 'body', '');
  new_important boolean := coalesce((note_data ->> 'is_important')::boolean, false);
begin
  if check_result <> 'ok' then
    return jsonb_build_object('error', check_result);
  end if;

  if char_length(new_title) = 0 and char_length(btrim(new_body)) = 0 then
    return jsonb_build_object('error', 'empty');
  end if;
  if char_length(new_title) > 200 or char_length(new_body) > 20000 then
    return jsonb_build_object('error', 'too_long');
  end if;

  if note_id is null then
    insert into notes (family_id, title, body, is_important)
    values (fid, new_title, new_body, new_important)
    returning * into saved;
  else
    update notes
    set title = new_title, body = new_body, is_important = new_important, updated_at = now()
    where id = note_id and family_id = fid
    returning * into saved;
    if not found then
      return jsonb_build_object('error', 'not_found');
    end if;
  end if;

  return jsonb_build_object('note', to_jsonb(saved));
end;
$$;

-- Nur „wichtig“ umschalten, ohne updated_at zu ändern (Sortierung bleibt stabil).
create or replace function notes_set_important(pin text, note_id uuid, important boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  fid uuid := notes_caller_family();
  check_result text := notes_check_pin(fid, pin);
  saved notes%rowtype;
begin
  if check_result <> 'ok' then
    return jsonb_build_object('error', check_result);
  end if;

  update notes set is_important = coalesce(important, false)
  where id = note_id and family_id = fid
  returning * into saved;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  return jsonb_build_object('note', to_jsonb(saved));
end;
$$;

create or replace function notes_delete(pin text, note_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  fid uuid := notes_caller_family();
  check_result text := notes_check_pin(fid, pin);
begin
  if check_result <> 'ok' then
    return jsonb_build_object('error', check_result);
  end if;

  delete from notes where id = note_id and family_id = fid;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- PIN ändern: nur Erwachsene, nur mit aktueller PIN, neue PIN 4–8 Ziffern.
create or replace function notes_change_pin(current_pin text, new_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  fid uuid := notes_caller_family();
  check_result text;
begin
  if not exists (
    select 1 from family_members where user_id = auth.uid() and is_guardian
  ) then
    return jsonb_build_object('error', 'not_guardian');
  end if;

  if new_pin is null or new_pin !~ '^[0-9]{4,8}$' then
    return jsonb_build_object('error', 'invalid_pin');
  end if;

  check_result := notes_check_pin(fid, current_pin);
  if check_result <> 'ok' then
    return jsonb_build_object('error', check_result);
  end if;

  update family_secrets
  set notes_pin_hash = extensions.crypt(new_pin, extensions.gen_salt('bf'))
  where family_id = fid;

  return jsonb_build_object('ok', true);
end;
$$;

-- Hilfsfunktionen gar nicht per RPC anbieten, die eigentlichen RPCs nur
-- angemeldeten Nutzern.
revoke execute on function notes_caller_family() from public, anon, authenticated;
revoke execute on function notes_check_pin(uuid, text) from public, anon, authenticated;

revoke execute on function notes_list(text) from public, anon;
revoke execute on function notes_save(text, jsonb, uuid) from public, anon;
revoke execute on function notes_set_important(text, uuid, boolean) from public, anon;
revoke execute on function notes_delete(text, uuid) from public, anon;
revoke execute on function notes_change_pin(text, text) from public, anon;

grant execute on function notes_list(text) to authenticated, service_role;
grant execute on function notes_save(text, jsonb, uuid) to authenticated, service_role;
grant execute on function notes_set_important(text, uuid, boolean) to authenticated, service_role;
grant execute on function notes_delete(text, uuid) to authenticated, service_role;
grant execute on function notes_change_pin(text, text) to authenticated, service_role;
