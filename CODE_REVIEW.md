# Code-Review: plan_my_family

Stand: 2026-11-09 · Basis: `c58d968` (master) · Umfang: gesamtes Repository

## Ergebnis

Der Code ist in gutem Zustand: Lint, Typecheck und alle 222 Tests laufen grün, die
Fachlogik liegt sauber getrennt und getestet in `src/lib/`, RLS und Server Actions sind
durchdacht abgesichert.

Der wichtigste Befund ist ein Fehler bei **ganztägigen Serienterminen, die im
Terminformular angelegt werden**: Sie erscheinen je nach Regel am falschen Tag oder
fallen ganz aus (Befunde 1 und 2). Import und Jahrestage umgehen das Problem bereits
korrekt, das Formular nicht.

| # | Schwere | Befund |
|---|---|---|
| 1 | hoch | Ganztägige Serien aus dem Formular: falscher Tag, fehlende Termine |
| 2 | hoch | Jahrestag im Kalenderformular mit „Alle" speichern zerstört dessen Regel |
| 3 | mittel | Mitglied mit Login lässt sich löschen → App für alle gesperrt |
| 4 | mittel | Essensplan: gleichzeitige Änderungen überschreiben sich |
| 5 | mittel | Kalender rechnet jede Minute alles neu |
| 6 | mittel | Mehrstufige Schreibvorgänge ohne Transaktion |
| 7 | niedrig | Über Mitternacht laufende Serientermine fehlen am Folgetag |
| 8 | niedrig | Fehler werden an mehreren Stellen verschluckt |
| 9 | niedrig | Kleinere Punkte (Liste unten) |

Geprüft habe ich durch Lesen des Codes und der Migrationen sowie mit `pnpm lint`,
`pnpm typecheck` und `pnpm test`. Befunde 1, 2 und 7 habe ich zusätzlich mit einem
Wegwerf-Test gegen `expandAppointments` reproduziert (TZ=Europe/Berlin). Die App selbst
habe ich nicht gegen eine Datenbank laufen lassen; `pnpm build` habe ich nicht ausgeführt.

---

## 1. Ganztägige Serien aus dem Formular landen am falschen Tag (hoch) — ✅ erledigt

`src/components/appointments/AppointmentForm.tsx:404` (`buildRRule`) setzt `dtstart` auf
den echten Startzeitpunkt. Bei ganztägigen Terminen ist das lokale Mitternacht, also
22:00 oder 23:00 UTC **des Vortags**. `rrule` rechnet Wochentag, Monatstag und Jahrestag
in UTC, `expandAppointments` (`src/lib/utils/recurrence.ts:57`) übersetzt die Treffer
danach in lokale Tage.

Reproduziert:

| Serie (ganztägig, im Formular angelegt) | Erwartet | Tatsächlich |
|---|---|---|
| Wöchentlich sonntags, angelegt im Juli | jeden Sonntag | ab Ende Oktober **samstags** (31.10., 07.11., …) |
| „Wochenende", Start Sa 14.11. | Sa + So | **So + Mo**; der erste Samstag fehlt |
| Monatlich am 1., Start 01.11.2026 | jeden Monatsersten | nur 7 von 12; es fehlen 1.12., 1.3., 1.5., 1.7., 1.10. |
| Jährlich am 1. März, Start 2028 | jedes Jahr | **nur in Schaltjahren** (2028, 2032) |
| Täglich, 10 Termine ab 20.10. | 20.–29.10. | 25.10. doppelt, Serie endet am 28.10. |

Betroffen sind alle Serien, deren lokale Startzeit vor 01:00 (Winterzeit) bzw. 02:00
(Sommerzeit) liegt. Praktisch sind das alle ganztägigen Serien. Termine mit normaler
Uhrzeit sind nicht betroffen (Kontrolle „werktags 08:00" war korrekt).

Die Lösung existiert im Projekt schon zweimal: Der Import verankert die Regel am lokalen
Mittag (`ruleAnchor`, `src/lib/import/appointmentImport.ts:503`), die Jahrestage an
12:00 UTC (`src/lib/anniversaries.ts:252`). Nur das Formular tut es nicht.

**Empfehlung:** `ruleAnchor` nach `src/lib/utils/recurrence.ts` verschieben und in allen
drei Regel-Erzeugern verwenden. `buildRRule` aus der Komponente in eine testbare Funktion
ziehen; dass genau dieser Pfad ungetestet ist, hat den Fehler ermöglicht. Bereits
gespeicherte Serien brauchen eine einmalige Korrektur ihrer `recurrence_rule`.

Folge für die Umsetzung: Mit Mittags-Anker liefert `rule.before(formOccurrenceStart)`
(`AppointmentForm.tsx:292`) für Termine nach 12:00 den Anker desselben Tages. Dann gilt
das erste Vorkommen nicht mehr als erstes. Das trifft heute schon importierte Serien mit
Nachmittagsterminen: Dort wird „Dieser & folgende" am ersten Termin angeboten und
hinterlässt eine leere Alt-Serie. Der Vergleich sollte über das lokale Datum laufen, wie
es Zeile 542–545 bereits tut.

## 2. Jahrestag im Kalenderformular speichern zerstört seine Regel (hoch) — ✅ erledigt

Migration 016 verspricht, dass ein Jahrestag beim Bearbeiten im Kalenderformular
erhalten bleibt. Für die Spalten stimmt das. Die Regel aber wird bei „Alle" neu gebaut
(`AppointmentForm.tsx:599`), mit dem Fehler aus Befund 1:

- Ein Jahrestag am 29. Februar verliert `BYMONTH=2;BYMONTHDAY=-1` und erscheint nur noch
  in Schaltjahren.
- Ein Jahrestag am 1. März mit Schaltjahr als Ursprungsjahr erscheint ebenfalls nur noch
  in Schaltjahren. Das betrifft auch jeden 1.-März-Jahrestag ohne bekanntes Jahr, weil
  das Platzhalterjahr 2000 ein Schaltjahr ist.

**Empfehlung:** Mit Befund 1 erledigt, wenn der gemeinsame Anker verwendet wird und der
Sonderfall 29.2. erhalten bleibt. Einfacher: Für Termine mit `anniversary_kind` im
Kalenderformular auf die Jahrestage-Seite verweisen, statt die Regel anzufassen.

## 3. Mitglied mit Login lässt sich löschen (mittel) — ✅ erledigt

`src/components/settings/MembersSettings.tsx:170` löscht jedes Mitglied nach einer
einfachen Rückfrage. Hängt daran das gemeinsame Familien-Login (`user_id`), findet
`AppShell` danach kein Mitglied mehr und zeigt nur noch „Daten konnten nicht geladen
werden". Die Server Actions der Rezepte lehnen ebenfalls ab. Reparieren lässt sich das
nur im SQL-Editor (`docs/konten.md`).

**Empfehlung:** Löschen-Button für Mitglieder mit `user_id` ausblenden und in der
Datenbank absichern, z. B. `members_delete` nur für Zeilen mit `user_id is null`.

## 4. Essensplan: gleichzeitige Änderungen überschreiben sich (mittel) — ✅ erledigt

Eine Zeile in `meals` enthält Mittag und Abend. Beide Schreibpfade schicken immer beide
Felder aus dem lokalen Stand:

- `src/lib/meals/saveMealSlot.ts:13` nimmt den anderen Slot aus dem Client-Store.
- `src/components/calendar/MealEditDialog.tsx:136` schreibt den Stand vom Öffnen des
  Dialogs.

Trägt jemand am Handy das Abendessen ein, während am Tablet der Dialog für denselben Tag
offen ist, löscht das Speichern am Tablet den Eintrag wieder.

**Empfehlung:** Nur die geänderte Spalte schreiben. Ein `upsert`, dessen Objekt nur
`family_id`, `date` und den einen Slot enthält, lässt die andere Spalte bei einem
Konflikt unverändert.

## 5. Kalender rechnet jede Minute alles neu (mittel) — ✅ erledigt

`src/components/calendar/CalendarView.tsx:95`: `today` hängt an `now`, und `now` ist
jede Minute ein neues `Date`. Damit ändern sich `rangeStart` und `rangeEnd`, und die
ganze Kette läuft neu: Serien expandieren, Aufsichtsprüfung in 30-Minuten-Schritten über
den ganzen Bereich, Fahrzeugkonflikte, `buildDayData` für bis zu 365 Tage.

Dazu kommt `src/lib/utils/recurrence.ts:85`: Für jeden Termin wird die gesamte Liste
nach Ausnahmen durchsucht, also quadratisch. Der Import erlaubt bis zu 2000 Zeilen.

Auf dem Raspberry Pi bzw. einem Wand-Tablet ist das unnötige Dauerlast.

**Empfehlung:** `today` über den Zeitwert stabilisieren, z. B.
`const todayMs = startOfDay(now).getTime()` als Abhängigkeit. Ausnahmen einmal vorab
nach `recurrence_parent_id` gruppieren.

Verwandt, aber bei Familiengröße unkritisch: `AppShell` lädt alle Termine und Mahlzeiten
ohne Zeitgrenze und holt bei jedem Realtime-Ereignis alle sechs Tabellen neu
(`src/components/AppShell.tsx:54`).

## 6. Mehrstufige Schreibvorgänge ohne Transaktion (mittel) — ⏳ offen

Mehrere Abläufe bestehen aus einzelnen Anfragen. Bricht einer mittendrin ab, bleibt ein
Zwischenstand stehen:

- `saveIngredients` (`src/lib/recipes/actions.ts:145`): löschen, dann jede Zeile
  einzeln aktualisieren oder anlegen.
- `updateCategory` und `deleteCategory` (`actions.ts:236`, `:264`): Kategorie ändern,
  danach die Rezepte nachziehen. Scheitert der zweite Schritt, zeigen Rezepte auf einen
  Kategorienamen, den es nicht mehr gibt.
- „Dieser & folgende" (`AppointmentForm.tsx:441`, `:548`): neue Serie anlegen,
  Ausnahmen löschen, alte Serie kürzen, im Fehlerfall per Löschen zurückrollen.
- `saveRecipe` (`actions.ts:78`): Die Dublettenprüfung lädt alle Rezepte und prüft im
  Speicher. Zwei gleichzeitige Anlagen kommen beide durch.

**Empfehlung:** Je eine Postgres-Funktion, wie es `save_appointment_with_participants`
schon vormacht. Für Rezeptnamen ein Unique-Index auf `lower(name)`.

## 7. Über Mitternacht laufende Serientermine fehlen am Folgetag (niedrig) — ✅ erledigt

`rule.between(rangeStart, rangeEnd)` (`recurrence.ts:57`) findet nur Vorkommen, die im
Bereich **beginnen**. Einzeltermine werden dagegen auf Überlappung geprüft (Zeile 79).
Reproduziert: Eine tägliche Serie 22:00–06:00 liefert für den Bereich „10.11." nur den
Termin, der am 10.11. um 22:00 beginnt; der Teil von 00:00 bis 06:00 fehlt.

Der Kalender merkt davon nichts, weil sein Bereich einen Tag früher beginnt.
`checkVehicleConflict` (`src/lib/utils/conflicts.ts:72`) startet aber genau am Tag des
neuen Termins und übersieht so eine Nachtfahrt vom Vorabend.

**Empfehlung:** In `expandAppointments` den Suchbeginn um die Termindauer (plus
Rückfahrt) nach vorn ziehen und anschließend auf Überlappung filtern.

## 8. Fehler werden verschluckt (niedrig) — ✅ erledigt

- Drag & Drop (`CalendarView.tsx:222`): Schlägt das Update fehl, springt der Termin
  kommentarlos zurück.
- Todos (`src/components/todos/TodoSheet.tsx:46`, `TodoCard.tsx`, `TodoItemRow.tsx`):
  Fehler gehen nur in die Konsole.
- `ShoppingListDialog.tsx:60`: `listIngredientsFor(...)` ohne `catch`. Bei einem
  Netzwerkfehler bleibt die Ladeanzeige stehen.
- Login (`src/app/(auth)/login/actions.ts:19`): Jeder Fehler wird zu „Passwort ist
  falsch", auch ein Ausfall oder das Rate-Limit von Supabase.
- Umgekehrt zeigen Formular, Import und Einstellungen `error.message` von Postgres roh
  an (englisch, technisch).

## 9. Kleinere Punkte

- **Drag auf andere Spalte:** Zieht man einen „Alle"-Termin in eine Mitgliedsspalte,
  wird `owner_id` gesetzt, `is_all_family` bleibt `true` (`CalendarView.tsx:228`). Das
  Formular schreibt in diesem Fall `owner_id = null`.
- **Serie auf „keine Wiederholung" umstellen:** Ausnahme-Zeilen bleiben stehen und
  werden weiter angezeigt.
- **Fahrzeugprüfung im Formular** betrachtet nur das erste Vorkommen einer neuen Serie.
  Spätere Kollisionen zeigt erst das Banner, und nur für 14 Tage.
- **Kategorie umbenennen oder löschen** zieht `families.meal_weekday_categories` nicht
  nach; die Wochentags-Vorauswahl entfällt dann stillschweigend.
- **Einkaufszettel:** Ein Haken gilt pro Zutat und Woche. Kommt später ein weiteres
  Gericht mit derselben Zutat dazu, bleibt die Zeile abgehakt, obwohl mehr gebraucht
  wird. Der Kommentar in Migration 018 beschreibt außerdem noch das alte Schlüsselformat
  (`<gericht>|<zutat>` statt `z|<zutat>`).
- **Realtime:** `families` ist nicht abonniert. Geänderte Kalenderzeiten oder
  Wochentags-Kategorien erscheinen auf anderen Geräten erst nach dem Neuladen.
- **Aufsichtsprüfung:** Ein eigener Termin des Kindes zählt für den ganzen
  30-Minuten-Slot als Aufsicht, auch wenn er nur zehn Minuten davon abdeckt.
- **Service-Role-Key der Rezepte-DB:** Die App braucht drei Tabellen, hält aber
  Vollzugriff auf das ganze Projekt. Eine eigene Rolle oder Schreib-Policies für einen
  dedizierten Nutzer wären enger. Der Variablenname
  `RECIPES_NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` ist sicher (Next.js bettet nur das
  Präfix `NEXT_PUBLIC_` ein), aber irreführend.
- **Login:** Ein einzelnes geteiltes Passwort ohne eigene Bremse in der App. Der Schutz
  hängt an der Passwortstärke und an den Supabase-Limits; die greifen pro IP des Servers,
  nicht pro Besucher.
- **Zeitzone:** Ganztägige Termine werden als lokale Mitternacht gespeichert. Ein Gerät
  in einer anderen Zeitzone sieht sie verschoben. Für eine Familie an einem Ort
  vertretbar, sollte aber dokumentiert sein.
- **Todo-Seitenleiste:** Eigenes Overlay ohne Fokusfalle und ohne `role="dialog"`,
  anders als die Radix-Dialoge im Rest der App. Doppeltes Enter legt ein Todo doppelt an.
- **`handleDelete` der ganzen Serie** (`AppointmentForm.tsx:696`) löscht die Ausnahmen
  von Hand und prüft den Fehler nicht. Der Fremdschlüssel aus Migration 009 erledigt das
  per `on delete cascade` ohnehin.
- **`ANALYSE.md` ist veraltet** (Stand August: „Projekt kompiliert nicht"). Die README
  verweist darauf als aktuelle Liste offener Punkte.

---

## Was gut gelöst ist

- **Trennung:** Fachlogik (Serien, Konflikte, Aufsicht, Import, Einkaufszettel) ist
  frei von React und Supabase und mit 222 Tests abgedeckt. Die Tests pinnen die Zeitzone.
- **Datenbank:** RLS auf jeder Tabelle, `get_my_family_ids()` mit festem `search_path`,
  `EXECUTE` gezielt vergeben, zusammengesetzte Fremdschlüssel gegen familienübergreifende
  Verweise, Trigger gegen Identitätswechsel. Die Migrationen begründen ihre
  Entscheidungen.
- **Rezepte-Anbindung:** `server-only`, jede Server Action prüft die
  Familienzugehörigkeit, Änderungen an Zutaten sind auf `recipe_id` eingeschränkt.
- **Laden und Realtime:** Versionszähler gegen überholte Antworten, Entprellen von
  Ereignis-Bursts, Rückfall auf Neuladen bei unvollständigen DELETE-Payloads.
- **Import:** Eigener CSV-Parser nach RFC 4180 mit Größen- und Zeilenlimits, klare
  Fehlermeldungen pro Zeile, Dublettenerkennung, Teilerfolge werden ausgewiesen.
- **CI:** Lint, Typecheck, Tests, Build und eine Prüfung auf Konfliktmarker.

## Empfohlene Reihenfolge

1. Befund 1 und 2 gemeinsam beheben, mit Tests für `buildRRule` und einer Korrektur der
   vorhandenen Serien.
2. Befund 3 (zwei Zeilen im Client, eine Policy).
3. Befund 4 und 5 (jeweils kleine, lokale Änderungen).
4. Befund 6 nach Bedarf; Kategorien und Zutaten zuerst.


> Stand nach der Umsetzung: Befunde 1–5, 7, 8 behoben (Migrationen 019/020 liegen im Repo, sind aber noch nicht auf der Live-DB angewendet). Befund 6 und Abschnitt 9 sind offen.
