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

-- Postgres grants EXECUTE on a new function to PUBLIC by default and every
-- Supabase role inherits that, so `revoke ... from anon` alone is a no-op:
-- the PUBLIC grant has to go first, then EXECUTE goes back only to the
-- roles that need each function. PostgREST exposes anything executable
-- under /rest/v1/rpc/.
--
-- Verified against the live database: revoking get_my_family_ids() from
-- `authenticated` makes `select from families` fail with "permission denied
-- for function get_my_family_ids". RLS policy expressions are evaluated as
-- the querying role, so the grant to authenticated is required, not
-- optional — these two cannot be locked down further without rewriting the
-- policies to inline the subquery.
revoke execute on function get_my_family_ids() from public;
grant execute on function get_my_family_ids() to authenticated, service_role;

revoke execute on function family_is_empty(uuid) from public;
grant execute on function family_is_empty(uuid) to authenticated, service_role;

-- accept_invite() must not be reachable without a session: called as anon,
-- auth.uid() is null, so it would consume the invite while inserting a
-- family_members row with a null user_id that nobody can ever claim.
-- It carried both the PUBLIC default and an explicit anon grant.
revoke execute on function accept_invite(text, text, text) from public;
revoke execute on function accept_invite(text, text, text) from anon;
grant execute on function accept_invite(text, text, text) to authenticated, service_role;

-- check_invite_valid() is the one that legitimately needs anon: /join
-- checks the link before the visitor has an account.
revoke execute on function check_invite_valid(text) from public;
grant execute on function check_invite_valid(text) to anon, authenticated, service_role;

-- Redundant read policies: these tables already carry a FOR ALL policy
-- whose USING clause covers SELECT. Keeping both means two expression
-- evaluations per row for no added access.
-- NOT families/family_members: those are split into per-command policies
-- with no FOR ALL, so their _select policy is the only read grant.
drop policy if exists vehicles_select on vehicles;
drop policy if exists appointments_select on appointments;
drop policy if exists participants_select on appointment_participants;
drop policy if exists meals_select on meals;
