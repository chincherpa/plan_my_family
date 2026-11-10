# Konten verwalten

Die App hat keine Registrierung und keine Einladungslinks. Logins legst du selbst
in Supabase an und verknüpfst sie mit einem Familienmitglied.

Einmalig in Supabase: **Authentication → Sign In / Providers → „Allow new users to
sign up“ ausschalten.** Erst damit ist die Anmeldung wirklich zu; der Code allein
verhindert nicht, dass jemand die Supabase-API direkt aufruft.

## Neues Login anlegen

1. **Authentication → Users → Add user → Create new user**: E-Mail und Passwort,
   „Auto Confirm User“ anhaken.
2. Im **SQL Editor** das Login mit einem Mitglied verknüpfen.

   Das Mitglied gibt es schon in der App (z. B. unter Einstellungen angelegt):

   ```sql
   update family_members
   set user_id = (select id from auth.users where email = 'ben@example.com')
   where name = 'Ben';
   ```

   Oder ein neues Mitglied direkt mit Login anlegen:

   ```sql
   insert into family_members (family_id, name, color, user_id, sort_order)
   select family_id, 'Clara', '#ec4899',
          (select id from auth.users where email = 'clara@example.com'),
          (select coalesce(max(sort_order) + 1, 0) from family_members)
   from family_members limit 1;
   ```

Jedes Login gehört zu genau einem Mitglied. Die App selbst kann `user_id` nicht
ändern (Trigger `prevent_member_identity_change`), nur der SQL Editor.

## Login entfernen

Unter **Authentication → Users** den Nutzer löschen. Das Familienmitglied mit
seinen Terminen bleibt erhalten, es hat nur kein Login mehr.

## Mitglied mit Login löschen

Ein Mitglied mit Login lässt sich in der App nicht löschen (Schutz per Policy
`members_delete`, Migration 020). Erst das Login entfernen (siehe oben) oder
`user_id` im SQL Editor auf `null` setzen:

```sql
update family_members set user_id = null where name = 'Clara';
```

Danach ist das Mitglied wie jedes andere löschbar.
