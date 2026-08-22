# Projektanalyse: plan_my_family

Stand: 2026-08-21 · Basis: `master` (aa68d15) · Next.js 16 / React 19 / Supabase / Zustand / Tailwind 4

---

## 0. Was die App ist

Ein Familienkalender: vertikal scrollende Tagesliste (±100 Tage) mit einer Spalte
pro Familienmitglied plus „Alle" und „Ereignisse". Termine haben Anfahrts-/Rückfahrtszeiten,
optional ein Fahrzeug, Teilnehmer und Serienregeln (RRULE). Zwei Domänen-Besonderheiten
heben das Projekt über einen Standardkalender:

- **Aufsichtsprüfung** (`guardianCheck.ts`) — findet Zeitfenster, in denen ein Mitglied mit
  `cannot_be_alone` unbeaufsichtigt wäre.
- **Fahrzeugkonflikte** (`conflicts.ts`) — erkennt Doppelbuchungen inkl. Fahrtzeiten.

Beides ist fachlich durchdacht und der eigentliche Wert des Projekts. Der Rest dieses
Dokuments betrifft die Substanz drumherum.

---

## 1. BLOCKER: Das Projekt kompiliert nicht

`master` enthält einen Merge-Commit (`aa68d15`), bei dem **Konfliktmarker eingecheckt wurden**.

```
$ npx tsc --noEmit
81 Fehler — alle "TS1185: Merge conflict marker encountered"
```

Betroffen sind 8 Quelldateien plus `todos.md`:

| Datei | Konfliktblöcke |
|---|---|
| `src/components/calendar/CalendarView.tsx` | 6 |
| `src/components/AppShell.tsx` | 6 |
| `src/lib/store/dataStore.ts` | 4 |
| `src/lib/supabase/types.ts` | 4 |
| `src/components/appointments/AppointmentForm.tsx` | 2 |
| `src/components/calendar/AppointmentBlock.tsx` | 2 |
| `src/lib/utils/guardianCheck.ts` | 2 |
| `src/lib/utils.ts` | 1 |
| `todos.md` | 1 |

Weder `pnpm build` noch `pnpm dev` laufen. Solange das so ist, ist jede andere
Verbesserung Makulatur — **das ist Aufgabe Nr. 1**.

### Woher der Konflikt kommt

Zwei Entwicklungslinien liefen parallel und wurden nie fachlich zusammengeführt:

- **Linie A** (`d0cd7f2`, „meal planning (recipes + meal plans)"): strukturierte
  Essensplanung über Tabellen `recipes` + `meal_plans`, dazu Kalender-Politur.
- **Linie B** (`4855938`, „besser"): Einladungslinks (`/join`, `family_invites`),
  Freitext-Essensplanung über Tabelle `meals` (`lunch`/`dinner` als Text),
  Konflikt-Banner, „Nur dieser Termin"-Bearbeitung von Serien.

### Welcher Stand ist gesund?

Ich habe beide Merge-Eltern einzeln getypt:

| Elternteil | Inhalt | Ergebnis |
|---|---|---|
| `6b7b984` | Linie A (recipes/meal_plans) | **0 TS-Fehler** ✅ |
| `4855938` | Linie B (invites/meals) | **9 TS-Fehler** ❌ |

Linie B war also schon vor dem Merge kaputt. Die 9 Fehler zerfallen in zwei Ursachen:

1. `Meal`-Typ existiert gar nicht in `types.ts` — er wurde in `0fce5a9`
   („remove out-of-scope meals type") entfernt, während 4 Dateien ihn weiter importieren.
2. `participants:appointment_participants(*)` lässt sich nicht typisieren (→ Abschnitt 4).

**Empfehlung:** `6b7b984` (Linie A) als Basis nehmen und die *Features* aus Linie B —
Einladungen, Konflikt-Banner, Serien-Einzelbearbeitung — gezielt darauf portieren.
Der umgekehrte Weg bedeutet, die 9 Fehler zusätzlich mit zu reparieren.

---

## 2. Zwei parallele Essensplanungen im Datenmodell

Der Merge hat nicht nur Textkonflikte erzeugt, sondern **zwei konkurrierende Datenmodelle
für dieselbe Funktion** nebeneinander stehen lassen:

| | Linie A | Linie B |
|---|---|---|
| Tabellen | `recipes` + `meal_plans` (FK auf recipe) | `meals` (`lunch` text, `dinner` text) |
| Store | `recipes[]`, `mealPlans[]` | `meals[]` |
| UI im Kalender | `<MealRow>` (Pills mit Dropdown) | Button + `<MealEditDialog>` |
| Eigene Seite | `/meals` (`MealOverview`) | – |
| Einstellungen | `/settings/recipes` | – |

In der gemergten `CalendarView.tsx` werden **beide UIs im selben Tages-Header gerendert** —
`<MealRow day={day} />` *und* der Meal-Button. Auch die Realtime-Subscription horcht je nach
Konfliktseite auf `meal_plans` oder `meals`.

Das ist eine **Produktentscheidung, keine technische**: Rezeptdatenbank mit
Wiederverwendung (A) oder schnelles Freitextfeld (B)?

> **Entschieden (2026-08-21): Freitext.** Eine Mahlzeit ist nur der Name eines Gerichts,
> keine Rezeptverwaltung. Das `meals`-Modell (B) bleibt, `recipes` + `meal_plans` sind
> mitsamt Typen, Store-Slice und Komponenten entfernt. Die Wochenübersicht `/meals` wurde
> auf das Freitext-Modell portiert statt gestrichen.

---

## 3. Migrationen: nicht ausführbar, nicht konsistent

`supabase/migrations/` enthält vier Dateien, die zusammen nicht funktionieren:

- **Zwei Dateien mit Präfix `001`** — `001_baseline.sql` und `001_create.sql`.
  `001_create.sql` trägt in Zeile 1 selbst den Hinweis *„This schema is for context only
  and is not meant to be run"*, liegt aber im Migrationsordner und würde bei
  `supabase db reset` ausgeführt.
- **Kein `002`–`004`.** Der Kommentar in `001_baseline.sql` erklärt, dass diese entfernt
  wurden; die Nummerierung springt von 001 auf 005.
- **`005`/`006` rufen `get_my_family_ids()` auf** — diese Funktion wird nirgends im Repo
  definiert. `001_baseline.sql` definiert stattdessen `is_family_member()`. Ein frisches
  `supabase db reset` schlägt fehl.
- **`family_invites`, `meals` und `keep_alive` fehlen im Baseline** — `family_invites`
  kommt erst in `005`, `meals`/`keep_alive` gibt es nur in der „nicht ausführbaren"
  `001_create.sql`, also nirgends mit RLS.
- `001_baseline.sql` warnt selbst: *„RLS policies were not diffed against the live
  database's actual policies"*. Repo und Produktivdatenbank sind nachweislich auseinander.

> **Gegen die Live-DB geprüft (2026-08-21, Projekt `gciyahpatcawiyhbwvkq`):** bestätigt.
> Live heißen die Policies `families_select`, `vehicles_all`, `appointments_all` … und
> stützen sich durchgehend auf `get_my_family_ids()`. Die im Baseline erfundene Funktion
> `is_family_member()` **existiert live überhaupt nicht** — Migration 007 hätte in dieser
> Form gegen die echte Datenbank abgebrochen. Der Baseline ist jetzt aus `pg_policies` und
> `pg_proc` nachgezogen und bildet den Live-Stand ab (Policy-Namen inklusive).

**Maßnahme:** `001_create.sql` löschen (oder nach `docs/` verschieben), `get_my_family_ids()`
im Baseline definieren, `family_invites` + die gewählte Meal-Tabelle ins Baseline aufnehmen,
danach einmal `supabase db reset` gegen eine leere Datenbank verifizieren.

---

## 4. `types.ts` ist handgeschrieben — und das kostet

`src/lib/supabase/types.ts` (285 Zeilen) ist von Hand gepflegt statt generiert. Zwei Folgen:

**a) `Relationships: []` ist überall leer.** Dadurch kann der Supabase-Client die
Join-Syntax nicht auflösen und liefert für

```ts
.select("*, participants:appointment_participants(*)")
```

den Typ `SelectQueryError` statt der Zeilen. Genau das sind 8 der 9 Fehler auf Linie B.

**b) 25 `as`-Casts** im Code kompensieren das:

```ts
setAppointments(apptRes.data as AppointmentWithParticipants[]);
```

Diese Casts machen die Typprüfung an genau den Stellen wirkungslos, an denen sie am
meisten wert wäre — an der Grenze zur Datenbank. Ein Schemafehler (siehe fehlender
`Meal`-Typ) wird dadurch erst zur Laufzeit sichtbar.

**Maßnahme:**

```bash
npx supabase gen types typescript --project-id <id> > src/lib/supabase/types.ts
```

als `pnpm gen:types`-Script verankern. Danach lassen sich fast alle 25 Casts ersatzlos
streichen.

---

## 5. Fehlerbehandlung: in 8 von 14 Dateien schlicht nicht vorhanden

47 `await supabase…`-Aufrufe stehen im Code, nur 21 werten `error` aus. Diese Dateien
enthalten das Wort „error" **kein einziges Mal**:

```
src/components/AppShell.tsx
src/components/calendar/CalendarView.tsx
src/components/settings/MembersSettings.tsx
src/components/settings/VehiclesSettings.tsx
src/components/settings/RecipesSettings.tsx
src/components/settings/CalendarDisplaySettings.tsx
src/components/meals/MealDropdown.tsx
src/app/(app)/layout.tsx
```

Konkrete Auswirkung: schlägt in `MembersSettings.handleSave()` das UPDATE fehl (RLS,
Netzwerk, Constraint), passiert **nichts** — kein Hinweis, der Dialog schließt sich,
der lokale Store zeigt weiter den alten Wert. Der Nutzer glaubt, gespeichert zu haben.
Dasselbe gilt für das Verschieben von Terminen per Drag & Drop in `CalendarView`, für
Fahrzeuge, Rezepte und die Kalender-Zeitspanne.

Es gibt zudem **keinerlei Logging** — kein `console.error`, kein Sentry o. ä. Ein Fehler
in Produktion ist unsichtbar.

**Maßnahme:** ein kleiner Wrapper, der `{ data, error }` auswertet, eine Toast-Meldung
zeigt und den optimistischen Store-Update zurückrollt. Einmal geschrieben, an ~26 Stellen
eingesetzt.

---

## 6. Architektur & Performance

### 6.1 `AppShell` lädt die gesamte Familienhistorie — bei jedem Realtime-Event

```ts
supabase.from("appointments")
  .select("*, participants:appointment_participants(*)")
  .eq("family_id", familyId)          // ← kein Zeitfenster
```

Alle Termine seit Bestehen der Familie landen im Client-Store. Nach zwei Jahren Nutzung
sind das mehrere tausend Zeilen bei jedem Seitenaufruf.

Verschärfend: die drei Realtime-Subscriptions rufen jeweils `loadData()` auf — also
**einen kompletten Neuladevorgang aller fünf Tabellen** bei jeder einzelnen Änderung.
Ändert ein Familienmitglied fünf Termine, werden 25 Abfragen ausgelöst. Die Subscriptions
haben außerdem keinen `filter: family_id=eq.…`, empfangen also Events der ganzen Tabelle.

**Maßnahme:** Termine auf ein Fenster laden (z. B. ±120 Tage um das fokussierte Datum,
nachladen beim Scrollen); Realtime-Payload direkt in den Store schreiben statt neu zu
laden; `filter` an die Subscriptions.

### 6.2 `CalendarView.tsx` — 798 Zeilen, die schwerste Arbeit in der Renderschleife

Die Komponente rendert pro sichtbarer Slot-Zeile (48 pro Tag) und pro Spalte:

- `guardianWarnings.filter(...)` über **alle** Warnungen der 200-Tage-Spanne,
  mit `new Date(w.startTime)` obwohl `startTime` bereits ein `Date` ist — drei
  überflüssige Allokationen pro Warnung pro Zeile
- den Aufbau einer `Map` für Verbinder-Bänder über `columns × dayOccurrences`
- drei weitere `.filter`-Durchläufe (`colOccurrences`, `travelStart…`, `travelEnd…`),
  jeder mit `.toDateString()`-Vergleichen (String-Formatierung im heißen Pfad)
- `members.find(...)` innerhalb dieser Schleifen

Bei 6 Spalten und ~60 sichtbaren Zeilen sind das einige tausend Array-Durchläufe pro
Scroll-Frame. Die Virtualisierung ist da, die Arbeit *innerhalb* der virtualisierten
Zeilen ist es, die bremst.

**Maßnahme:** Vorberechnung nach `Map<dayKey, Map<slotIdx, …>>` in einem `useMemo`,
`toDateString()` durch numerische Tagesindizes ersetzen, Slot-Zeile als eigene
`React.memo`-Komponente auslagern.

### 6.3 `AppointmentForm.handleSave()` — dieselben 25 Zeilen dreimal

Die drei Zweige (Serienausnahme anlegen / bestehenden Termin aktualisieren / neu anlegen)
enthalten jeweils denselben Block: Teilnehmer einfügen → vollständige Zeile nachladen →
Store aktualisieren. Das ist dreifach kopiert.

Dazu: der Termin wird eingefügt, danach separat die Teilnehmer. Schlägt der zweite
Aufruf fehl, bleibt ein **Termin ohne Teilnehmer** in der Datenbank zurück — es gibt keine
Transaktion und kein Rollback. Sauber wäre eine Postgres-Funktion, die beides atomar tut.

Und: das Nachladen ist überflüssig — `.insert(…).select("*, participants:…").single()`
liefert alles in einem Roundtrip.

### 6.4 `checkVehicleConflict` expandiert die Serien pro Fahrzeug neu

```ts
for (const v of vehicles) {
  checkVehicleConflict(v.id, …, appointments, …)   // ruft intern expandAppointments()
}
```

Bei 3 Fahrzeugen wird die komplette RRULE-Expansion dreimal durchgeführt — bei jeder
Änderung von Start, Ende oder Fahrtzeit im Formular. Einmal expandieren, dann nach
`vehicle_id` gruppieren.

### 6.5 `MembersSettings.handleDragEnd` — N einzelne UPDATEs

Beim Umsortieren wird pro Mitglied ein eigener Request gefeuert:

```ts
await Promise.all(orderedIds.map((id, i) =>
  supabase.from("family_members").update({ sort_order: i }).eq("id", id)))
```

Ein `upsert` mit dem gesamten Array wäre ein Request — und wäre atomar. Aktuell kann
die Sortierung bei einem Teilfehler inkonsistent zurückbleiben (unbemerkt, siehe §5).

---

## 7. Sicherheit

### 7.0 `get_my_family_ids()` ohne fixierten `search_path` (live bestätigt)

Die Funktion trägt **jede einzelne RLS-Policy** der Datenbank und ist `SECURITY DEFINER` —
aber sie wurde ohne `set search_path` angelegt:

```
proname            | security_definer | config
get_my_family_ids  | true             | (none)
accept_invite      | true             | search_path=public
check_invite_valid | true             | search_path=public
family_is_empty    | true             | search_path=public
```

Die drei anderen Funktionen setzen ihn, ausgerechnet die zentrale nicht. Wer Objekte in
einem Schema anlegen kann, das im `search_path` vor `public` liegt, kann damit
`family_members` überschatten und die Funktion beliebige Family-IDs zurückgeben lassen —
also jede Familie lesen und schreiben. Der Supabase-Linter meldet das als
`0011_function_search_path_mutable`.

Zusätzlich sind `get_my_family_ids()` und `family_is_empty()` für die Rolle `anon`
ausführbar und damit über `/rest/v1/rpc/…` ohne Login erreichbar. `family_is_empty(uuid)`
verrät so, ob eine Family-ID existiert und leer ist.

> **Behoben und live angewandt (2026-08-21).** `get_my_family_ids()` hat jetzt
> `search_path=public`; der Linter-Befund `0011_function_search_path_mutable` ist weg.
>
> Beim Umsetzen zeigte sich, dass `revoke execute … from anon` wirkungslos ist: Postgres
> vergibt EXECUTE per Default an `PUBLIC`, das jede Supabase-Rolle erbt. Erst
> `revoke … from public` plus gezielte Grants greift. Danach kann `anon` nur noch
> `check_invite_valid` aufrufen — insbesondere nicht mehr `accept_invite`, das ohne Session
> mit `auth.uid() = null` die Einladung verbraucht und eine Mitgliedszeile ohne Besitzer
> angelegt hätte.
>
> Gegen die Live-DB verifiziert: entzieht man `get_my_family_ids()` der Rolle
> `authenticated`, schlägt `select from families` mit *permission denied for function*
> fehl. RLS-Policies werden also mit den Rechten der abfragenden Rolle ausgewertet — der
> Grant ist Pflicht, nicht Bequemlichkeit. Weiter abschotten ginge nur, indem man die
> Subquery in die Policies inlint.

### 7.1 Rezepte sind über alle Familien hinweg sichtbar und änderbar

`recipes` hat **keine `family_id`**, und die Policy lautet:

```sql
create policy "authenticated users can manage recipes" on recipes
  for all using (auth.role() = 'authenticated');
```

Jeder eingeloggte Nutzer sieht und *bearbeitet* die Rezepte **aller** Familien. Live ist es
sogar schlimmer als im Repo: dort lautet die Bedingung schlicht `using (true)` — ohne jede
Rollenprüfung, also auch für `anon` offen.

> **Erledigt:** mit der Entscheidung für Freitext-Essensplanung ist `recipes` samt Policy
> entfernt (Migration 007).

### 7.2 Einladungscodes: 32 Bit Entropie, öffentlich prüfbar, ohne Rate Limit

```ts
function generateCode() { return crypto.randomUUID().replace(/-/g,"").slice(0,8); }
```

8 Hex-Zeichen = 4,3 Mrd. Möglichkeiten. Dazu ist `check_invite_valid(text)` per
`grant execute … to anon` **ohne Login** aufrufbar und liefert ein blankes `true`/`false`.
Damit lässt sich ohne jede Authentifizierung gegen die Codes raten; ein Treffer erlaubt
über `accept_invite` den Beitritt zu einer fremden Familie samt Vollzugriff auf deren
Kalender. Es gibt keine Rate-Begrenzung und keine Sperre nach Fehlversuchen.

> **Erledigt.** `generateCode()` liefert jetzt 16 Zufallsbytes als base64url (22 Zeichen,
> 128 Bit). Der Retry-auf-Kollision entfällt damit — er verschluckte ohnehin den echten
> Fehler; stattdessen wird er jetzt angezeigt. DB-seitig ist `accept_invite` zusätzlich
> auf angemeldete Nutzer beschränkt (§7.0).

### 7.3 Registrierung ist nicht atomar

`register/page.tsx` macht drei aufeinanderfolgende, ungesicherte Schritte:
`signUp` → `families.insert` → `family_members.insert`.

Bricht Schritt 3 ab, existiert ein Auth-Nutzer **ohne** `family_members`-Zeile. `AppShell`
gibt in dem Fall stillschweigend auf (`if (!memberData) return;`) — der Nutzer sieht einen
leeren Kalender ohne jede Erklärung, und es gibt **keinen Weg in der UI**, das zu heilen.
Derselbe Zustand entsteht, wenn ein Mitglied sich selbst in `/settings/members` löscht.

**Maßnahme:** Bootstrap in eine `security definer`-Funktion `create_family_with_owner()`
verlagern (atomar), plus einen Onboarding-Screen für den Zustand „eingeloggt, keine Familie".

### 7.4 Kleinere Punkte

- `InviteDialog.loadInvites()` filtert nicht nach `family_id` und verlässt sich allein auf
  RLS. Funktioniert, ist aber unnötig fragil — ein Policy-Fehler wird sofort zum Datenleck.
- Die `invites_update`-Policy hat kein `with check`.
- `family_invites` und `meals` sind im Baseline-Schema gar nicht vorhanden, RLS für `meals`
  existiert nirgends im Repo.

---

## 8. Code-Qualität

### 8.1 Doppelter Code

`MealOverview.tsx` und `MealRow.tsx` definieren lokal noch einmal, was in `@/lib/utils`
bereits steht:

| Funktion | dupliziert in |
|---|---|
| `pad` | MealOverview, MealRow, AppointmentForm |
| `toDateStr` / `localDateStr` | MealOverview, MealRow, AppointmentForm (`toDatePart`) |
| `startOfDay` | MealOverview |
| `getISOWeek` | MealOverview |

Die Konfliktseiten in `utils.ts` streiten sich sogar über den *Namen* derselben Funktion
(`toDateKey` vs. `localDateStr`) — ein Symptom davon, dass beide Linien unabhängig
dieselbe Lücke gefüllt haben.

### 8.2 Toter Code

- `src/components/calendar/GuardianWarning.tsx` — vollständige Komponente, **nirgends
  eingebunden**; `CalendarView` rendert die Warnungen inline selbst.
- `getWarningsForMember()` in `guardianCheck.ts` — nicht verwendet.
- `SLOTS_PER_DAY`, `slotIndex()`, `minutesSinceMidnight()` in `utils.ts` — nicht verwendet.
- `keep_alive`-Tabelle im Schema ohne jeden Code-Bezug.
- `--time-col-width` / `--member-col-width` in `globals.css` — die Werte sind im Code
  hartcodiert (`w-14`, `56px` in den Connector-Berechnungen).

### 8.3 Zwei Gott-Komponenten

`AppointmentForm.tsx` (916 Zeilen) und `CalendarView.tsx` (798 Zeilen) machen zusammen
**29 %** des gesamten Quellcodes aus. Beides ist testbar zerlegbar:
Slot-Zeile, Tages-Header, Konflikt-Banner bzw. Formularabschnitte + eine
`useAppointmentMutations()`-Hook für die Persistenz.

### 8.4 Weiteres

- **6× `window.confirm()`** für Löschbestätigungen, obwohl eine `Dialog`-Komponente
  existiert. In `AppointmentForm` gibt es sogar **beides gleichzeitig** — der gemergte
  Stand zeigt erst einen `confirmDelete`-Inline-Dialog und ruft dann `confirm()` auf.
- `MealOverview`: `const today = startOfDay(new Date())` wird bei jedem Render neu erzeugt
  und ist Dependency eines `useMemo` → der Memo greift nie.
- `CalendarView.columns` mischt echte `FamilyMember`-Objekte mit
  `{ id: "all", name, color }`-Attrappen. Die Magic Strings `"all"` / `"events"` werden an
  acht Stellen geprüft — ein `type Column = { kind: "member" | "all" | "events" }` wäre
  robuster.
- `dark:`-Klassen werden an 8 Stellen verwendet, aber `globals.css` definiert **kein
  Dark-Theme** — weder `.dark`-Klasse noch `prefers-color-scheme`-Block. Im dunklen
  OS-Modus mischen sich helle Variablen mit vereinzelten dunklen Overrides.
- `expandAppointments()` filtert die Ausnahmen pro Elterntermin erneut über das gesamte
  Array (O(n²)); eine `Map<parentId, exceptions[]>` vorab wäre linear.
- ~~`occStart.setHours(...)` in `recurrence.ts` verschiebt Serientermine über
  Sommer-/Winterzeitwechsel hinweg nicht korrekt.~~ **Falscher Alarm** — beim Schreiben der
  Tests gegen Europe/Berlin nachgemessen: ein 09:00-Termin bleibt über den Wechsel am
  29.03. bei 09:00, auch bei über Nacht laufenden Terminen. Genau das hält jetzt ein Test
  fest, damit ein Refactoring es nicht kaputtmacht.

---

## 9. Fehlende Infrastruktur

- ~~**Keine Tests.**~~ **Erledigt** — Vitest, 59 Tests über `guardianCheck.ts` (21),
  `conflicts.ts` (21) und `recurrence.ts` (17), eingehängt in die CI. Gegen vier gezielte
  Mutationen im Produktivcode geprüft (Events zählen als Termin, Fahrtzeit ignoriert,
  Ausnahmetermine wirkungslos, Serie kollidiert mit sich selbst) — jede wird gefangen.
  Die Suite fixiert `TZ=Europe/Berlin`, weil die Domänenlogik durchgehend in lokaler Zeit
  rechnet.
- ~~**Keine CI.**~~ **Erledigt** — `.github/workflows/ci.yml` prüft bei jedem Push auf
  `master` und jedem PR: Konfliktmarker, `lint`, `typecheck`, `build`. Der
  Konfliktmarker-Schritt hätte `aa68d15` in allen 9 Dateien gefangen.
- ~~**Keine `.env.example`.**~~ **Erledigt** (inkl. `.gitignore`-Ausnahme).
- ~~**`README.md` ist das create-next-app-Template.**~~ **Erledigt**; `package.json` hat
  jetzt ein `typecheck`-Script. Ein `test`-Script fehlt weiter — es gibt nichts zu testen.
- ~~**`todos.md` enthält Konfliktmarker.**~~ **Erledigt**.
- **Komponenten sind weiterhin ungetestet.** Die reine Domänenlogik ist abgedeckt;
  `CalendarView` und `AppointmentForm` nicht — die brauchen erst die Zerlegung aus §8.3.
- **Leaked-Password-Schutz ist im Supabase-Projekt deaktiviert.** Ein Schalter unter
  Auth → Policies, prüft Passwörter gegen HaveIBeenPwned.

---

## 10. Empfohlene Reihenfolge

**Sofort — ohne das geht nichts:**

1. ~~Konflikte auflösen.~~ **Erledigt** — alle 25 Konfliktblöcke aufgelöst,
   `tsc --noEmit` → 0 Fehler, `next build` grün.
2. ~~Eine Essensplanung entscheiden, die andere restlos entfernen.~~ **Erledigt** —
   Freitext (`meals`); `recipes`/`meal_plans` entfernt, Migration `007` überträgt
   vorhandene Pläne und löscht die Tabellen.
3. ~~CI-Workflow.~~ **Erledigt** — Konfliktmarker-Guard, Lint, Typecheck und Build
   laufen bei jedem Push und PR.

**Danach — kurzfristig:**

4. `types.ts` generieren lassen, die 25 Casts abbauen.
5. ~~Migrationen konsolidieren.~~ **Weitgehend erledigt** — Baseline nach dem Live-Stand
   nachgezogen, `get_my_family_ids()` definiert, `001_create.sql` aus dem Ordner entfernt.
   Offen: die Dateinamen im Repo (`001_`, `005_`–`008_`) decken sich nicht mit der
   angewandten Historie in der DB (Zeitstempel-Versionen); ein `supabase db reset` gegen
   eine leere DB steht noch aus.
6. ~~RLS-Härtung.~~ **Erledigt und live angewandt** — search_path-Fix, anon-Grants
   zurückgenommen, `recipes` entfernt, Einladungscode auf 128 Bit.
7. Fehlerbehandlung + Toasts an den ~26 ungeprüften Supabase-Aufrufen.
8. ~~`.env.example` und ein echtes README.~~ **Erledigt**.

**Mittelfristig:**

9. ~~Unit-Tests für `guardianCheck`, `conflicts`, `recurrence`.~~ **Erledigt** (59 Tests).
10. Termine zeitfensterweise laden; Realtime-Payloads direkt in den Store.
11. `CalendarView` zerlegen, Slot-Berechnungen vorziehen.
12. `AppointmentForm` zerlegen; Speichern atomar per Postgres-Funktion.
13. Registrierung atomar + Onboarding-Screen für „Nutzer ohne Familie".
14. Toten Code entfernen, Utility-Duplikate zusammenführen, `confirm()` ersetzen.
