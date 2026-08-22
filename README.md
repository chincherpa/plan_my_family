# Familienplaner

Ein Familienkalender: eine vertikal scrollende Tagesliste mit einer Spalte pro
Familienmitglied, plus die Spalten „Alle" (Familienausflüge) und „Ereignisse"
(Geburtstage, Feiertage).

Über einen gewöhnlichen Kalender hinaus:

- **Aufsichtsprüfung** — Mitglieder mit „kann nicht alleine sein" werden markiert,
  sobald kein erziehungsberechtigtes Mitglied verfügbar ist.
- **Fahrzeugkonflikte** — Doppelbuchungen eines Fahrzeugs werden inklusive
  Anfahrts- und Rückfahrtszeiten erkannt.
- **Konflikt-Banner** — beides gebündelt für die nächsten 14 Tage, mit Sprunglinks.
- **Serientermine** — wiederkehrende Termine (RRULE), einzeln oder als ganze
  Serie bearbeit- und löschbar.
- **Essensplanung** — Mittag- und Abendessen pro Tag als freier Text.

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

`ANALYSE.md` enthält eine priorisierte Bestandsaufnahme des Projekts —
Architektur, Sicherheit, Performance und was als Nächstes ansteht.
