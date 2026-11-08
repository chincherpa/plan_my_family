# Termine importieren

**Einstellungen → Termine importieren.** Dort die **CSV-Vorlage herunterladen**, lokal in Excel
(oder einem Texteditor) ausfüllen, wieder auswählen, Vorschau prüfen, Namen zuordnen und
importieren. Die Vorlage enthält die echten Namen der Familie und fünf Beispieltermine
(Titel beginnen mit „Beispiel“, damit man sie leicht wieder löscht) — der einfachste Einstieg.

## Dateiformat

Eine CSV-Datei: **die Kopfzeile bleibt stehen, jede weitere Zeile ist ein Termin, jede Spalte
ein Feld.** Das Trennzeichen (Semikolon, Komma oder Tabulator) wird automatisch erkannt; die
Vorlage nutzt Semikolon und UTF-8 mit BOM, damit deutsches Excel sie direkt richtig öffnet.
Beim Speichern in Excel „CSV UTF-8 (durch Trennzeichen getrennt)“ wählen. Leere Zeilen und
leere Zellen werden übersprungen, Spaltenreihenfolge und Groß-/Kleinschreibung der Kopfzeile
sind egal (`travel_before` = `travelBefore`).

```csv
title;start;end;duration;allDay;event;everyone;owner;participants;notes;vehicle;travelBefore;travelAfter;repeat;repeatInterval;repeatDays;repeatUntil;repeatCount;repeatSkip
Zahnarzt;2026-11-10T09:00;2026-11-10T10:00;;;;;Anna;Ben;Versichertenkarte mitnehmen;Auto;15;15;;;;;;
Training;2026-11-09T17:00;;90;;;;Ben;Anna*;;;;;weekly;;MO|WE;2026-12-20;;2026-11-11
```

Bis zu 2000 Termine und 2 MB pro Datei.

### Spalten

| Spalte | Bedeutung |
| --- | --- |
| `title` | **Pflicht.** Titel des Termins |
| `start` | **Pflicht.** `2026-11-10T17:00` (lokale Zeit) oder `2026-12-24` (nur Datum → ganztägig). Auch `10.11.2026 17:00` / `10.11.2026` — so schreibt Excel Daten gern zurück |
| `end` | Ende im selben Format wie `start`. Bei ganztägigen Terminen der **letzte** Tag (inklusive) |
| `duration` | Dauer in Minuten, statt `end`. Ohne `end` und `duration`: 60 Minuten |
| `allDay` | `ja`/`nein`. Erzwingt ganztägig bzw. mit Uhrzeit. Meist unnötig, weil ein reines Datum schon ganztägig bedeutet |
| `owner` | Name des Familienmitglieds, dem der Termin gehört (seine Spalte im Kalender) |
| `participants` | Weitere Teilnehmer, mit `\|` getrennt: `Ben\|Clara`. Ein `*` dahinter markiert die Aufsichtsperson: `Clara*` |
| `everyone` | `ja`/`nein`. Familientermin → Spalte „Alle“, kein `owner` nötig |
| `event` | `ja`/`nein`. Ereignis (Geburtstag, Feiertag) → Spalte „Ereignisse“, kein `owner` nötig |
| `repeat` | Wiederholung, siehe unten |
| `repeatInterval`, `repeatDays`, `repeatUntil`, `repeatCount`, `repeatSkip` | Feinheiten der Wiederholung, siehe unten |
| `notes` | Notizen |
| `vehicle` | Name eines Fahrzeugs (nicht bei ganztägigen Terminen und Ereignissen) |
| `travelBefore`, `travelAfter` | Anfahrt / Rückfahrt in Minuten, 0–240 (nicht bei ganztägigen Terminen und Ereignissen) |

Als „ja“ gelten `ja`, `j`, `yes`, `true`, `wahr`, `x`, `1`; als „nein“ `nein`, `n`, `no`,
`false`, `falsch`, `0`.

Hinweise:

- **Zeiten sind lokale Zeiten** ohne Zeitzone. Mit `Z` oder Versatz (`2026-11-10T16:00:00Z`,
  `…+01:00`) werden sie als absoluter Zeitpunkt gelesen und ins lokale Zeitfenster umgerechnet.
- **Ein Besitzer, weitere Teilnehmer.** `owner` ist die Hauptperson; `participants` sind alle
  weiteren. Steht der Besitzer auch in `participants`, wird er dort entfernt. Fehlt `owner`,
  aber es gibt Teilnehmer, wird der erste Teilnehmer Besitzer.
- Ohne `owner`, `everyone` oder `event` (und ohne Teilnehmer) kann ein Termin nicht importiert
  werden — er wäre in keiner Spalte sichtbar.
- Mit `everyone` oder `event` werden `owner` und `participants` ignoriert (mit Hinweis).
- Unbekannte Spalten werden ignoriert und in der Vorschau als Hinweis angezeigt, damit
  Tippfehler wie `ownr` auffallen.
- `#7` in der Vorschau meint den siebten Termin der Datei (Leerzeilen zählen nicht).

### Wiederholungen

**`repeat`** — ein Wort, entspricht den Auswahlpunkten im Terminformular:

`daily` · `weekdays` (Mo–Fr) · `weekend` (Sa/So) · `weekly` · `biweekly` (alle 2 Wochen) · `monthly` · `yearly`

Für alles Weitere die Zusatzspalten (nur zusammen mit einem `repeat`-Wort):

| Spalte | Bedeutung |
| --- | --- |
| `repeatInterval` | Abstand, z. B. `3` bei `weekly` = alle 3 Wochen (1–99) |
| `repeatDays` | Wochentage `MO TU WE TH FR SA SU`, mit `\|` getrennt (`MO\|WE`), nur bei `weekly`/`biweekly` |
| `repeatUntil` | letzter möglicher Tag, `2026-12-20` (inklusive) |
| `repeatCount` | Anzahl der Termine (1–1000). `repeatUntil` und `repeatCount` schließen sich aus |
| `repeatSkip` | Tage, an denen die Serie ausfällt, mit `\|` getrennt: `2026-11-11\|2026-11-18` |

**RRULE-Text** — wer aus einem iCal-Export kommt, kann den Text direkt in `repeat` übernehmen,
z. B. `FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261220` oder `FREQ=MONTHLY;COUNT=12`. Dazu darf nur
`repeatSkip` kombiniert werden. Erlaubt sind tägliche, wöchentliche, monatliche und jährliche
Regeln; `DTSTART` gehört nicht in den Text, der Start kommt aus `start`.

Passt der Starttag nicht zur Regel (z. B. Start am Donnerstag, `repeatDays` = Mo/Mi), beginnt die
Serie am ersten passenden Tag; die Vorschau weist darauf hin. Tage aus `repeatSkip`, an denen die
Serie gar keinen Termin hat, werden ignoriert (ebenfalls mit Hinweis).

## Ablauf und Verhalten

1. **Namen zuordnen.** Namen aus der Datei werden ohne Rücksicht auf Groß-/Kleinschreibung und
   Akzente mit den Familienmitgliedern bzw. Fahrzeugen abgeglichen. Was sich nicht eindeutig
   findet („Mama“ statt „Anna“), wird in der Vorschau zur Auswahl angeboten: einem Mitglied
   zuordnen oder ignorieren. Termine mit ungeklärten Namen werden nicht importiert.
2. **Duplikate.** Standardmäßig werden Termine übersprungen, die es schon gibt (gleicher Titel,
   gleicher Beginn und gleiches Ende, Einzeltermin/Serie gleich) oder die in der Datei doppelt
   stehen. Dieselbe Datei lässt sich so gefahrlos mehrfach importieren, etwa nach einem
   erneuten Export. Der Schalter in der Vorschau schaltet das ab.
3. **Fehler pro Termin, nicht pro Datei.** Fehlerhafte Einträge werden in der Vorschau mit
   Position (`#7`) und Grund angezeigt und übersprungen, der Rest wird importiert. Scheitert
   beim Speichern ein einzelner Termin, wird er am Ende aufgelistet.

Importierte Termine sind danach normale Termine und lassen sich im Kalender wie gewohnt
bearbeiten und löschen.

> **Beim Bearbeiten ganzer Serien:** Das Terminformular kennt die Wiederholungs-Auswahlpunkte,
> aber kein Enddatum (`repeatUntil`/`repeatCount`). Wird eine importierte Serie mit „Ganze Serie“ im Formular
> gespeichert, wird sie aus der Auswahl neu gebaut und verliert ein Enddatum bzw. besondere
> Wochentage.
