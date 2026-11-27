-- RPCs nur für angemeldete Nutzer.
--
-- 009/019/023 haben jeweils `revoke execute ... from public` gemacht. Supabase
-- vergibt EXECUTE an anon aber zusätzlich direkt über Default Privileges im
-- Schema public, daher blieb die Funktion für nicht angemeldete Aufrufer offen.
-- Die Funktionen laufen zwar als Aufrufer (kein security definer), RLS greift
-- also — trotzdem gibt es keinen Grund, sie anon anzubieten.
--
-- Bewusst NICHT entzogen:
--   get_my_family_ids()  — wird in den RLS-Policies aufgerufen, die für alle
--                          Rollen gelten; ohne EXECUTE würden anon-Abfragen mit
--                          einem Fehler statt mit einem leeren Ergebnis enden.
--   Trigger-/Event-Trigger-Funktionen — nicht direkt per RPC aufrufbar.

revoke execute on function save_appointment_with_participants(jsonb, jsonb, uuid) from anon;
revoke execute on function reorder_family_members(uuid[]) from anon;

-- Künftige Funktionen aus Migrationen nicht mehr automatisch für anon freigeben.
-- Wer eine Funktion für anon braucht, muss sie nun explizit granten.
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, public;
