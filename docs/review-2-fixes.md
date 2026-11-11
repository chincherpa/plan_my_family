# Befunde aus Review 2 beheben

Kontext: Familienplaner (Next.js 16 + Supabase), Repo chincherpa/plan_my_family.
Grundlage ist der Abschnitt „Review 2" in `CODE_REVIEW.md` (Stand 2026-11-11, Basis
`4271fbc`). Die Befundnummern unten beziehen sich darauf. Zeilennummern gelten für
diesen Stand und verschieben sich mit jedem Schritt.

Stand:
- Lint, Typecheck und 305 Tests sind auf `4271fbc` grün. `pnpm build` wurde nicht geprüft.
- Am Code wurde noch nichts geändert.
- Befunde 1, 2, 4 und 8 sind mit einem Wegwerf-Test reproduziert; die Testfälle unten
  übernehmen genau diese Szenarien.

Reihenfolge: Schritte 2 und 3 gehören zusammen (gleiche Datei, gemeinsame Tests). Die
übrigen sind unabhängig. Pro Schritt ein Commit. Nach jedem Schritt:

```bash
pnpm lint
```

```bash
pnpm typecheck
```

```bash
pnpm test
```

Die Tests laufen mit `TZ=Europe/Berlin`; neue Testfälle dürfen sich darauf verlassen.

---

## Schritt 1: Sprachfrage findet laufende und mehrtägige Termine (Befund 1)

Ursache: `src/lib/voice/queryAppointments.ts:109` prüft Termine mit Uhrzeit auf
`occurrenceStart >= rangeStart`, ganztägige auf Überlappung.

1. Die Bedingung für alle Termine auf Überlappung umstellen:

   ```ts
   if (occ.occurrenceEnd <= rangeStart || occ.occurrenceStart > rangeEnd) continue;
   ```

   Der Kommentar zu ganztägigen Einträgen entfällt, die Unterscheidung nach
   `is_all_day` auch.
2. `daysUntil` wird für laufende mehrtägige Termine negativ. `formatDaysUntil`
   (`src/lib/anniversaries.ts:192`) und `dayPhrase` (`queryAppointments.ts:190`) kennen
   das nicht („in -1 Tagen"). In `runVoiceQuery` auf 0 begrenzen:
   `daysUntil: Math.max(0, daysBetween(now, occ.occurrenceStart))`. Ein laufender Termin
   heißt dann „heute".
3. Die Sortierung nach `start` bleibt. Laufende Termine stehen damit vorn.

Tests in `src/lib/voice/queryAppointments.test.ts`:
- Reise Do 12.11. 18:00 – So 15.11. 12:00 (nicht ganztägig), Frage mit
  `from_date = to_date = "2026-11-13"` → Treffer „Reise".
- Termin 10:00–12:00 am 11.11., `now` = 10:30, Frage ohne Zeitraum → der Termin ist
  der erste Treffer, `daysUntil` ist 0.
- Termin, der um 10:00 endet, `now` = 10:30, Frage ohne Zeitraum → kein Treffer.

## Schritt 2: `occurrencesBefore` zählt ohne `COUNT` (Befund 2)

Ursache: `src/lib/appointments/actions.ts:133` ruft `rule.between(...)` auf der
Originalregel auf. Deren `COUNT` beendet die Aufzählung, bevor die durch Ferien
verlängerte Serie zu Ende ist.

1. Signatur ändern, damit die Funktion rein wird (gehört zu Schritt 9):

   ```ts
   export function occurrencesBefore(
     parent: AppointmentWithParticipants,
     occStart: Date,
     holidays: HolidayRange[]
   ): number
   ```

   `HolidayRange` kommt aus `src/lib/utils/schoolHolidays.ts`. Der Zugriff auf
   `useDataStore.getState()` in der Funktion entfällt.
2. Die Regel ohne `COUNT` durchlaufen:

   ```ts
   const rule = RRule.fromString(parent.recurrence_rule!);
   const open = new RRule({ ...rule.origOptions, count: null });
   return open
     .between(startOfDay(new Date(parent.start_time)), occStart, true)
     .map(occurrenceDateKey)
     .filter((key) => key < cutKey && !(parent.skip_school_holidays && isSchoolHoliday(key, holidays)))
     .length;
   ```

   `between` ist durch `occStart` begrenzt, eine Endlosschleife ist nicht möglich.
3. Aufrufer anpassen und die Ferien übergeben:
   - `actions.ts:322` (`moveOccurrence`): `useDataStore.getState().schoolHolidays`.
   - `src/components/appointments/AppointmentForm.tsx:550`: `schoolHolidays` liegt dort
     schon aus dem Store vor.

Tests in neuer Datei `src/lib/appointments/actions.test.ts`:
- Wöchentlich ab Mo 05.01.2026 16:00, `COUNT=10`, `skip_school_holidays`, Ferien
  26.01.–13.02.2026. Das 9. sichtbare Vorkommen ist der 23.03.2026 →
  `occurrencesBefore` liefert 8 (bisher 7).
- Dieselbe Serie ohne Ferien, 4. Vorkommen → 3.
- Serie ohne `skip_school_holidays`, aber mit Ferien in der Liste → Ferientage zählen mit.

Die Regel in den Tests mit `buildRecurrenceRule` aus `src/lib/utils/recurrence.ts`
erzeugen, nicht von Hand schreiben.

## Schritt 3: Leere Rest-Serie nach dem Teilen vermeiden (Befund 4)

Ursache: `isFirstOccurrence` (`actions.ts:76`) fragt nur die Regel. Fällt der
Serienbeginn in die Ferien oder ist das erste Vorkommen gelöscht, gilt der erste
sichtbare Termin nicht als erster.

1. `isFirstOccurrence` um die sichtbaren Vorkommen erweitern. Neue Signatur:

   ```ts
   export function isFirstOccurrence(
     appt: AppointmentWithParticipants,
     occStart: Date,
     all: AppointmentWithParticipants[],
     holidays: HolidayRange[]
   ): boolean
   ```

   Umsetzung: `expandAppointments([appt, ...Ausnahmen von appt], Serienbeginn,
   startOfDay(occStart), holidays)` aufrufen und prüfen, ob ein Vorkommen mit
   `occurrenceDateKey < occurrenceDateKey(occStart)` dabei ist. Ausnahmen sind die
   Zeilen aus `all` mit `recurrence_parent_id === appt.id`. `expandAppointments`
   berücksichtigt Ferien, Löschmarker und verschobene Vorkommen bereits. Serienbeginn
   ist `startOfDay(new Date(appt.start_time))`.
2. Das Formular hat eine eigene Kopie (`AppointmentForm.tsx:338–350`). Sie durch den
   Aufruf der Funktion aus `actions.ts` ersetzen; `appointments` und `schoolHolidays`
   sind dort vorhanden. Die Abhängigkeiten des `useMemo` ergänzen.
3. Aufrufer anpassen: `AppointmentMenu.tsx:206` (Store-Werte per `useDataStore`
   holen), `actions.ts:210` und `actions.ts:315` (`useDataStore.getState()`).

Tests in `src/lib/appointments/actions.test.ts`:
- Serie ab 05.01.2026, Ferien 01.01.–09.01., `skip_school_holidays` → für den 12.01.
  liefert `isFirstOccurrence` `true` (bisher `false`).
- Serie ohne Ferien, erstes Vorkommen per Löschmarker entfernt (`is_deleted`,
  `exception_date` = erster Tag) → zweites Vorkommen gilt als erstes.
- Serie ohne Besonderheiten → erstes `true`, zweites `false`.
- Nachmittagsserie (16:00) → erstes Vorkommen `true` (Mittags-Anker, siehe Review 1).

## Schritt 4: Sprachdialog bricht beim Schließen ab (Befund 3)

Ursache: `analyze` in `src/components/voice/VoiceAppointment.tsx:123` setzt nach dem
`fetch` Zustand, obwohl `handleOpenChange` (Zeile 91) ihn schon geleert hat.

1. `const requestRef = useRef<AbortController | null>(null);` in der Komponente.
2. In `analyze` vor dem `fetch`:

   ```ts
   requestRef.current?.abort();
   const controller = new AbortController();
   requestRef.current = controller;
   ```

   und `signal: controller.signal` an `fetch` übergeben.
3. Nach `await res.json()` und im `catch` zuerst prüfen:
   `if (controller.signal.aborted) return;`. Im `catch` steht die Prüfung vor
   `setError`, sonst erscheint „Keine Verbindung zum Server" nach einem Abbruch. Das
   abschließende `setPhase("input")` darf nach einem Abbruch ebenfalls nicht laufen.
4. In `handleOpenChange` im Zweig `!next`: `requestRef.current?.abort();`.
5. `save` (Zeile 169) ist nicht betroffen: Es schließt den Dialog selbst und der
   Termin soll gespeichert werden.

Kein automatischer Test (die Komponente hat keinen). Von Hand prüfen: „Los" drücken,
sofort Esc → kein Vorlesen, beim erneuten Öffnen leeres Eingabefeld.

Dabei den kleinen Punkt aus Abschnitt 10 miterledigen: In der Antwortansicht
(Zeile 278) die Frage nur anzeigen, wenn `text.trim()` nicht leer ist.

## Schritt 5: Drag & Drop über `moveOccurrence` (Befund 5)

Ursache: `handleDragEnd` in `src/components/calendar/CalendarView.tsx:267–297`
schreibt `start_time`, `end_time` und `owner_id` direkt. `is_all_family` bleibt stehen.

1. Den Supabase-Aufruf ersetzen:

   ```ts
   const result = await moveOccurrence(
     occ.appointment,
     occ.occurrenceStart,
     { start: newStart, end: newEnd, ownerId: overColumn && overColumn !== ALL_COLUMN_ID ? overColumn : null },
     "single"
   );
   setMoveError(result.ok ? null : result.error);
   ```

   `moveOccurrence` aktualisiert den Store selbst; `updateAppointment` und
   `createClient` werden in dieser Datei dann nicht mehr gebraucht (Importe prüfen).
2. Die frühe Rückkehr (Zeile 276) bleibt, vergleicht aber gegen den Zielwert:
   keine Verschiebung und entweder keine Zielspalte oder die Spalte des Besitzers bei
   `!is_all_family`.
3. Entscheidung nötig: Zieht man einen Termin eines Mitglieds in die Spalte „Alle",
   bleibt er heute beim Mitglied. `withOwner` (`actions.ts:249`) kennt den Weg zurück
   zu „Alle" nicht. Entweder so lassen (heutiges Verhalten) oder `MoveTarget` um
   `allFamily?: boolean` erweitern, das `owner_id = null, is_all_family = true` setzt.
4. Serienvorkommen bleiben vom Ziehen ausgeschlossen (`canDrag` in
   `src/components/calendar/DayTimeline.tsx:366`). Mit `moveOccurrence` und Scope
   `"single"` wäre das Ziehen einzelner Vorkommen jetzt möglich; das ist eine eigene
   Änderung und gehört nicht in diesen Schritt.

Test in `actions.test.ts` für `withOwner` (dazu exportieren):
- „Alle"-Termin, neuer Besitzer X → `owner_id = X`, `is_all_family = false`.
- Neuer Besitzer ist bisher Teilnehmer → fällt aus den Teilnehmern.
- `ownerId = null` → unverändert.

Damit ist auch der Punkt „Drag auf andere Spalte" aus Review 1, Abschnitt 9, erledigt.
In `CODE_REVIEW.md` vermerken.

## Schritt 6: API-Route härten (Befund 7)

Datei `src/app/api/appointments/from-text/route.ts`.

1. Zeile 62 und 70: `error` der beiden Abfragen mit auslesen. Bei einem Fehler
   `console.error` und `return error(500, "load_failed", "Familiendaten konnten nicht
   geladen werden.")`. Kein Mitglied ohne Fehler bleibt 403.
2. Zeile 96: statt `throw e` einen letzten Zweig:

   ```ts
   console.error("Texterkennung fehlgeschlagen", e);
   return error(502, "ai_unavailable", "Die Texterkennung ist nicht eingerichtet oder nicht erreichbar.");
   ```

   Das deckt den fehlenden `ANTHROPIC_API_KEY` und nicht parsbare Antworten ab.
3. `src/lib/voice/extractAppointment.ts:60`: `max_tokens` auf 2000 senken. Vor dem
   Ändern in der Doku des SDK prüfen, ob `effort: "low"` bei diesem Modell Denk-Tokens
   aus demselben Budget verbraucht; wenn ja, 4000 nehmen. Danach einmal gegen die echte
   API testen (ein Termin, eine Frage), weil eine abgeschnittene Antwort als
   `ExtractionFailedError` endet.
4. Im Anthropic-Konto ein monatliches Ausgabenlimit setzen. In
   `docs/termin-per-sprache.md` einen Satz dazu ergänzen.

Kein automatischer Test für die Route. Von Hand: `ANTHROPIC_API_KEY` in `.env.local`
auskommentieren, im Dialog „Los" → die neue Meldung erscheint.

## Schritt 7: Ganztägige Termine und Zeitumstellung (Befund 8)

Ursache: Das Ende wird als `start + durationMs` berechnet. Ein ganztägiger Termin
dauert 23:59:59, der Tag der Umstellung im März nur 23 Stunden.

1. Hilfsfunktion in `src/lib/utils/recurrence.ts`:

   ```ts
   /** Ende eines ganztägigen Termins: 23:59:59 am Starttag + Anzahl Folgetage. */
   export function allDayEnd(start: Date, origStart: Date, origEnd: Date): Date
   ```

   Sie bestimmt die Zahl der Kalendertage zwischen `origStart` und `origEnd`
   (über `startOfDay` und `Math.round(ms / 86400000)`) und gibt
   `new Date(y, m, d + tage, 23, 59, 59, 0)` zurück.
2. Verwenden an drei Stellen, jeweils nur bei `is_all_day`:
   - `src/components/calendar/AppointmentMenu.tsx:344` (Verschieben-Dialog).
   - `timed` in `src/lib/appointments/actions.ts:309–313`.
   - `expandAppointments` in `src/lib/utils/recurrence.ts:83`.
3. `deleteOccurrence` (`actions.ts:158–165`) setzt das Ende eines Löschmarkers genauso.
   Der Marker wird nicht angezeigt, dort ist keine Änderung nötig.

Tests in `src/lib/utils/recurrence.test.ts`:
- `allDayEnd` für den 28.03.2027 (eintägig) → 28.03.2027 23:59:59.
- `allDayEnd` für den 25.10.2026 (25 Stunden) → 25.10.2026 23:59:59.
- Zweitägiger Termin über den 28.03.2027 → Ende am 29.03. 23:59:59.
- Ganztägige wöchentliche Sonntagsserie: Das Vorkommen am 28.03.2027 endet am selben
  Tag.

## Schritt 8: Kleinere Punkte (Befund 10)

Jeder Punkt ist ein eigener kleiner Commit; Reihenfolge beliebig.

- **Termin über Mitternacht per Sprache**
  (`src/lib/voice/appointmentFromText.ts:176–185`): Liegt `endTime` nicht nach
  `startTime`, das Ende auf den Folgetag legen statt abzulehnen. Folgetag über
  `Date.UTC(y, m - 1, d + 1)` als `JJJJ-MM-TT` bilden und an `zonedToUtc` geben. Gleiche
  Zeiten (`end === start`) bleiben ein Fehler. Der bestehende Test, der die Ablehnung
  erwartet, wird angepasst; neuer Test: 22:00–01:00 am 14.11. → Ende 15.11. 01:00
  Ortszeit.
- **Benutzerdefinierte Wochentage** (`AppointmentForm.tsx`, Auswahl „Benutzerdefiniert"):
  Beim Wechsel auf `custom` mit leerer Auswahl den Wochentag des Startdatums
  vorbelegen (rrule-Zählung: `(getDay() + 6) % 7`). Liegt das Startdatum nicht auf
  einem gewählten Tag, unter den Checkboxen einen Hinweis zeigen: „Erster Termin am
  nächsten gewählten Wochentag."
- **Schulferien 2026/27:** Die fehlenden Ferien von Hand unter Einstellungen →
  Schulferien eintragen (keine Migration, die Daten sind bundeslandabhängig). In
  `src/components/settings/SchoolHolidaysSettings.tsx` einen Hinweis anzeigen, wenn
  keine Ferien mit `end_date >= heute` und `start_date` innerhalb der nächsten
  12 Monate vorhanden sind.
- **Kontextmenü auf Touch-Geräten:** Erst auf iPad und Android-Handy prüfen, ob das
  Menü erreichbar ist. Falls nicht: Die Aktionen Verschieben, Übergeben und
  Duplizieren stehen auch im Formular bzw. lassen sich dort ergänzen; alternativ ein
  „⋯"-Knopf im Formularkopf, der dasselbe Menü öffnet.
- **Spracherkennung:** In `src/lib/voice/useSpeechRecognition.ts:82` `onend` nur
  auswerten, wenn `recognitionRef.current === recognition`. Eine Funktion `clearError`
  aus dem Hook zurückgeben und im `onChange` des Textfelds aufrufen.
- **Shortcuts speichern** (`src/components/settings/ShortcutSettings.tsx:42`):
  `.select("id")` anhängen und eine leere Antwort wie einen Fehler behandeln.
- **Meldung beim Übergeben:** `moveOccurrence` bekommt die Fehlermeldung nicht aus dem
  Kontext. Am einfachsten in `AppointmentMenu.tsx:99–107` bei `!result.ok` einen
  eigenen Text melden („Termin konnte nicht übergeben werden.").

Nicht anfassen: der Zeitzonen-Punkt und der `pointerdown`-Listener in
`src/components/ui/dialog.tsx`. Beide sind beschrieben, aber kein Fehler.

## Schritt 9: Tests für `actions.ts` (Befund 9)

Entsteht mit den Schritten 2, 3 und 5: `src/lib/appointments/actions.test.ts` deckt
danach `occurrencesBefore`, `isFirstOccurrence` und `withOwner` ab. Die Datei
importiert `@/lib/supabase/client` nur indirekt; die reinen Funktionen rufen
`createClient` nicht auf, ein Mock ist nicht nötig.

Für Testdaten die Fixtures in `src/lib/utils/__fixtures__/calendar.ts` verwenden.

---

## Danach: Serie teilen in einer Transaktion (Befund 6)

Gehört zu Befund 6 aus Review 1 und ist der größte Brocken. Nur angehen, wenn die
Schritte oben erledigt sind.

1. Neue Migration `023_split_series.sql` mit einer Funktion
   `split_series(parent_id uuid, cut_date date, cut_rule text, new_appointment jsonb,
   new_participants jsonb) returns jsonb`. Sie
   - legt die neue Serie über `save_appointment_with_participants` an,
   - löscht die Ausnahmen der alten Serie mit `exception_date >= cut_date`,
   - setzt `recurrence_rule = cut_rule` auf der alten Serie,
   - gibt die neue Zeile zurück.
   `set search_path = public`, `revoke ... from public`, `grant ... to authenticated`
   wie in Migration 019. Kein `security definer`: Die RLS des Aufrufers soll gelten.
2. Die Regel wird weiter im Client gebaut (`rrule` gibt es in Postgres nicht); die
   Funktion bekommt den fertigen String.
3. `moveOccurrence` (`actions.ts:315–341`) und der „following"-Zweig im Formular
   (`AppointmentForm.tsx:540–575`) rufen die Funktion auf. Der Rollback per `delete`
   entfällt.
4. `endSeriesBefore` bleibt für das reine Löschen („Diesen & alle folgenden löschen").
   Dort die Reihenfolge umdrehen: erst die Regel kürzen, dann die Ausnahmen löschen.
   Scheitert der zweite Schritt, bleiben höchstens Ausnahmen nach dem Serienende
   stehen, und die zeigt `expandAppointments` weiter an. Deshalb auch hier besser eine
   kleine Funktion `end_series(parent_id, cut_date, cut_rule)`.
5. `actions.ts:219`: den Aufruf entfernen, der die Ausnahmen einer ganzen Serie von
   Hand löscht. Der Fremdschlüssel aus Migration 009 erledigt das per
   `on delete cascade`.
6. Typen in `src/lib/supabase/types.ts` und `docs/live-schema-reference.sql`
   nachziehen. Die Migration muss auf der Live-DB angewendet werden, bevor der Client
   deployt wird.

## Zum Abschluss

- In `CODE_REVIEW.md` bei jedem behobenen Befund „— ✅ erledigt" an die Überschrift
  hängen, wie in Review 1.
- `pnpm build` einmal laufen lassen; das ist bisher ungeprüft.
- Im Browser prüfen: Sprachfrage „Was steht an?" bei laufendem Termin, Serie mit
  Ferienpause teilen, „Alle"-Termin in eine Mitgliedsspalte ziehen.
