-- Ein Mitglied mit Login (user_id gesetzt) darf nicht gelöscht werden, sonst
-- sperrt man sich selbst aus der Familie aus. Erst user_id auf null setzen.
drop policy members_delete on family_members;
create policy members_delete on family_members
  for delete using (family_id in (select get_my_family_ids()) and user_id is null);
