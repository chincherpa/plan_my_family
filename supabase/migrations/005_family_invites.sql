-- supabase/migrations/005_family_invites.sql

-- 1. Tabelle
create table family_invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  code text not null unique,
  created_by uuid references auth.users(id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_at timestamptz,
  used_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table family_invites enable row level security;

create policy invites_select on family_invites
  for select using (family_id in (select get_my_family_ids()));

create policy invites_insert on family_invites
  for insert with check (family_id in (select get_my_family_ids()));

create policy invites_update on family_invites
  for update using (family_id in (select get_my_family_ids()));

-- 2. Public check (kein Login nötig, keine Details preisgeben)
create or replace function check_invite_valid(invite_code text)
returns boolean
language sql security definer set search_path = public as $$
  select exists (
    select 1 from family_invites
    where code = invite_code and used_at is null and expires_at > now()
  );
$$;
grant execute on function check_invite_valid(text) to anon, authenticated;

-- 3. Invite annehmen (atomar, race-condition-sicher via FOR UPDATE)
create or replace function accept_invite(invite_code text, member_name text, member_color text)
returns family_members
language plpgsql security definer set search_path = public as $$
declare
  inv family_invites%rowtype;
  new_member family_members%rowtype;
begin
  select * into inv from family_invites
    where code = invite_code and used_at is null and expires_at > now()
    for update;

  if not found then
    raise exception 'invite_invalid';
  end if;

  insert into family_members (family_id, name, color, user_id, sort_order)
  values (
    inv.family_id, member_name, member_color, auth.uid(),
    (select coalesce(max(sort_order) + 1, 0) from family_members where family_id = inv.family_id)
  )
  returning * into new_member;

  update family_invites set used_at = now(), used_by = auth.uid() where id = inv.id;

  return new_member;
end;
$$;
grant execute on function accept_invite(text, text, text) to authenticated;

-- 4. Security-Fix: members_insert verschärfen
-- Vorher erlaubte "(user_id = auth.uid())" ohne family_id-Einschränkung jedem
-- eingeloggten User, sich per bekannter family_id in eine beliebige fremde
-- Familie einzutragen. Self-Insert bleibt nur noch beim Bootstrap einer
-- brandneuen, leeren Familie erlaubt (Registrierungs-Flow); Beitritt zu einer
-- bestehenden Familie läuft ab jetzt ausschließlich über accept_invite().
drop policy members_insert on family_members;

create policy members_insert on family_members
  for insert with check (
    (
      user_id = auth.uid()
      and not exists (
        select 1 from family_members fm where fm.family_id = family_members.family_id
      )
    )
    or family_id in (select get_my_family_ids())
  );
