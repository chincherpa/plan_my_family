# Invite-Funktion für Familienmitglieder

Datum: 2026-07-02

## Problem

`family_members` unterstützt bereits `user_id`, aber es gibt keinen Weg, einen neuen Auth-User zu einer bestehenden Familie hinzuzufügen. Mitglieder, die aktuell über "Mitglied hinzufügen" angelegt werden, haben nie einen `user_id` und können sich nicht selbst einloggen.

## Ziel

Ein Familienmitglied (Guardian oder nicht — kein Rollen-Gate in dieser Version) kann einen Einladungslink erzeugen. Ein neuer User öffnet den Link, registriert sich (oder loggt sich ein), und wird dadurch automatisch als neues Mitglied der bestehenden Familie angelegt (`family_members.user_id` gesetzt).

## Bestehende Sicherheitslücke (wird mit behoben)

Aktuelle `members_insert`-Policy:
```sql
(user_id = auth.uid()) OR (family_id IN (select get_my_family_ids()))
```
Der erste Zweig hat keine Einschränkung auf `family_id` — jeder eingeloggte User kann sich per bekannter `family_id` (UUID) selbst in eine beliebige fremde Familie eintragen. Wird durch diesen Feature-Umbau geschlossen (siehe unten).

## Datenmodell

Neue Tabelle `family_invites`:

```sql
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
```

Kein öffentliches SELECT — Code-Validierung läuft ausschließlich über RPC-Funktionen (unten), nicht per direkter Tabellenabfrage. So bleiben andere Familien-IDs/Namen für nicht-Mitglieder unsichtbar.

`code`: 8-stelliger URL-safe String, client-seitig generiert (`crypto.randomUUID().replace(/-/g, "").slice(0, 8)`), `unique`-Constraint fängt Kollisionen ab (bei Fehler erneut generieren + retry).

## RPC-Funktionen (SECURITY DEFINER)

**`check_invite_valid(invite_code text) returns boolean`**
Für die `/join`-Seite vor Login — prüft nur, ob Code existiert/nicht abgelaufen/nicht benutzt, ohne Details preiszugeben.
```sql
create or replace function check_invite_valid(invite_code text)
returns boolean
language sql security definer set search_path = public as $$
  select exists (
    select 1 from family_invites
    where code = invite_code and used_at is null and expires_at > now()
  );
$$;
grant execute on function check_invite_valid(text) to anon, authenticated;
```

**`accept_invite(invite_code text, member_name text, member_color text) returns family_members`**
Nach Login/Signup aufgerufen. Validiert Code, legt Mitglied an, markiert Code als verbraucht — atomar via `for update` gegen Race Conditions bei gleichzeitiger Mehrfachnutzung.
```sql
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
```

Beide Funktionen laufen mit erhöhten Rechten und umgehen dadurch gezielt RLS auf `family_members`/`family_invites` — das ist beabsichtigt, da sie die einzigen kontrollierten Einstiegspunkte für Fremd-Familien-Beitritt sind.

## Security-Fix: `members_insert` Policy verschärfen

```sql
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
```

Self-Insert bleibt nur beim Bootstrap einer **brandneuen, leeren** Familie erlaubt (Registrierungs-Flow in [register/page.tsx](../../../src/app/(auth)/register/page.tsx) unverändert funktionsfähig). Self-Join in eine bereits bestehende Familie ist danach nur noch über `accept_invite()` möglich, nicht mehr per rohem Insert.

## UI — Invite erstellen

In [MembersSettings.tsx](../../../src/components/settings/MembersSettings.tsx):
- Neuer Button "Einladen" (Icon `UserPlus`) neben "Mitglied hinzufügen"
- Dialog: generiert Code, insert in `family_invites`, zeigt Link `{window.location.origin}/join?code=XXXX` in read-only Input mit Kopier-Button (Clipboard API)
- Liste aktiver Invites (nicht abgelaufen, nicht benutzt) darunter, mit "Widerrufen"-Button (`update family_invites set expires_at = now()`)

## UI — Invite annehmen

Neue Seite `src/app/(auth)/join/page.tsx`, liest `?code=` aus URL:

1. Beim Laden: `check_invite_valid(code)` aufrufen
   - `false` → Meldung "Dieser Einladungslink ist ungültig oder abgelaufen", kein Formular
   - `true` → weiter
2. Prüfen ob User bereits eingeloggt ist (`supabase.auth.getUser()`)
   - Eingeloggt UND bereits Mitglied einer Familie → Meldung "Du bist bereits Mitglied einer Familie", kein Auto-Join (ein User = eine Familie)
   - Eingeloggt, aber noch in keiner Familie (Edge Case, aktuell praktisch nicht erreichbar) → direkt `accept_invite()` aufrufen
   - Nicht eingeloggt → Formular: Name (für `family_members.name`), E-Mail, Passwort — analog zu [register/page.tsx](../../../src/app/(auth)/register/page.tsx), aber ohne Familienname-Feld
3. Nach erfolgreichem Signup/Signin: `supabase.rpc("accept_invite", { invite_code: code, member_name: name, member_color: <nächste freie Preset-Farbe> })`
4. Erfolg → `router.push("/calendar")`
5. Fehler (`invite_invalid` — z. B. Code wurde in der Zwischenzeit von jemand anderem benutzt) → Fehlermeldung, kein Absturz

## Migration

Neue Datei `supabase/migrations/005_family_invites.sql` mit: Tabelle, RLS-Policies, beide Funktionen, Policy-Fix für `members_insert`.

## Out of Scope

- E-Mail-Versand (Link wird manuell geteilt)
- Rollen-Gate (aktuell kann jedes Mitglied einladen, nicht nur Guardians)
- Mehrfach-Familien pro User
- Bestehendes (nicht-verknüpftes) Mitglied per Invite claimen — jeder Invite erstellt immer ein neues Mitglied
