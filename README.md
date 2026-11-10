# Familienplaner

Ein Familienkalender: eine vertikal scrollende Tagesliste mit einer Spalte pro
Familienmitglied, plus die Spalten „Alle" (Familienausflüge) und „Ereignisse"
(Geburtstage, Feiertage).

Über einen gewöhnlichen Kalender hinaus:

- **Aufsichtsprüfung** — Mitglieder mit „kann nicht alleine sein" werden markiert,
  sobald kein erziehungsberechtigtes Mitglied verfügbar ist.
- **Fahrzeugkonflikte** — Doppelbuchungen eines Fahrzeugs werden inklusive
  Anfahrts- und Rückfahrtszeiten erkannt.
- **Konflikt-Banner** — Konflikte gebündelt für die nächsten 14 Tage, mit Sprunglinks.
- **Serientermine** — wiederkehrende Termine (RRULE), einzeln oder als ganze
  Serie bearbeit- und löschbar.
- **Schulferien** — Ferienzeiträume in den Einstellungen pflegen; sie erscheinen im Kalender als
  ganztägiger Hinweis. Serientermine mit „Findet nicht in Schulferien statt“ entfallen in den Ferien
  und zählen bei „Nach Anzahl“ nicht mit. Wiederholung „Benutzerdefiniert“ erlaubt beliebige
  Wochentage (z. B. Mo, Mi, Fr).
- **Jahrestage** — Geburtstage, Hochzeits-, Kennenlern- und Gedenktage auf einer
  Übersichtsseite (demnächst anstehend, nach Monaten gruppiert, mit Alter bzw.
  Jubiläum). Sie werden als jährliche Ereignis-Serie gespeichert und erscheinen
  dadurch automatisch im Kalender.
- **Essensplanung** — Mittag- und Abendessen pro Tag als freier Text oder aus der Rezepte-App.
  Pro Wochentag lässt sich in den Einstellungen eine Kategorie festlegen (z. B. Montag = Pasta);
  beim Planen werden dann zuerst nur Gerichte dieser Kategorie angeboten, ein Schalter zeigt alle.
- **Termin-Import** — Termine (auch Serien, mit Besitzer und weiteren Teilnehmern) aus einer
  CSV-Datei (Vorlage zum Download in den Einstellungen) übernehmen, siehe [docs/termin-import.md](docs/termin-import.md).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 ·
Supabase (Postgres, Auth, Realtime) · Zustand · dnd-kit · rrule

## Einrichtung

```bash
pnpm install
cp .env.example .env.local   # und die beiden Werte eintragen
pnpm dev
```

Die App läuft auf http://localhost:3000 und leitet auf `/calendar` weiter.

### Datenbank

Das Schema liegt in `supabase/migrations/`. Gegen ein lokales Supabase:

```bash
supabase start
supabase db reset
```

`docs/live-schema-reference.sql` ist ein Abzug des Live-Schemas zum Nachschlagen
und **keine** Migration — die Datei wird nicht ausgeführt.

Nach Schemaänderungen die Typen neu generieren, statt `src/lib/supabase/types.ts`
von Hand zu pflegen:

```bash
npx supabase gen types typescript --project-id <project-ref> > src/lib/supabase/types.ts
```

### Rezepte-App-Anbindung

Die Mahlzeiten-Liste (Auswahl im Essensplan, Einstellungen → Mahlzeiten) kommt aus der
separaten Rezepte-App, einem eigenen Supabase-Projekt (Tabellen `recipes`, `ingredients`,
`categories`). Zugriff nur serverseitig über Server Actions (`src/lib/recipes/`), nach Prüfung,
dass der angemeldete Nutzer Familienmitglied ist. In `.env.local` bzw. als Server-Env-Variablen
des Hostings eintragen:

```
RECIPES_NEXT_PUBLIC_SUPABASE_URL=https://<rezepte-ref>.supabase.co
RECIPES_NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

Der Service-Role-Key umgeht RLS — nie mit `NEXT_PUBLIC_` beginnen lassen. Die Rezept-DB erlaubt
dem Anon-Key nur Lesen, deshalb wird der Service-Role-Key gebraucht. Ist die Rezept-DB nicht
erreichbar, läuft der Planer weiter; im Essensplan ist dann nur Freitext möglich.

Der Tab **Essen → Gerichte** übernimmt den Funktionsumfang der Rezepte-App: Gerichte mit Zutaten
anlegen, bearbeiten, löschen; Kategorien (Icon, Farbe) verwalten – Umbenennen/Löschen zieht die
Gerichte mit; Gerichte auswählen und als PDF-Rezeptkärtchen exportieren (A4 quer, 4 Karten à
120×90 mm, Layout identisch zur Rezepte-App, `src/lib/recipes/pdf.ts`).

## Prüfen

```bash
pnpm lint        # ESLint
pnpm typecheck   # tsc --noEmit
pnpm build       # Produktionsbuild
```

Alle drei laufen in der CI (`.github/workflows/ci.yml`) bei jedem Push auf
`master` und jedem Pull Request, zusammen mit einer Prüfung auf offene
Merge-Konfliktmarker.

## Offene Punkte

`CODE_REVIEW.md` enthält die aktuelle Bestandsaufnahme des Projekts —
Befunde nach Priorität, mit Status (erledigt/offen).
