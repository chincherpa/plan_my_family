# Code-Review: plan_my_family

Diese Datei enthält zwei Reviews:

- **Review 2 (2026-11-11)** – alles, was seit dem ersten Review dazukam (direkt unten).
- **Review 1 (2026-11-09)** – gesamtes Repository, mit Erledigt-Status (weiter unten, unverändert).

---

# Review 2: Änderungen seit dem ersten Review

Stand: 2026-11-11 · Basis: `4271fbc` (preview) · Umfang: `bd22264..4271fbc`
(54 Dateien, +4862/−511): Sprachassistent, Kontextmenü und Termin-Aktionen,
Tastatur-Shortcuts, Schulferien, benutzerdefinierte Wochentage, Duplizieren.

## Ergebnis

`pnpm lint`, `pnpm typecheck` und alle 305 Tests laufen grün. Die neuen Teile folgen dem
bisherigen Muster: Fachlogik ohne React in `src/lib/`, mit Tests. Kritische Fehler habe
ich nicht gefunden. Die Befunde sind Randfälle, vor allem an zwei Stellen: der
Sprachassistent beantwortet Fragen nicht ganz so wie der Kalender, und „Dieser &
folgende" rechnet bei Serien mit Ferienpause falsch.

| # | Schwere | Befund |
|---|---|---|
| 1 | mittel | Sprachfrage übersieht laufende und mehrtägige Termine |
| 2 | mittel | „Dieser & folgende" bei Serie mit Anzahl und Ferienpause: ein Termin zu viel |
| 3 | mittel | Sprachdialog während der Auswertung schließen: Antwort kommt trotzdem |
| 4 | niedrig | Erster sichtbarer Termin nach Ferien gilt nicht als erster der Serie |
| 5 | niedrig | Drag & Drop nutzt die neue `moveOccurrence` nicht (alter Fehler bleibt) |
| 6 | niedrig | Serie teilen im Kontextmenü: Ausnahmen gehen bei einem Fehler verloren |
| 7 | niedrig | API-Route: Fehlerpfade und Kosten |
| 8 | niedrig | Ganztägigen Termin auf den Tag der Zeitumstellung verschieben |
| 9 | niedrig | Keine Tests für `actions.ts` und die API-Route |
| 10 | niedrig | Kleinere Punkte (Liste unten) |

Geprüft habe ich durch Lesen des Diffs und der umgebenden Funktionen. Befunde 1, 2, 4
und 8 sowie zwei der kleineren Punkte (Wochentage, Termin über Mitternacht) habe ich mit
einem Wegwerf-Test reproduziert (TZ=Europe/Berlin). Nicht geprüft: die App im Browser,
die Spracherkennung auf echten Geräten, der Aufruf der Anthropic-API und `pnpm build`.

---

## 1. Sprachfrage übersieht laufende und mehrtägige Termine (mittel) — ✅ erledigt

`src/lib/voice/queryAppointments.ts:109` lässt Termine mit Uhrzeit nur durch, wenn sie
im gefragten Zeitraum **beginnen** (`occurrenceStart >= rangeStart`). Ganztägige Termine
werden dagegen auf Überlappung geprüft, so wie es der Kalender für alle Termine tut.

Reproduziert:

| Frage | Termin | Erwartet | Tatsächlich |
|---|---|---|---|
| „Was steht am Freitag an?" | Reise Do 18:00 – So 12:00 (nicht ganztägig) | Reise | **nichts gefunden** |
| „Was steht an?" um 10:30 | Termin 10:00 – 12:00 heute | läuft gerade | fehlt, nächster Treffer ist erst morgen |

Bei „Was steht heute an?" erscheint der laufende Termin, weil dort der Tagesbeginn als
Grenze gilt. Die Antwort hängt also von der Formulierung ab.

**Empfehlung:** Für alle Termine `occurrenceEnd > rangeStart` prüfen. Soll „der nächste
Termin" laufende Termine bewusst auslassen, dann nur bei `limit === 1` ohne Zeitraum.

## 2. „Dieser & folgende" bei Anzahl plus Ferienpause (mittel) — ✅ erledigt

`occurrencesBefore` (`src/lib/appointments/actions.ts:133`) zählt, wie viele Termine in
der alten Serie bleiben, und fragt dazu `rule.between(...)` mit der Originalregel. Die
enthält `COUNT`, und `rrule` hört nach so vielen Treffern auf, Ferientage eingeschlossen.
Eine Serie mit „Findet nicht in Schulferien statt" läuft aber länger als ihr `COUNT`.
Klickt man einen Termin in dieser Verlängerung an, werden die Termine davor zu niedrig
gezählt.

Reproduziert: wöchentlich, 10 Termine, 3 Wochen Ferien mittendrin. Vor dem 9. Termin
liegen 8, berechnet werden 7. Die neue Serie bekommt 3 statt 2 Termine, insgesamt gibt
es danach 11 statt 10.

Betroffen sind Verschieben und Übergeben im Kontextmenü (`actions.ts:322`) und das
Formular (`AppointmentForm.tsx:550`).

**Empfehlung:** Wie in `occurrencesSkippingHolidays` die Regel ohne `COUNT` durchlaufen
(`new RRule({ ...rule.origOptions, count: null })`) und bis zum angeklickten Tag zählen.

## 3. Sprachdialog schließen, während die Auswertung läuft (mittel) — ✅ erledigt

`analyze` in `src/components/voice/VoiceAppointment.tsx:123` wartet auf die Antwort der
Route und setzt danach Vorschau oder Antwort, ohne zu prüfen, ob der Dialog noch offen
ist. `handleOpenChange` (Zeile 91) hat den Zustand beim Schließen aber schon geleert.

Folgen, wenn man während „Los" mit Esc oder × schließt:

- Mit „Vorlesen" liest der Browser die Antwort vor, obwohl der Dialog zu ist
  (Zeile 147).
- Beim nächsten Öffnen steht die alte Vorschau oder Antwort da, das Textfeld ist leer.
  In der Antwortansicht erscheint dann `„"` als Frage.

**Empfehlung:** Einen Zähler oder `AbortController` pro Anfrage führen und beim
Schließen abbrechen; Ergebnisse überholter Anfragen verwerfen. Das Muster gibt es schon
in `AppShell` (`loadVersion`).

## 4. Erster sichtbarer Termin gilt nicht als erster (niedrig) — ✅ erledigt

`isFirstOccurrence` (`actions.ts:76`, ebenso `AppointmentForm.tsx:338`) fragt nur die
Regel. Fällt der Serienbeginn in die Ferien oder wurde der erste Termin gelöscht, ist
der erste sichtbare Termin für die Regel der zweite. Reproduziert: Serie ab 05.01.,
Ferien bis 09.01., erster sichtbarer Termin am 12.01. → `isFirstOccurrence` ist `false`.

Der Dialog bietet dann „Diesen & alle folgenden" an. Wählt man es, bleibt die alte Serie
als Zeile ohne einen einzigen sichtbaren Termin in der Datenbank. Sie stört nicht, lässt
sich aber über die Oberfläche auch nicht mehr löschen.

**Empfehlung:** Nach dem Teilen prüfen, ob die gekürzte Serie noch Termine hat, und sie
sonst löschen. Alternativ „erster" über die tatsächlich angezeigten Vorkommen bestimmen.

## 5. Drag & Drop nutzt `moveOccurrence` nicht (niedrig) — ✅ erledigt

`src/lib/appointments/actions.ts` enthält jetzt die eine Stelle für Verschieben und
Übergeben. `withOwner` (Zeile 249) setzt beim Besitzerwechsel `is_all_family = false`
und nimmt den neuen Besitzer aus den Teilnehmern.

Der Drag-Handler in `src/components/calendar/CalendarView.tsx:275–286` schreibt
`owner_id` weiterhin selbst. Der Punkt „Drag auf andere Spalte" aus Review 1
(Abschnitt 9) besteht damit weiter: Ein „Alle"-Termin, den man in eine Mitgliedsspalte
zieht, behält `is_all_family = true`.

**Empfehlung:** `handleDragEnd` auf `moveOccurrence` umstellen. Das behebt den alten
Punkt und entfernt die zweite Implementierung.

## 6. Serie teilen: Ausnahmen gehen bei einem Fehler verloren (niedrig) — ⏳ offen

`moveOccurrence` mit „Dieser & folgende" (`actions.ts:315–341`) legt die neue Serie an
und ruft dann `endSeriesBefore`. Das löscht zuerst die späteren Ausnahmezeilen
(Zeile 103) und kürzt danach die Regel (Zeile 115). Scheitert das Kürzen, wird die neue
Serie zurückgerollt (Zeile 337). Die Ausnahmen sind dann aber schon weg: einzeln
verschobene Termine springen zurück, einzeln gelöschte tauchen wieder auf.

Das ist der bekannte Befund 6 aus Review 1 (fehlende Transaktion), jetzt über das
Kontextmenü leichter zu erreichen. Dazu gehört auch `actions.ts:219`: Das Löschen der
Ausnahmen einer ganzen Serie prüft den Fehler nicht; der Fremdschlüssel mit
`on delete cascade` macht den Aufruf ohnehin überflüssig.

**Empfehlung:** Eine Postgres-Funktion `split_series(...)`, die Anlegen, Löschen und
Kürzen in einer Transaktion erledigt.

## 7. API-Route: Fehlerpfade und Kosten (niedrig) — ✅ erledigt (Code)

> Offen außerhalb des Codes: Ausgabenlimit im Anthropic-Konto setzen; einmal gegen die
> echte API testen (`max_tokens` jetzt 4000).

`src/app/api/appointments/from-text/route.ts`:

- **Zeile 70:** Der Fehler der Mitglieder-Abfrage wird nicht geprüft. Schlägt sie fehl,
  ist die Liste leer, Claude bekommt „(keine)" und der Termin landet ohne Hinweis bei
  „Alle".
- **Zeile 96:** Fehlt `ANTHROPIC_API_KEY`, wirft `new Anthropic()` einen Fehler, der
  kein `APIError` ist. Er wird weitergeworfen und endet als 500 ohne JSON. Der Client
  zeigt nur „Der Text konnte nicht ausgewertet werden." Dasselbe gilt für Antworten, die
  das SDK nicht gegen das Schema parsen kann.
- **Kosten:** Jeder Aufruf eines angemeldeten Geräts löst eine bezahlte Anfrage aus,
  ohne Bremse in der App. `max_tokens: 16000` (`src/lib/voice/extractAppointment.ts:60`)
  ist für ein Objekt mit einem Dutzend Feldern sehr großzügig. Da es nur ein
  Familien-Login gibt, ist das Risiko klein; ein Ausgabenlimit im Anthropic-Konto
  reicht als Absicherung.

**Empfehlung:** Fehler der Mitglieder-Abfrage als 500 melden. Um den Anthropic-Aufruf
ein allgemeines `catch` mit 502 und klarer Meldung („Texterkennung nicht eingerichtet").
`max_tokens` auf etwa 1000–2000 senken.

## 8. Ganztägigen Termin auf den Tag der Zeitumstellung verschieben (niedrig) — ✅ erledigt

Der Verschieben-Dialog (`src/components/calendar/AppointmentMenu.tsx:344`) und `timed`
(`actions.ts:312`) rechnen das Ende als `start + Dauer in Millisekunden`. Ein ganztägiger
Termin dauert 23:59:59. Am letzten Sonntag im März hat der Tag nur 23 Stunden.

Reproduziert: 28.03.2027 00:00 + 23:59:59 = 29.03.2027 00:59:59. Der Termin erscheint
an zwei Tagen. `expandAppointments` rechnet für ganztägige Serien genauso
(`src/lib/utils/recurrence.ts:83`), dort trifft es jede Serie einmal im Jahr.

**Empfehlung:** Für ganztägige Termine das Ende über Kalendertage setzen (gleicher Tag
bzw. Starttag + n Tage, 23:59:59 Ortszeit), nicht über Millisekunden.

## 9. Keine Tests für `actions.ts` und die Route (niedrig) — ✅ erledigt für `actions.ts`

> `src/lib/appointments/actions.test.ts` deckt `occurrencesBefore`, `isFirstOccurrence`
> und `withOwner` ab. Für die Route gibt es weiterhin keinen Test.

Die reine Logik des Sprachassistenten ist gut getestet (`appointmentFromText`,
`queryAppointments`). `src/lib/appointments/actions.ts` mit 380 Zeilen hat keinen Test,
und genau dort liegen Befunde 2, 4 und 6. `occurrencesBefore`, `isFirstOccurrence` und
`withOwner` sind reine Funktionen und lassen sich ohne Supabase testen; nur
`occurrencesBefore` liest die Ferien aus dem Store und sollte sie als Parameter
bekommen.

## 10. Kleinere Punkte

- **Benutzerdefinierte Wochentage:** Liegt das Startdatum nicht auf einem der gewählten
  Tage, erscheint am Startdatum kein Termin (reproduziert: Start Mi 11.11., Tage Mo/Fr →
  erster Termin Fr 13.11.). Das Formular sagt das nicht. Ein Hinweis oder das
  automatische Vorbelegen des Start-Wochentags würde reichen. — ✅ erledigt (beides)
- **Termin über Mitternacht per Sprache:** „Party von 22 bis 1 Uhr" wird mit „Ende
  liegt nicht nach dem Beginn" abgelehnt (`src/lib/voice/appointmentFromText.ts:179`).
  Der Verschieben-Dialog legt das Ende in diesem Fall auf den Folgetag. — ✅ erledigt
- **Schulferien 2026/27 fehlen:** Migration 019 legt Ferien erst ab Sommer 2027 an.
  Bis dahin überspringt „Findet nicht in Schulferien statt" nichts, solange die Ferien
  des laufenden Schuljahrs nicht von Hand eingetragen sind. Auf der Einstellungsseite
  fehlt ein Hinweis, wenn für die nächsten Monate keine Ferien hinterlegt sind.
  — ✅ Hinweis erledigt; die Ferien 2026/27 müssen noch von Hand eingetragen werden.
- **Kontextmenü nur per Rechtsklick** (`src/components/calendar/DayTimeline.tsx:394`):
  Safari auf iPhone und iPad löst `contextmenu` nicht aus; auf Android konkurriert das
  lange Drücken mit dem Ziehen (300 ms). Nicht auf Geräten getestet. Verschieben,
  Übergeben und Duplizieren mit Rückgängig gibt es am Touch-Gerät damit vermutlich
  nicht. — ⏳ offen (erst auf Geräten prüfen)
- **Spracherkennung:** `speech.error` bleibt stehen, bis man erneut „Sprechen" drückt,
  auch wenn man inzwischen getippt hat (`VoiceAppointment.tsx:240`). Startet man direkt
  nach „Stopp" neu, kann das `onend` der alten Aufnahme `listening` der neuen
  zurücksetzen (`src/lib/voice/useSpeechRecognition.ts:82`). — ✅ erledigt
- **Zeitzonen im Sprachassistenten:** Der Server löst „morgen" in Europe/Berlin auf, der
  Client wertet `from_date`/`to_date` in der Zeitzone des Geräts aus. Für eine Familie
  an einem Ort gleich; gehört zum Zeitzonen-Punkt aus Review 1.
- **Shortcuts speichern** (`src/components/settings/ShortcutSettings.tsx:42`): Das
  `update` kommt ohne `.select()`. Greift die RLS nicht, meldet Supabase keinen Fehler
  und die Änderung gilt als gespeichert. `families` ist weiterhin nicht per Realtime
  abonniert, andere Geräte sehen neue Shortcuts erst nach dem Neuladen. — ✅ erledigt
  (`.select("id")`; Realtime für `families` weiterhin nicht)
- **Dialog bleibt offen** (`src/components/ui/dialog.tsx:40`): Jede `DialogContent`
  hängt einen eigenen `pointerdown`-Listener ans Dokument und sucht nach
  `[role="listbox"]`. Solange die Vorschlagsliste im Terminformular sichtbar ist,
  schließt ein Klick daneben den Dialog nicht. Gewollt, aber die Kopplung an einen
  Rollen-Selektor ist leicht zu übersehen, wenn später eine dauerhaft gerenderte Liste
  dazukommt.
- **Meldung beim Übergeben:** Schlägt „An Mitglied" fehl, lautet der Fehler „Termin
  konnte nicht verschoben werden" (`actions.ts:282`). — ✅ erledigt

---

## Was gut gelöst ist

- **Sprachassistent:** Claude versteht nur die Frage, die Antwort kommt aus den echten
  Daten. Structured Output mit Schema, danach eine eigene Prüfung von Datum, Uhrzeit und
  Pflichtfeldern. Fehlende Angaben werden als `null` verlangt statt geraten.
- **Sicherheit der Route:** Gespeichert wird mit der Sitzung des Nutzers, nicht mit
  einem Service-Key; die RLS entscheidet. Das Transkript ist als Inhalt markiert, und
  selbst eine erfolgreiche Manipulation könnte nur einen Termin in der eigenen Familie
  anlegen. Die Vorschau speichert nichts.
- **Zeitzone auf dem Server:** `zonedToUtc` rechnet unabhängig von der Server-Zeitzone
  und mit zwei Durchläufen für die Zeitumstellung.
- **Shortcuts:** Reine, getestete Keymap-Logik; nur Abweichungen werden gespeichert;
  reservierte Tasten sind gesperrt; ein einziger Listener, der Eingabefelder und offene
  Dialoge respektiert.
- **Schulferien:** `COUNT` zählt Ferientage nicht mit, mit Obergrenze gegen
  Endlosschleifen. RLS, Realtime und Replica Identity sind gesetzt.
- **Aufräumen:** `endSeriesBefore` und das Löschen liegen jetzt einmal in `actions.ts`
  statt doppelt im Formular. Rückgängig gibt es dort, wo es verlässlich ist.

## Empfohlene Reihenfolge

1. Befund 1 (eine Bedingung, ein Test).
2. Befund 2 und 4 zusammen mit den Tests aus Befund 9.
3. Befund 3 (Abbruch beim Schließen).
4. Befund 5, weil er einen offenen Punkt aus Review 1 mit erledigt.
5. Befund 7 und 8 nach Bedarf; Befund 6 zusammen mit Befund 6 aus Review 1.

---

# Review 1: gesamtes Repository

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
  Formular schreibt in diesem Fall `owner_id = null`. — ✅ erledigt (Review 2, Befund 5:
  Drag & Drop läuft über `moveOccurrence`, ein Besitzerwechsel beendet „Alle"; Ziehen in
  die Spalte „Alle" macht den Termin wieder zum Familientermin)
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
