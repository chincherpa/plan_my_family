-- Accounts are managed by the owner, not by the app.
--
-- The app is reachable from the internet (Vercel). Self-service sign-up and
-- invite links are both removed: new logins are created in the Supabase
-- dashboard (Authentication -> Users -> Add user) with "Allow new users to
-- sign up" switched off, and linked to a family member in the SQL editor.
-- See docs/konten.md.

-- 1. No client may create a family any more.
drop policy if exists families_insert on families;

-- 2. Members can only be added by someone already in the family. The former
--    bootstrap branch (insert yourself into an empty family) existed only for
--    the registration flow.
drop policy if exists members_insert on family_members;
create policy members_insert on family_members
  for insert with check (family_id in (select get_my_family_ids()));
drop function if exists family_is_empty(uuid);

-- 3. Invites are gone. The table is empty in the live project.
drop function if exists accept_invite(text, text, text);
drop function if exists check_invite_valid(text);
drop table if exists family_invites;

-- 4. Linking a login to a member. The identity of a member stays immutable for
--    API clients (anon/authenticated), so nobody can take over another
--    member's row through the app. The owner in the SQL editor (postgres) may
--    set user_id, which is how a dashboard-created account gets its member.
create or replace function prevent_member_identity_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated')
     and (old.user_id is distinct from new.user_id
          or old.family_id is distinct from new.family_id) then
    raise exception 'family member identity cannot be changed';
  end if;
  return new;
end;
$$;
