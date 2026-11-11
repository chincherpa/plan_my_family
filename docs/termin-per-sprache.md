# Termin per Sprache

`POST /api/appointments/from-text` nimmt einen transkribierten Text entgegen, lässt Claude
Titel, Datum und Uhrzeit daraus lesen, prüft das Ergebnis und speichert den Termin in
`appointments` — über dieselbe RPC `save_appointment_with_participants` wie Formular und
CSV-Import.

Voraussetzung: `ANTHROPIC_API_KEY` in der Server-Umgebung (siehe `.env.example`).
Code: `src/app/api/appointments/from-text/route.ts`, `src/lib/voice/`.

## Anfrage

Angemeldete Sitzung (Supabase-Cookies) und JSON-Body:

```json
{ "text": "Morgen um halb vier Zahnarzt mit Ben, Versichertenkarte mitnehmen" }
```

| Feld | Typ | Regeln |
| --- | --- | --- |
| `text` | string | Pflicht, nach Trimmen 1–2000 Zeichen |

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
| 502 | `extraction_failed` / `ai_unavailable` | Claude hat nichts Auswertbares geliefert bzw. API-Fehler |
| 503 | `ai_rate_limited` | Rate-Limit der Anthropic-API |
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
