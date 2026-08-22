-- supabase/migrations/008_harden_rls_helpers.sql
--
-- get_my_family_ids() is SECURITY DEFINER and backs every RLS policy in the
-- schema, but was created without a fixed search_path. A caller who can
-- create objects in a schema that precedes `public` on the search_path
-- could shadow `family_members` and make the function return arbitrary
-- family ids — i.e. read and write any family's data.
-- (Supabase database linter: 0011_function_search_path_mutable)
create or replace function get_my_family_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select family_id from family_members where user_id = auth.uid();
$$;

-- Both helpers exist to be called from inside policies, not as REST
-- endpoints. PostgREST exposes every executable function under /rpc/, and
-- family_is_empty() would otherwise let anyone probe whether a given
-- family id exists and is empty.
-- (linter: 0028_anon_security_definer_function_executable)
revoke execute on function get_my_family_ids() from anon;
revoke execute on function family_is_empty(uuid) from anon;

-- Redundant read policies: these tables already carry a FOR ALL policy
-- whose USING clause covers SELECT. Keeping both means two expression
-- evaluations per row for no added access.
-- NOT families/family_members: those are split into per-command policies
-- with no FOR ALL, so their _select policy is the only read grant.
drop policy if exists vehicles_select on vehicles;
drop policy if exists appointments_select on appointments;
drop policy if exists participants_select on appointment_participants;
drop policy if exists meals_select on meals;
