# Termine importieren

**Einstellungen → Termine importieren.** Dort eine Datei auswählen, die Vorschau prüfen,
Namen zuordnen und importieren. Unter „Dateiformat“ auf der Seite gibt es eine Beispieldatei
mit den echten Namen der Familie zum Herunterladen — der einfachste Einstieg.

Gedacht ist das für den Export aus einem anderen Programm: ein kleines Skript (oder ein
Editor) erzeugt die Datei, die App liest sie ein.

## Dateiformat

Eine JSON-Datei (Endung `.json` oder `.txt` — der Inhalt zählt, nicht die Endung):

```json
{
  "format": "plan-my-family/appointments",
  "version": 1,
  "appointments": [
    {
      "title": "Zahnarzt",
      "start": "2026-11-10T09:00",
      "end": "2026-11-10T10:00",
      "owner": "Anna",
      "participants": ["Ben"],
      "vehicle": "Auto",
      "travelBefore": 15,
      "travelAfter": 15,
      "notes": "Versichertenkarte mitnehmen"
    },
    {
      "title": "Training",
      "start": "2026-11-09T17:00",
      "duration": 90,
      "owner": "Ben",
      "participants": [{ "name": "Anna", "supervisor": true }],
      "repeat": { "freq": "weekly", "days": ["MO", "WE"], "until": "2026-12-20", "skip": ["2026-11-11"] }
    }
  ]
}
```

`format` und `version` sind optional, aber empfohlen: eine Datei mit einer neueren Version
als die App kennt, wird abgelehnt statt falsch gelesen.

Alternativ werden zwei kürzere Schreibweisen akzeptiert:

- **nacktes Array**: `[ { "title": … }, { "title": … } ]`
- **JSON Lines**: ein Termin-Objekt pro Zeile. Leere Zeilen und Zeilen, die mit `#` oder `//`
  beginnen, werden übersprungen. Praktisch, wenn ein Skript Zeile für Zeile schreibt.

Bis zu 2000 Termine und 2 MB pro Datei.

### Felder eines Termins

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `title` | Text, **Pflicht** | Titel des Termins |
| `start` | Text, **Pflicht** | `"2026-11-10T17:00"` (lokale Zeit) oder `"2026-12-24"` (nur Datum → ganztägig) |
| `end` | Text | Ende im selben Format wie `start`. Bei ganztägigen Terminen der **letzte** Tag (inklusive) |
| `duration` | Zahl | Dauer in Minuten, statt `end`. Ohne `end` und `duration`: 60 Minuten |
| `allDay` | `true`/`false` | Erzwingt ganztägig bzw. mit Uhrzeit. Meist unnötig, weil ein reines Datum schon ganztägig bedeutet |
| `owner` | Text | Name des Familienmitglieds, dem der Termin gehört (seine Spalte im Kalender) |
| `participants` | Liste | Weitere Teilnehmer: `"Ben"` oder `{ "name": "Ben", "supervisor": true }` |
| `everyone` | `true`/`false` | Familientermin → Spalte „Alle“, kein `owner` nötig |
| `event` | `true`/`false` | Ereignis (Geburtstag, Feiertag) → Spalte „Ereignisse“, kein `owner` nötig |
| `repeat` | Text oder Objekt | Wiederholung, siehe unten |
| `notes` | Text | Notizen |
| `vehicle` | Text | Name eines Fahrzeugs (nicht bei ganztägigen Terminen und Ereignissen) |
| `travelBefore`, `travelAfter` | Zahl | Anfahrt / Rückfahrt in Minuten, 0–240 (nicht bei ganztägigen Terminen und Ereignissen) |

Hinweise:

- **Zeiten sind lokale Zeiten** ohne Zeitzone. Mit `Z` oder Versatz (`2026-11-10T16:00:00Z`,
  `…+01:00`) werden sie als absoluter Zeitpunkt gelesen und ins lokale Zeitfenster umgerechnet.
- **Ein Besitzer, weitere Teilnehmer.** `owner` ist die Hauptperson; `participants` sind alle
  weiteren. Steht der Besitzer auch in `participants`, wird er dort entfernt. Fehlt `owner`,
  aber es gibt Teilnehmer, wird der erste Teilnehmer Besitzer.
- Ohne `owner`, `everyone` oder `event` (und ohne Teilnehmer) kann ein Termin nicht importiert
  werden — er wäre in keiner Spalte sichtbar.
- Mit `everyone` oder `event` werden `owner` und `participants` ignoriert (mit Hinweis).
- Unbekannte Felder werden ignoriert und in der Vorschau als Hinweis angezeigt, damit
  Tippfehler wie `ownr` auffallen.

### Wiederholungen (`repeat`)

**Kurzform** — ein Wort, entspricht den Auswahlpunkten im Terminformular:

`daily` · `weekdays` (Mo–Fr) · `weekend` (Sa/So) · `weekly` · `biweekly` (alle 2 Wochen) · `monthly` · `yearly`

**Objekt** — für alles Weitere:

| Feld | Bedeutung |
| --- | --- |
| `freq` | eines der Wörter oben (Pflicht) |
| `interval` | Abstand, z. B. `3` bei `weekly` = alle 3 Wochen (1–99) |
| `days` | Wochentage `MO TU WE TH FR SA SU`, nur bei `weekly`/`biweekly` |
| `until` | letzter möglicher Tag, `"2026-12-20"` (inklusive) |
| `count` | Anzahl der Termine (1–1000). `until` und `count` schließen sich aus |
| `skip` | Liste von Tagen, an denen die Serie ausfällt, z. B. `["2026-11-11"]` |

**RRULE-Text** — wer aus einem iCal-Export kommt, kann den Text direkt übernehmen:

```json
{ "repeat": "FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261220" }
{ "repeat": { "rrule": "FREQ=MONTHLY;COUNT=12", "skip": ["2027-01-15"] } }
```

Erlaubt sind tägliche, wöchentliche, monatliche und jährliche Regeln; `DTSTART` gehört nicht
in den Text, der Start kommt aus `start`.

Passt der Starttag nicht zur Regel (z. B. Start am Donnerstag, `days` = Mo/Mi), beginnt die
Serie am ersten passenden Tag; die Vorschau weist darauf hin. Tage aus `skip`, an denen die
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
> aber kein Enddatum (`until`/`count`). Wird eine importierte Serie mit „Ganze Serie“ im Formular
> gespeichert, wird sie aus der Auswahl neu gebaut und verliert ein Enddatum bzw. besondere
> Wochentage.
