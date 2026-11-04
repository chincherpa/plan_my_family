-- Self-service registration of new families is closed.
--
-- The app is reachable from the internet (Vercel), and sign-ups have to stay
-- enabled in Supabase Auth: /join creates the account of an invited member
-- with signUp(). Without this migration anyone could therefore sign up and
-- create a family of their own. They could not see another family's data
-- (RLS), but the database would collect stray accounts and families.
--
-- Dropping the INSERT policy makes `families` read/update-only for clients.
-- Joining an existing family is unaffected: accept_invite() is SECURITY
-- DEFINER and inserts the member row itself.
--
-- To allow a new family again (e.g. for friends), recreate the policy from
-- 001_baseline.sql, register, and drop it afterwards:
--   create policy families_insert on families
--     for insert with check (auth.uid() is not null);

drop policy if exists families_insert on families;
