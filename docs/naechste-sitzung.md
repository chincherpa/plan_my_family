# Nächste Sitzung: Befunde aus dem Code-Review beheben

Kontext: Familienplaner (Next.js 16 + Supabase), Repo chincherpa/plan_my_family.
Grundlage ist `CODE_REVIEW.md` im Repo-Root (Stand 2026-11-09, Basis `c58d968`). Die
Befundnummern unten beziehen sich darauf.

Stand:
- `CODE_REVIEW.md` und dieser Plan liegen auf dem Branch `ccr-63f8bf9a-z97i0b`. Der Branch
  ist gepusht, aber nicht gemergt; es gibt keinen PR dazu.
- Lint, Typecheck und 222 Tests sind auf `c58d968` grün. `pnpm build` wurde nicht geprüft.
- Am Code wurde noch nichts geändert.

Ziel der Sitzung: Befunde 1–5, 7 und 8. Befund 6 und die Punkte aus Abschnitt 9 nur,
wenn Zeit bleibt (siehe „Danach").

Reihenfolge: Schritte 1–3 gehören zusammen und kommen zuerst. Die übrigen sind
unabhängig voneinander. Pro Schritt ein Commit.

---

## Schritt 1: Gemeinsamer Anker für Serienregeln (Befund 1)

Ursache: `buildRRule` in `src/components/appointments/AppointmentForm.tsx:404` setzt
`dtstart` auf den echten Start. Bei ganztägigen Terminen liegt der in UTC am Vortag.

1. `ruleAnchor` (lokaler Mittag des Starttags) aus
   `src/lib/import/appointmentImport.ts:503` nach `src/lib/utils/recurrence.ts`
   verschieben und exportieren. Den erklärenden Kommentar mitnehmen. Der Import
   importiert die Funktion von dort.
2. Neue reine Funktion in `src/lib/utils/recurrence.ts`, z. B.
   `buildRecurrenceRule({ freq, start, end })` mit
   `end = { mode: "count", count } | { mode: "until", date } | { mode: "none" }`.
   Sie übernimmt die Logik von `buildRRule` und verwendet `ruleAnchor(start)`.
   Für `yearly` am 29. Februar ergänzt sie `bymonth: 2, bymonthday: -1`
   (wie `src/lib/anniversaries.ts:253`).
3. `AppointmentForm.tsx`: `buildRRule` wird zu einem dünnen Aufruf dieser Funktion.
   Betroffen sind die Aufrufe in Zeile 527, 549 und 599.
4. `isFirstOccurrence` (`AppointmentForm.tsx:289`) über das lokale Datum bestimmen:
   `rule.before(startOfDay(formOccurrenceStart), false)` statt des exakten Zeitpunkts.
   Sonst gilt bei Mittags-Anker der erste Termin einer Nachmittagsserie nicht als erster.
5. Tests in `src/lib/utils/recurrence.test.ts`, jeweils Regel bauen und mit
   `expandAppointments` prüfen. Das sind die reproduzierten Fälle aus dem Review:
   - ganztägig wöchentlich sonntags ab 05.07.2026 → im November weiter sonntags
   - ganztägig „Wochenende" ab Sa 14.11.2026 → Sa + So, erster Samstag enthalten
   - ganztägig monatlich am 1. ab 01.11.2026 → zwölf Monatserste in Folge
   - ganztägig jährlich am 1. März ab 2028 → 2028 bis 2033 jedes Jahr
   - ganztägig täglich, 10 Termine ab 20.10.2026 → 20.–29.10., kein doppelter Tag
   - jährlich am 29.02. → in Nicht-Schaltjahren am 28.02.
   - werktags 08:00 → unverändert Mo–Fr (Kontrolle)
   - erster Termin einer Serie um 18:00 wird als erster erkannt

## Schritt 2: Jahrestage überstehen das Kalenderformular (Befund 2)

Mit Schritt 1 weitgehend erledigt, weil „Alle" speichern die Regel jetzt korrekt
neu baut. Zusätzlich:

1. `anniversaryRecord` (`src/lib/anniversaries.ts:246`) auf die gemeinsame Funktion
   umstellen, damit es nur noch einen Regel-Erzeuger gibt. Die vorhandenen Tests in
   `src/lib/anniversaries.test.ts` müssen grün bleiben; sie vergleichen eventuell den
   Regeltext und sind dann anzupassen.
2. Test: Jahrestag am 29.02. und am 01.03. (Platzhalterjahr 2000) anlegen, Regel wie
   bei „Alle" im Formular neu bauen, über sechs Jahre expandieren → jedes Jahr ein Termin.

## Schritt 3: Vorhandene Serien in der Datenbank korrigieren (Befund 1 und 2)

Neue Migration `supabase/migrations/019_reanchor_recurrence_rules.sql`. Sie ersetzt in
jeder gespeicherten Regel die `DTSTART`-Zeile durch das lokale Datum von `start_time`
um 12:00 UTC. Skizze:

```sql
update appointments
set recurrence_rule = regexp_replace(
  recurrence_rule,
  '^DTSTART:[0-9TZ]+',
  'DTSTART:' || to_char(start_time at time zone 'Europe/Berlin', 'YYYYMMDD') || 'T120000Z'
)
where recurrence_rule like 'DTSTART:%';
```

Vorher lesend prüfen (Supabase-MCP `execute_sql`, nur `select`):

- Wie viele Zeilen haben eine Regel, wie viele davon ohne `DTSTART:`-Zeile am Anfang?
  Letztere erfasst das Update nicht; je nach Anzahl von Hand behandeln.
- Welche Jahrestage (`anniversary_kind is not null`) haben eine Regel ohne `T120000Z`?
  Das sind die durch das Formular beschädigten. Für sie zusätzlich die Regel komplett
  neu setzen: `FREQ=YEARLY`, bei Datum 29.02. mit `;BYMONTH=2;BYMONTHDAY=-1`.
- Vorher/nachher für alle betroffenen Zeilen ausgeben und dem Nutzer zeigen.

Hinweis für die Kontrolle: Serien mit `COUNT` enden nach der Korrektur teils einen
Termin früher oder später als bisher angezeigt, weil vorher ein Tag doppelt oder der
erste Termin gar nicht gezählt wurde. Das ist die Korrektur, kein neuer Fehler.

Die Zeitzone `Europe/Berlin` ist fest eingetragen. Das passt zur App (eine Familie,
Tests pinnen dieselbe Zone) und gehört als Kommentar in die Migration.

## Schritt 4: Mitglied mit Login nicht löschbar (Befund 3)

1. `src/components/settings/MembersSettings.tsx`: Löschen-Button (Zeile 87) nur
   anzeigen, wenn `member.user_id` leer ist. Stattdessen ein kurzer Hinweis
   „Login-Konto". `handleDelete` (Zeile 170) bricht für solche Mitglieder ebenfalls ab.
2. Migration `020_protect_login_member.sql`:
   ```sql
   drop policy members_delete on family_members;
   create policy members_delete on family_members
     for delete using (family_id in (select get_my_family_ids()) and user_id is null);
   ```
3. `docs/konten.md` ergänzen: Ein Mitglied mit Login wird erst nach dem Entfernen des
   Logins löschbar (`user_id` im SQL-Editor auf `null`).

## Schritt 5: Essensplan schreibt nur den geänderten Slot (Befund 4)

1. `src/lib/meals/saveMealSlot.ts`: Parameter `existing` entfernen. Das Upsert-Objekt
   enthält nur `family_id`, `date` und die eine Spalte (`lunch` oder `dinner`). Bei
   einem Konflikt aktualisiert PostgREST nur die übergebenen Spalten.
2. Aufrufer anpassen: `src/components/meals/PlanDishDialog.tsx:47` und
   `src/components/meals/DishEditor.tsx:275` (dort entfällt auch die Suche nach
   `existing` in Zeile 274).
3. `src/components/calendar/MealEditDialog.tsx:136`: Nur die Slots schreiben, die sich
   gegenüber dem Stand beim Öffnen geändert haben. Hat sich nichts geändert, nur
   schließen.
4. Prüfen, ob `Database["public"]["Tables"]["meals"]["Insert"]` `lunch` und `dinner`
   als optional führt; sonst den Typ in `src/lib/supabase/types.ts` korrigieren.

Das Verhalten von PostgREST bei Teil-Upserts in Schritt 1 gegen die Supabase-Doku
gegenprüfen, bevor darauf gebaut wird.

## Schritt 6: Kalender rechnet nicht mehr jede Minute neu (Befund 5)

1. `src/components/calendar/CalendarView.tsx:95`: `today` stabil halten.
   ```ts
   const todayMs = startOfDay(now).getTime();
   const today = useMemo(() => new Date(todayMs), [todayMs]);
   ```
2. `src/lib/utils/recurrence.ts:85`: Ausnahmen einmal vor der Schleife nach
   `recurrence_parent_id` in eine `Map` gruppieren, statt pro Termin die ganze Liste zu
   filtern. Die vorhandene `exceptions`-Map (Zeile 36) daneben beibehalten oder mit
   der neuen zusammenlegen.
3. Kein neuer Test nötig; die bestehenden Tests in `recurrence.test.ts` decken das
   Verhalten ab.

## Schritt 7: Serientermine über Mitternacht (Befund 7)

1. `expandAppointments` (`src/lib/utils/recurrence.ts:57`): Suchbeginn auf
   `rangeStart − Dauer − travel_after_min` vorziehen. Danach nur Vorkommen behalten,
   die den Bereich überlappen (wie bei Einzelterminen in Zeile 79).
2. Aufrufer prüfen: `CalendarView.tsx:126` und `conflicts.ts:75` filtern selbst nach
   Überlappung, zusätzliche Vorkommen stören dort nicht.
3. Tests: tägliche Serie 22:00–06:00, Bereich = Folgetag → zwei Vorkommen.
   In `conflicts.test.ts`: neuer Termin um 05:00 mit demselben Fahrzeug wie die
   Nachtfahrt vom Vorabend → Konflikt.

## Schritt 8: Fehler sichtbar machen (Befund 8)

- `CalendarView.tsx:222` (`handleDragEnd`): `error` auswerten und eine kurze Meldung
  zeigen. Es gibt noch keinen globalen Toast; ein lokaler State mit Banner im
  Kalenderkopf reicht.
- `src/components/todos/TodoSheet.tsx:46`, `TodoCard.tsx`, `TodoItemRow.tsx`: Fehler
  in einem State halten und in der Seitenleiste anzeigen. Im selben Zug in
  `handleAddTodo` einen `saving`-Schutz gegen doppeltes Enter einbauen.
- `src/components/meals/ShoppingListDialog.tsx:60`: `.catch` ergänzen, das
  `setError` setzt.
- `src/app/(auth)/login/actions.ts:19`: Nur bei `invalid_credentials` „Passwort ist
  falsch" melden, sonst „Anmeldung derzeit nicht möglich".
- Rohe `error.message` in `AppointmentForm.tsx`, `MembersSettings.tsx`,
  `VehiclesSettings.tsx` und `saveImport.ts` durch deutsche Meldungen ersetzen und das
  Original per `console.error` loggen.

---

## Abschluss der Sitzung

1. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`
   (für den Build die Platzhalter-Variablen aus `.github/workflows/ci.yml` setzen).
2. App starten und im Browser prüfen: ganztägige Wochenserie anlegen und im Kalender
   mehrere Wochen weit kontrollieren; einen Jahrestag im Kalenderformular mit „Alle"
   speichern; Essen in zwei Fenstern für denselben Tag eintragen.
3. `CODE_REVIEW.md` aktualisieren: erledigte Befunde markieren.
4. `ANALYSE.md` ist veraltet (Stand August). Löschen oder durch einen Verweis auf
   `CODE_REVIEW.md` ersetzen und den Verweis in der README anpassen.
5. PR nur auf Wunsch des Nutzers.

## Danach (nicht für diese Sitzung eingeplant)

- **Befund 6, Familien-DB:** „Dieser & folgende" als eine Postgres-Funktion
  (neue Serie anlegen, Ausnahmen löschen, alte Serie kürzen).
- **Befund 6, Rezepte-DB:** Zutaten und Kategorien transaktional speichern,
  Unique-Index auf `lower(name)`. Das Schema liegt im Supabase-Projekt der
  Rezepte-App und nicht in diesem Repo.
- **Abschnitt 9 des Reviews:** Drag eines „Alle"-Termins in eine Mitgliedsspalte,
  verwaiste Ausnahmen beim Abschalten einer Serie, `families` in Realtime aufnehmen,
  Wochentags-Kategorien beim Umbenennen nachziehen, Fokusfalle in der Todo-Leiste.

## Offene Entscheidungen für den Nutzer

1. **Migration 019 auf der Live-DB:** Sie ändert bestehende Termine. Freigabe erst
   nach Sichtung der Vorher/Nachher-Liste aus Schritt 3.
2. **Rezepte-DB:** Sollen dort Funktionen und ein Index angelegt werden, obwohl das
   Schema zur Rezepte-App gehört? Ohne Freigabe bleibt dieser Teil von Befund 6 offen.

## Regeln

- Keine Schreibaktion auf der Live-DB ohne ausdrückliche Bestätigung des Nutzers.
  Das gilt für die Migrationen 019 und 020.
- Supabase-Projekt des Planers: „family planner Project", Ref `gciyahpatcawiyhbwvkq`.
  Das Projekt „app_recorder" nicht anfassen.
- Keine Commits direkt auf master, Änderungen über Branch und PR.
- Attribution in Commits wie gehabt, PR-Beschreibungen mit dem Claude-Code-Footer.
