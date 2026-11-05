# Rezept-DB-Anbindung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Familienplaner nutzt die Mahlzeiten (Rezepte) der separaten Rezepte-App als Auswahlliste im Essensplan und verwaltet sie dort (anlegen, bearbeiten, löschen) – statt der eigenen Tabelle `meal_catalog`. Die Gerichte aus 'meal_catalog' werden wenn möglich zuvor in die Rezepte-App übertragen.

**Architecture:** Zweites Supabase-Projekt (`fkwyafjpuwtigoznlewg`) wird ausschließlich serverseitig über den Service-Role-Key angesprochen – in Next.js Server Actions, die vorher prüfen, ob der Aufrufer im Familienplaner angemeldet ist. Der Browser bekommt den Key nie. Der Client-Store hält `recipes` + `recipeCategories` statt `mealCatalog`. `meals.lunch/dinner` bleiben Freitext (kein FK über Projektgrenzen) – siehe `007_meals_free_text.sql`.

**Tech Stack:** Next.js 16 (App Router, Server Actions), `@supabase/supabase-js` 2.x, zustand, vitest (node env).

**Spec:** Nutzer-Anforderung vom 2026-11-05: „App soll dieselben in der Rezepte-App verwalteten Mahlzeiten nutzen, zur Auswahl anzeigen und auch verwalten. Credentials in `.env.recipes.local`: `RECIPES_NEXT_PUBLIC_SUPABASE_URL`, `RECIPES_SUPABASE_SERVICE_ROLE_KEY`."

## Live-Schema der Rezept-DB (per REST gelesen, 2026-11-05)

```
recipes      id int8 PK · name text NN · category text NN · bemerkung text NN
ingredients  id int8 PK · recipe_id int8 NN → recipes.id · zutat text NN · menge text NN
             · taetigkeit text NN · sort_order int4 NN
categories   id text PK (z.B. "kartoffel") · name text NN · icon text NN · color text NN
```

- `recipes.category` speichert **`categories.name`** (kein FK). Ist-Daten enthalten auch `"Sonstiges"`, das nicht in `categories` steht.
- 11 Rezepte, 7 Kategorien. `bemerkung` ist NOT NULL → leer = `""`, nie `null`.
- Ob `ingredients.recipe_id` `on delete cascade` hat, ist unbekannt → beim Löschen Zutaten explizit zuerst löschen.

## Global Constraints

- Service-Role-Key nur in Server-Code. Modul mit `import "server-only"` absichern. Niemals `NEXT_PUBLIC_`-Präfix (der Name `RECIPES_NEXT_PUBLIC_SUPABASE_URL` beginnt **nicht** mit `NEXT_PUBLIC_`, wird also nicht ausgeliefert – Name bleibt wie vom Nutzer vorgegeben).
- Jede Server Action ruft zuerst `requireFamilyUser()` (Task 2) auf; ohne Session → `{ error: "Nicht angemeldet." }`, keine DB-Abfrage.
- Next.js lädt `.env.recipes.local` **nicht** automatisch. Die zwei Keys kommen nach `.env.local` (lokal) bzw. in die Server-Env des Deploy-Ziels.
- UI-Texte deutsch, bestehende Begriffe beibehalten („Mahlzeiten“, „Kategorie“, „Bemerkung“).
- Action-Rückgabeform einheitlich: `{ data: T } | { error: string }`.

## Review Focus

1. **Rezept-DB nicht erreichbar / Env fehlt** → Kalender & Essensplan müssen trotzdem laden; nur Auswahlliste leer + Hinweis. Test: `AppShell` lädt Rezepte getrennt vom `Promise.all` (Task 3, manueller Check mit falscher URL).
2. **Rezept umbenannt/gelöscht, aber im Essensplan eingetragen** → alter Freitext bleibt im Plan stehen, kein Fehler. Kein Code nötig, im manuellen Test Task 4 prüfen.
3. **Kategorie eines Rezepts fehlt in `categories`** (z.B. „Sonstiges“) → Rezept wird trotzdem gruppiert angezeigt und im Bearbeiten-Dialog als Option angeboten. Test `buildCategoryOptions` (Task 1).
4. **Doppelter Name** → Rezepte-DB hat evtl. keinen Unique-Index; `validateRecipeInput` lehnt Namen ab, die (case-insensitiv, getrimmt) schon bei einem anderen Rezept existieren. Test Task 1.
5. **Nicht angemeldeter POST auf Server Action** → `{ error: "Nicht angemeldet." }`. Test Task 2 (mit gemocktem Auth-Client).

---

## File Structure

| Datei | Verantwortung |
|---|---|
| Create `src/lib/recipes/types.ts` | `Recipe`, `RecipeCategory`, `RecipeInput`, `ActionResult<T>` |
| Create `src/lib/recipes/logic.ts` (+ `logic.test.ts`) | Reine Funktionen: Validierung, Kategorie-Optionen, Combobox-Optionen |
| Create `src/lib/recipes/admin.ts` | `server-only`; Supabase-Client für Rezept-DB |
| Create `src/lib/recipes/actions.ts` (+ `actions.test.ts`) | `"use server"`; Auth-Check + CRUD |
| Modify `src/lib/store/dataStore.ts` | `mealCatalog` → `recipes`, `recipeCategories`, `recipesError` |
| Modify `src/components/AppShell.tsx:83-152` | Rezepte via Action laden, `meal_catalog`-Query + Realtime-Abo raus |
| Modify `src/components/calendar/MealEditDialog.tsx:25-31` | Optionen aus `recipes` |
| Rename+Modify `src/components/settings/MealCatalogSettings.tsx` → `RecipeSettings.tsx` | Verwaltung über Actions, Feld „Bemerkung“ |
| Modify `src/app/(app)/settings/meals/page.tsx` | neue Komponente |
| Modify `.env.example`, `deploy-pi.ps1`, `README.md` | Env-Doku + Pi-Server-Env |
| Create `supabase/migrations/015_drop_meal_catalog.sql` | alte Tabelle entfernen (letzter Task) |
| Modify `src/lib/supabase/types.ts` | `meal_catalog` + `MealCatalogItem` entfernen |

---

### Task 1: Typen + reine Logik

**Files:**
- Create: `src/lib/recipes/types.ts`, `src/lib/recipes/logic.ts`
- Test: `src/lib/recipes/logic.test.ts`

**Interfaces:**
- Produces:
  - `type Recipe = { id: number; name: string; category: string; bemerkung: string }`
  - `type RecipeCategory = { id: string; name: string; icon: string; color: string }`
  - `type RecipeInput = { name: string; category: string; bemerkung: string }`
  - `type ActionResult<T> = { data: T } | { error: string }`
  - `validateRecipeInput(input: RecipeInput, existing: Recipe[], ownId?: number): { ok: true; value: RecipeInput } | { ok: false; error: string }`
  - `buildCategoryOptions(categories: RecipeCategory[], recipes: Recipe[]): { value: string }[]` – Vereinigung aus `categories.name` und `recipes.category`, dedupliziert, `localeCompare(…, "de")` sortiert
  - `toMealOptions(recipes: Recipe[]): { value: string; group: string }[]` – Form wie bisher in `MealEditDialog.tsx:31`

- [ ] **Step 1: Failing tests schreiben**

```ts
describe("validateRecipeInput", () => {
  const existing = [{ id: 1, name: "Kartoffelsalat", category: "Kartoffel", bemerkung: "" }];
  it("trimmt Felder", () =>
    expect(validateRecipeInput({ name: " Dal ", category: " Suppen ", bemerkung: " x " }, existing))
      .toEqual({ ok: true, value: { name: "Dal", category: "Suppen", bemerkung: "x" } }));
  it("leerer Name", () =>
    expect(validateRecipeInput({ name: "  ", category: "Pasta", bemerkung: "" }, existing))
      .toEqual({ ok: false, error: "Name fehlt." }));
  it("leere Kategorie", () =>
    expect(validateRecipeInput({ name: "Dal", category: "", bemerkung: "" }, existing))
      .toEqual({ ok: false, error: "Kategorie fehlt." }));
  it("Duplikat case-insensitiv", () =>
    expect(validateRecipeInput({ name: "kartoffelsalat ", category: "Kartoffel", bemerkung: "" }, existing))
      .toEqual({ ok: false, error: "Mahlzeit „kartoffelsalat“ gibt es schon." }));
  it("eigener Name beim Bearbeiten erlaubt", () =>
    expect(validateRecipeInput({ name: "Kartoffelsalat", category: "Salate", bemerkung: "" }, existing, 1).ok).toBe(true));
});

describe("buildCategoryOptions", () => {
  it("enthält Kategorien ohne categories-Eintrag, dedupliziert, sortiert", () =>
    expect(buildCategoryOptions(
      [{ id: "pasta", name: "Pasta", icon: "pasta", color: "#DC2626" }],
      [{ id: 1, name: "X", category: "Sonstiges", bemerkung: "" }, { id: 2, name: "Y", category: "Pasta", bemerkung: "" }],
    )).toEqual([{ value: "Pasta" }, { value: "Sonstiges" }]));
});

describe("toMealOptions", () => {
  it("mappt name/category", () =>
    expect(toMealOptions([{ id: 1, name: "Dal", category: "Suppen", bemerkung: "" }]))
      .toEqual([{ value: "Dal", group: "Suppen" }]));
});
```

- [ ] **Step 2:** `pnpm test src/lib/recipes/logic.test.ts` → FAIL (Modul fehlt)
- [ ] **Step 3:** Typen + Funktionen implementieren. Fehlertexte exakt wie in Tests.
- [ ] **Step 4:** `pnpm test src/lib/recipes/logic.test.ts` → PASS
- [ ] **Step 5:** Commit `feat(recipes): types and pure recipe logic`

---

### Task 2: Server-Zugriff auf Rezept-DB (Admin-Client + Actions)

**Files:**
- Create: `src/lib/recipes/admin.ts`, `src/lib/recipes/actions.ts`
- Test: `src/lib/recipes/actions.test.ts`
- Modify: `package.json` (`pnpm add server-only`), `.env.local` (lokal, nicht committet), `.env.example`

**Interfaces:**
- Consumes: Task 1 Typen + `validateRecipeInput`; `createClient()` aus `src/lib/supabase/server.ts`
- Produces (`actions.ts`, `"use server"`):
  - `listRecipes(): Promise<ActionResult<{ recipes: Recipe[]; categories: RecipeCategory[] }>>`
  - `createRecipe(input: RecipeInput): Promise<ActionResult<Recipe>>`
  - `updateRecipe(id: number, input: RecipeInput): Promise<ActionResult<Recipe>>`
  - `deleteRecipe(id: number): Promise<ActionResult<null>>`
- Intern:
  - `admin.ts`: `getRecipesAdminClient(): SupabaseClient` – liest `process.env.RECIPES_NEXT_PUBLIC_SUPABASE_URL` / `RECIPES_SUPABASE_SERVICE_ROLE_KEY`, wirft `"Rezept-DB nicht konfiguriert: RECIPES_NEXT_PUBLIC_SUPABASE_URL und RECIPES_SUPABASE_SERVICE_ROLE_KEY setzen."`; `createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })`. Erste Zeile `import "server-only";`.
  - `actions.ts`: `requireFamilyUser(): Promise<boolean>` via `(await createClient()).auth.getUser()`.

- [ ] **Step 1: Env einrichten.** Beide Zeilen aus `.env.recipes.local` an `.env.local` anhängen. `.env.example` um Block ergänzen (Platzhalter, Kommentar: „nur Server, nie NEXT_PUBLIC_“).

- [ ] **Step 2: Failing tests schreiben** – `vi.mock("@/lib/supabase/server")` (getUser) und `vi.mock("@/lib/recipes/admin")` (Fake-Query-Builder), `vi.mock("server-only", () => ({}))`.

```ts
it("ohne Session: Fehler, keine DB-Abfrage", async () => {
  mockUser(null);
  expect(await listRecipes()).toEqual({ error: "Nicht angemeldet." });
  expect(adminFrom).not.toHaveBeenCalled();
});
it("createRecipe lehnt Duplikat ab, ohne insert", async () => {
  mockUser({ id: "u" }); mockRecipes([{ id: 1, name: "Dal", category: "Suppen", bemerkung: "" }]);
  expect(await createRecipe({ name: "dal", category: "Suppen", bemerkung: "" }))
    .toEqual({ error: "Mahlzeit „dal“ gibt es schon." });
  expect(insertSpy).not.toHaveBeenCalled();
});
it("deleteRecipe löscht erst ingredients, dann recipes", async () => {
  mockUser({ id: "u" });
  await deleteRecipe(7);
  expect(deleteCalls).toEqual([["ingredients", "recipe_id", 7], ["recipes", "id", 7]]);
});
it("DB-Fehler wird als { error } zurückgegeben, nicht geworfen", async () => {
  mockUser({ id: "u" }); mockSelectError("boom");
  expect(await listRecipes()).toEqual({ error: "Mahlzeiten konnten nicht geladen werden." });
});
```

- [ ] **Step 3:** `pnpm test src/lib/recipes/actions.test.ts` → FAIL
- [ ] **Step 4: Implementieren.** `listRecipes`: `recipes` select `id,name,category,bemerkung` + `categories` select `*` parallel. `create/update`: erst alle Rezepte laden (für Duplikat-Check), dann `validateRecipeInput`, dann `insert(...).select().single()` / `update(...).eq("id", id).select().single()`. Fehler loggen (`console.error`), Nutzertexte: „Mahlzeiten konnten nicht geladen werden.“ / „Mahlzeit konnte nicht gespeichert werden.“ / „Mahlzeit konnte nicht gelöscht werden.“ Keine Exceptions an den Client werfen.
- [ ] **Step 5:** `pnpm test` + `pnpm typecheck` → PASS
- [ ] **Step 6: Leak-Check.** `pnpm build`, dann `grep -r "RECIPES_SUPABASE_SERVICE_ROLE_KEY\|<erste 12 Zeichen des Keys>" .next/static` → keine Treffer.
- [ ] **Step 7:** Commit `feat(recipes): server actions for recipe DB` (`.env.local` ist gitignored – nicht committen)

---

### Task 3: Store + Laden in AppShell

**Files:**
- Modify: `src/lib/store/dataStore.ts`, `src/components/AppShell.tsx`

**Interfaces:**
- Consumes: `listRecipes()` (Task 2)
- Produces (Store):
  - `recipes: Recipe[]`, `recipeCategories: RecipeCategory[]`, `recipesError: string | null`
  - `setRecipes(recipes: Recipe[], categories: RecipeCategory[]): void`, `setRecipesError(e: string | null): void`
  - `mealCatalog` / `setMealCatalog` entfallen.

- [ ] **Step 1:** Store-Felder tauschen. `pnpm typecheck` → zeigt alle Nutzer von `mealCatalog` (erwartet: AppShell, MealEditDialog, MealCatalogSettings).
- [ ] **Step 2:** AppShell: `meal_catalog`-Query aus `Promise.all` (Zeile 98) und Realtime-`.on(... "meal_catalog" ...)` (Zeile 152) entfernen. Rezepte **getrennt** laden: `listRecipes().then(r => "error" in r ? setRecipesError(r.error) : setRecipes(r.data.recipes, r.data.categories))` – ein Fehler hier setzt **nicht** `loadError` (Review Focus 1). Kein Realtime für die Rezept-DB; Neuladen passiert bei jedem `loadData` (z.B. Fokus/Reload) mit.
- [ ] **Step 3:** `pnpm typecheck` → nur noch Fehler in MealEditDialog/MealCatalogSettings (Task 4).
- [ ] **Step 4:** Commit zusammen mit Task 4 (sonst bricht Build) – kein Einzelcommit.

---

### Task 4: Auswahl im Essensplan + Verwaltungsseite

**Files:**
- Modify: `src/components/calendar/MealEditDialog.tsx`
- Rename: `src/components/settings/MealCatalogSettings.tsx` → `src/components/settings/RecipeSettings.tsx` (`git mv`)
- Modify: `src/app/(app)/settings/meals/page.tsx`

**Interfaces:**
- Consumes: Store aus Task 3; `createRecipe/updateRecipe/deleteRecipe` (Task 2); `toMealOptions`, `buildCategoryOptions` (Task 1)

- [ ] **Step 1: MealEditDialog.** `mealOptions = toMealOptions(recipes)`. Ist `recipesError` gesetzt: unter den Comboboxen Hinweis „Rezeptliste nicht verfügbar – Freitext möglich.“ Freitext-Eingabe bleibt wie gehabt.
- [ ] **Step 2: RecipeSettings.** Struktur von `MealCatalogSettings` behalten (Gruppen nach Kategorie, Dialog). Änderungen:
  - Supabase-Browser-Client raus, stattdessen Actions; Ergebnis in Store via `setRecipes(…)`.
  - Kategorie-Combobox: `options = buildCategoryOptions(recipeCategories, recipes)`. Freitext bleibt erlaubt; Hinweis unter dem Feld wenn Wert nicht in `recipeCategories`: „Neue Kategorie – erscheint in der Rezepte-App ohne Icon/Farbe.“
  - Neues Feld „Bemerkung“ (`<textarea>` bzw. `Input`, optional → `""`), in der Liste als zweite Zeile `text-sm text-[var(--muted-foreground)]` wenn nicht leer.
  - Gruppen-Überschrift: Farbpunkt aus `recipeCategories.color`, wenn vorhanden.
  - Löschen-Bestätigung: „Mahlzeit wirklich löschen? Sie wird auch in der Rezepte-App inkl. Zutaten gelöscht.“
  - `recipesError` oben anzeigen; Hinzufügen-Button dann disabled.
  - Hinweiszeile unter dem Titel: „Diese Liste wird mit der Rezepte-App geteilt.“
- [ ] **Step 3: page.tsx** importiert `RecipeSettings`.
- [ ] **Step 4:** `pnpm typecheck && pnpm lint && pnpm test` → alles grün.
- [ ] **Step 5: Manuell (`pnpm dev`):**
  - Settings → Mahlzeiten zeigt 11 Rezepte, gruppiert, inkl. „Sonstiges“.
  - Neues Rezept „Test Plan-App“ anlegen → erscheint in der Rezepte-App; dort Name ändern → nach Reload hier sichtbar.
  - Duplikat „kartoffelsalat“ → Fehlermeldung.
  - Kalender → Essen-Dialog → Combobox zeigt Rezepte gruppiert; Auswahl speichert Freitext in `meals`.
  - Testrezept löschen; Tag mit diesem Gericht im Plan behält den Text (Review Focus 2).
  - `.env.local` URL temporär verfälschen → App lädt, Hinweis erscheint (Review Focus 1). Zurücksetzen.
- [ ] **Step 6:** Commit `feat(meals): use shared recipe DB for meal selection and management`

---

### Task 5: Deployment-Env (Pi, ggf. Vercel)

**Files:**
- Modify: `deploy-pi.ps1`, `README.md`

Server-Env wird **nicht** in den Build eingebettet; `deploy-pi.ps1` schließt `.env.local` aus und kommentiert „es muss keine .env auf den Pi“ – gilt für die neuen Keys nicht mehr (und betrifft schon `FAMILY_LOGIN_EMAIL`).

- [ ] **Step 1:** `deploy-pi.ps1`: vor Install-Schritt eine Datei `family.env` mit nur den Server-Keys (`FAMILY_LOGIN_EMAIL`, `RECIPES_NEXT_PUBLIC_SUPABASE_URL`, `RECIPES_SUPABASE_SERVICE_ROLE_KEY`) aus `.env.local` extrahieren, per `scp` nach `$AppDir/.env.production.local` kopieren (`chmod 600`), lokale Temp-Datei löschen. Kommentar Zeile 6 korrigieren.
- [ ] **Step 2:** Prüfen, dass `scripts/pi-install.sh` `$AppDir/.env.production.local` beim Entpacken nicht löscht; sonst Ausnahme ergänzen.
- [ ] **Step 3:** Falls Vercel genutzt wird (`.vercel/` existiert): beide Keys als Production-Env-Vars setzen (Nutzer bestätigt vorher).
- [ ] **Step 4:** README: Abschnitt „Rezepte-App-Anbindung“ (welche Keys, wo eintragen).
- [ ] **Step 5:** Deploy auf Pi, Settings → Mahlzeiten lädt Rezepte. Commit `chore(deploy): ship server env to pi`.

---

### Task 6: Alte `meal_catalog` entfernen (destruktiv)

**Files:**
- Create: `supabase/migrations/015_drop_meal_catalog.sql`
- Modify: `src/lib/supabase/types.ts` (Tabelle `meal_catalog` + `MealCatalogItem` raus), `docs/live-schema-reference.sql`

Erst nach erfolgreichem Task 5 und Bestätigung durch Nutzer.

- [ ] **Step 1:** `grep -rn "meal_catalog\|MealCatalogItem" src` → nur noch `types.ts`.
- [ ] **Step 2:** Migration: Kommentarkopf (Warum, Verweis auf Rezept-DB), `drop table if exists meal_catalog;`
- [ ] **Step 3:** Migration anwenden (Nutzer bestätigt, Familienplaner-Projekt – **nicht** Rezept-Projekt).
- [ ] **Step 4:** `pnpm typecheck && pnpm test && pnpm build` → grün. Commit `chore(db): drop meal_catalog, replaced by recipe DB`.

---

## Offene Entscheidungen (Default im Plan gesetzt)

1. **Zutaten verwalten?** Default: nein – nur Name/Kategorie/Bemerkung; Zutaten bleiben in der Rezepte-App. Löschen entfernt Zutaten mit.
2. **Alte `meal_catalog`-Einträge (50 Seed-Gerichte + eigene) in die Rezept-DB übernehmen?** Default: nein, verworfen in Task 6.
3. **Neue Kategorien** aus dem Familienplaner: Default Freitext erlaubt, kein Eintrag in `categories` (wie heute schon „Sonstiges“).
4. **Realtime** über Rezept-DB: Default keins (Änderungen aus Rezepte-App erscheinen nach Reload).
