-- supabase/migrations/006_fix_members_insert_recursion.sql

-- 1. Fix: members_insert policy caused infinite recursion (42P17) because its
-- WITH CHECK clause ran a self-referential "not exists (select ... from
-- family_members ...)" subquery as part of a policy ON family_members. Move
-- the "is this family empty" check into a SECURITY DEFINER helper function
-- (same pattern as get_my_family_ids()) so it bypasses RLS instead of
-- re-triggering it.
create or replace function family_is_empty(fid uuid)
returns boolean
language sql security definer stable set search_path = public as $$
  select not exists (select 1 from family_members where family_id = fid);
$$;

drop policy members_insert on family_members;

create policy members_insert on family_members
  for insert with check (
    (user_id = auth.uid() and family_is_empty(family_id))
    or family_id in (select get_my_family_ids())
  );

-- 2. Fix: accept_invite had no guard against a user who is already a member
-- of some family accepting another invite, which would give them a second
-- family_members row and break AppShell.tsx's .eq("user_id", user.id).single()
-- query (throws on >1 row).
create or replace function accept_invite(invite_code text, member_name text, member_color text)
returns family_members
language plpgsql security definer set search_path = public as $$
declare
  inv family_invites%rowtype;
  new_member family_members%rowtype;
begin
  if exists (select 1 from family_members where user_id = auth.uid()) then
    raise exception 'already_member';
  end if;

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
