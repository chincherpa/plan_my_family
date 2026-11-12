# Sprachassistent: Termine anlegen und erfragen

`POST /api/appointments/from-text` nimmt einen transkribierten Text entgegen. Claude entscheidet
zuerst die **Absicht**:

- **create** — ein neuer Termin („Morgen um 15 Uhr Zahnarzt“): Claude liest Titel, Datum und
  Uhrzeit, der Endpunkt prüft sie und speichert den Termin in `appointments` — über dieselbe RPC
  `save_appointment_with_participants` wie Formular und CSV-Import.
- **query** — eine Frage („Wann ist der nächste Geburtstag?“, „Nächster Termin für Jack“): Claude
  versteht nur die Frage (`query`, siehe unten). Die Antwort rechnet der Client aus den geladenen
  Terminen (`src/lib/voice/queryAppointments.ts`), mit aufgelösten Serien, Ausnahmen und
  Schulferien wie im Kalender. So steht nur Echtes in der Antwort, nichts Erfundenes.
- **unclear** — weder noch: `422 not_understood`.

Voraussetzung: `ANTHROPIC_API_KEY` lokal in `.env.local`, in Produktion als Environment Variable
im Vercel-Projekt (siehe README → Deployment). Im Anthropic-Konto (Console → Limits) ein
monatliches Ausgabenlimit setzen, damit ein Fehler oder Missbrauch die Kosten nicht hochtreibt;
jede Anfrage ist zusätzlich auf `max_tokens: 4000` begrenzt.
Code: `src/app/api/appointments/from-text/route.ts`, `src/lib/voice/`.

## Anfrage

Angemeldete Sitzung (Supabase-Cookies) und JSON-Body:

```json
{ "text": "Morgen um halb vier Zahnarzt mit Ben, Versichertenkarte mitnehmen" }
```

| Feld | Typ | Regeln |
| --- | --- | --- |
| `text` | string | Pflicht, nach Trimmen 1–2000 Zeichen |
| `preview` | boolean | optional. `true`: nur auswerten, nichts speichern (Antwort `200`, siehe unten) |

## Was Claude zurückgeben muss

Structured Outputs erzwingen genau diese Form (jedes Feld vorhanden, `null` = „steht nicht im Text“,
keine weiteren Felder):

```json
{
  "title": "Zahnarzt",
  "date": "2026-11-12",
  "start_time": "15:30",
  "end_time": null,
  "all_day": false,
  "person": "Ben",
  "notes": "Versichertenkarte mitnehmen"
}
```

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `title` | string \| null | **Pflicht.** Kurzer Titel ohne Datum/Uhrzeit/Namen |
| `date` | string \| null | **Pflicht.** `JJJJ-MM-TT`, relative Angaben („morgen“) aufgelöst |
| `start_time` | string \| null | **Pflicht**, außer bei `all_day: true`. `HH:MM`, 24 h |
| `end_time` | string \| null | `HH:MM`; fehlt es, dauert der Termin 60 Minuten |
| `all_day` | boolean | ganztägig (00:00–23:59:59) |
| `person` | string \| null | Familienmitglied aus der mitgeschickten Namensliste |
| `notes` | string \| null | Zusatzinfos |

Die Form garantiert nicht den Inhalt, deshalb prüft `checkExtraction` danach selbst:
leere Strings zählen als fehlend, `date` muss ein echtes Kalenderdatum sein
(`2026-02-30` fällt durch), Uhrzeiten `00:00`–`23:59`, Ende nach Beginn.
Alle Zeiten sind deutsche Ortszeit (`Europe/Berlin`) und werden unabhängig von der
Server-Zeitzone nach UTC umgerechnet (inkl. Sommer-/Winterzeit).

**Spalte im Kalender:** Wird `person` einem Familienmitglied zugeordnet (Groß-/Kleinschreibung
egal), ist es der Besitzer. Sonst landet der Termin in der Spalte „Alle“ (`is_all_family`) —
nennt der Text einen unbekannten Namen, steht das in `warnings`.

## Fragen: das `query`-Objekt

Bei einer Frage antwortet der Endpunkt mit `200 { "query": { … } }` und speichert nichts
(unabhängig von `preview`):

```json
{ "query": { "category": "appointment", "person": "Jack", "person_id": "…", "search": null,
             "from_date": null, "to_date": null, "limit": 1 } }
```

| Feld | Bedeutung |
| --- | --- |
| `category` | `birthday` Geburtstage · `anniversary` andere Jahrestage (Hochzeitstag, Gedenktag) · `appointment` normale Termine · `event` Ereignisse (Feiertage, Ferien) · `any` alles |
| `person`, `person_id` | Familienmitglied, auf das sich die Frage bezieht. Ein Name, der keins ist („Oma Erika“), wird zum `search` |
| `search` | Stichwort in Titel oder Notizen („Zahnarzt“) |
| `from_date`, `to_date` | Zeitraum `JJJJ-MM-TT` (inklusive); `null` = ab jetzt / offen |
| `limit` | Anzahl Treffer, 1–10 |

Auswertung im Client: Ab jetzt zählen Termine, die noch nicht begonnen haben, und ganztägige
Einträge von heute. Mit Zeitraum wird der ganze Tag ab `from_date` einbezogen. Bei `person`
gelten Termine, bei denen die Person Besitzer oder Teilnehmer ist, dazu Familientermine;
Geburtstage und Jahrestage werden über den Namen im Titel zugeordnet. Jahrestage erscheinen nur
mit ihrem nächsten Vorkommen. Gesucht wird bis zu 400 Tage voraus (explizite Zeiträume bis 800).

Weitere Fehler der Frage: `422 invalid_query` (ungültiges oder verdrehtes Datum).

## Antworten

**201 Created**

```json
{
  "appointment": { "id": "…", "title": "Zahnarzt", "start_time": "2026-11-12T14:30:00+00:00", "…": "…" },
  "extracted": {
    "title": "Zahnarzt", "date": "2026-11-12", "start_time": "15:30", "end_time": null,
    "all_day": false, "person": "Ben", "notes": "Versichertenkarte mitnehmen"
  },
  "warnings": []
}
```

**200 OK** (nur mit `"preview": true`) — nichts gespeichert. `preview.appointment` ist die Zeile im
Format der RPC `save_appointment_with_participants`; die Oberfläche zeigt sie an und speichert sie
nach Bestätigung selbst mit der Nutzersitzung:

```json
{ "preview": { "appointment": { "title": "Zahnarzt", "…": "…" }, "extracted": { "…": "…" }, "warnings": [] } }
```

**422 Unprocessable Entity** — Angaben fehlen oder sind ungültig. `extracted` enthält die Rohantwort,
damit der Client gezielt nachfragen kann („Um wie viel Uhr?“):

```json
{
  "error": "incomplete_appointment",
  "message": "Aus dem Text ließ sich kein vollständiger Termin ablesen.",
  "missing": ["start_time"],
  "invalid": [],
  "extracted": { "title": "Zahnarzt", "date": "2026-11-12", "start_time": null, "…": "…" }
}
```

`missing` ⊆ `title`, `date`, `start_time`; `invalid` ist eine Liste `{ field, message }`.

Weitere Fehler haben dieselbe Form `{ error, message }`:

| Status | `error` | Ursache |
| --- | --- | --- |
| 400 | `invalid_json` / `invalid_body` | Body kein JSON bzw. `text` fehlt/leer/zu lang (`issues` mit Details) |
| 401 | `unauthorized` | nicht angemeldet (API-Routen werden vom Proxy nicht auf `/login` umgeleitet) |
| 403 | `no_family` | Nutzer gehört zu keiner Familie |
| 502 | `extraction_failed` / `ai_unavailable` | Claude hat nichts Auswertbares geliefert bzw. API-Fehler, Schlüssel fehlt oder unerwarteter Fehler |
| 503 | `ai_rate_limited` | Rate-Limit der Anthropic-API |
| 500 | `load_failed` | Familiendaten konnten nicht geladen werden |
| 500 | `save_failed` | RPC/Datenbank hat den Termin abgelehnt |

## Sicherheit

- Gespeichert wird mit der Sitzung des Nutzers (Publishable Key + Cookies), kein Service-Key —
  die Row Level Security begrenzt Schreibzugriffe auf die eigene Familie. `family_id` kommt
  aus der Datenbank, nie aus dem Request.
- `ANTHROPIC_API_KEY` wird nur auf dem Server gelesen (`server-only`-Modul).
- Der Text wird Claude als Inhalt in `<transkript>` übergeben, nicht als Anweisung.

## Beispiel

```bash
curl -X POST http://localhost:3000/api/appointments/from-text \
  -H 'Content-Type: application/json' \
  -H 'Cookie: <Supabase-Session-Cookies>' \
  -d '{"text":"Freitag 17 Uhr Elternabend, dauert anderthalb Stunden"}'
```

## Oberfläche

Der schwebende Mikrofon-Button („Sprachassistent“) (`src/components/voice/VoiceAppointment.tsx`, unten rechts in
jeder Ansicht) öffnet einen Dialog: sprechen oder tippen → **Los**.

- **Termin:** Vorschau (über `preview: true`) → **Speichern** oder **Ändern**. Fehlt etwas, nennt der
  Dialog das Fehlende und behält den Text zum Ergänzen.
- **Frage:** Trefferliste mit Datum, Uhrzeit, „in 3 Tagen“ und Personen (bei Geburtstagen das
  Alter: „wird 36“). Ein Klick auf einen Treffer öffnet den Tag im Kalender.
- **Vorlesen:** Die Checkbox „Vorlesen“ neben dem Sprechen-Knopf ist standardmäßig aus (die Wahl
  bleibt im Browser gespeichert). Ist sie an, wird die Antwort auf eine Frage vorgelesen
  (Speech Synthesis API, deutsch; auch in Firefox) — z. B. „Nächster Geburtstag. Jack wird 36,
  am Freitag, 20. November.“ (`spokenAnswer` in `queryAppointments.ts`). Beim Schließen des Dialogs
  oder Abwählen endet das Vorlesen.

Spracherkennung läuft im Browser über die Web Speech API (`de-DE`): Chrome, Edge, Safari.
Die Aufnahme bleibt bei Sprechpausen offen: Dauer-Modus mit automatischem Neustart, wenn der Browser
von sich aus abbricht, und Ende nach `SILENCE_TIMEOUT_MS` (6 Sekunden Stille,
`src/lib/voice/useSpeechRecognition.ts`) oder per „Stopp“.
Firefox hat sie nicht — dort fehlt der „Sprechen“-Knopf, das Textfeld funktioniert unverändert
(auch mit der Diktierfunktion der Tastatur auf Handy und Tablet).
