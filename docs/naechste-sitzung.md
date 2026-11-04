# Nächste Sitzung: Stand und Schritte

Kontext: Familienplaner (Next.js + Supabase), Repo chincherpa/plan_my_family.
Die App soll über Vercel öffentlich erreichbar sein, der Raspberry Pi bleibt zu.
Konten legt nur der Betreiber an, es gibt keine Registrierung und keine Einladungslinks.

Stand:
- PR #4 (ccr-82774424-ykjjsh -> master) ist offen: Registrierung/Einladungen entfernt,
  Migration 013, docs/konten.md. Branch ist mit master gemergt, Tests grün.
- Supabase-Projekt "family planner Project", Ref gciyahpatcawiyhbwvkq (eu-west-1).
  Das andere Projekt "app_recorder" nicht anfassen.
- Termin-Import, Todo-Endtermine und Todo-Bearbeiter sind auf master.
- Migration 013 ist NOCH NICHT auf der Live-DB. Der Supabase-MCP fragt bei apply_migration
  eine Bestätigung ab, die bisher ohne Antwort abgelaufen ist. Also: entweder der Nutzer
  führt die SQL im Supabase-SQL-Editor aus (Datei supabase/migrations/013_close_family_registration.sql),
  oder er bestätigt die Abfrage live.

Nächste Schritte (in dieser Reihenfolge):
1. PR #4 prüfen und mergen, falls der Nutzer es will. Danach ist master die Produktionsquelle.
2. Lint-Fehler beheben: ecosystem.config.cjs nutzt require(), das blockiert die CI-Lint-Stufe
   (auf master schon vorhanden, nicht durch den PR verursacht).
3. Migration 013 einspielen (siehe oben), danach Supabase get_advisors (security) laufen lassen.
   Erwartet bleiben: keep_alive ohne Policy (gehört nicht zu dieser App, nicht anfassen),
   Leaked-Password-Schutz (nur Pro-Plan). Die Warnungen zu check_invite_valid/accept_invite
   sollten mit der Migration verschwinden.
4. Supabase Dashboard (Nutzer selbst): Authentication > Sign In / Providers > "Allow new users
   to sign up" aus. Ohne das bleibt die API für Fremde offen für Registrierung.
5. Vercel: neues Projekt im Team "chincherpa's projects" (team_DGyGvj7sjIGZnN5qJKZKIboi),
   verknüpft mit chincherpa/plan_my_family, Production-Branch master. Es gibt dort noch kein
   Familienplaner-Projekt. Env-Variablen:
   - NEXT_PUBLIC_SUPABASE_URL = https://gciyahpatcawiyhbwvkq.supabase.co
   - NEXT_PUBLIC_SUPABASE_ANON_KEY = den legacy "anon"-Key aus get_publishable_keys
     (die App nutzt @supabase/ssr mit dem anon-Key)
6. Supabase Authentication > URL Configuration: Site URL und Redirect URLs auf die
   Vercel-Domain setzen (muss der Nutzer im Dashboard machen).
7. Erste Logins anlegen laut docs/konten.md (Dashboard + SQL-Editor, Nutzer macht das selbst).
8. Entscheiden, was mit dem Pi passiert (weiterlaufen lassen oder abschalten). Die Daten
   liegen in Supabase, nicht auf dem Pi.

Regeln:
- Keine Schreibaktion auf der Live-DB ohne ausdrückliche Bestätigung des Nutzers.
- Keine Commits auf master direkt, Änderungen über den Branch und PR.
- Attribution in Commits wie gehabt, PR-Beschreibungen mit dem Claude-Code-Footer.
