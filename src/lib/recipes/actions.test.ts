import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// --- Auth-Mock (Familienplaner-Session) ---
let currentUser: { id: string } | null = null;
let isFamilyMember = true;
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser }, error: null }) },
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        limit: () => q,
        maybeSingle: async () => ({
          data: table === "family_members" && isFamilyMember ? { id: "m" } : null,
          error: null,
        }),
      };
      return q;
    },
  }),
}));

// --- Fake-Query-Builder für die Rezept-DB ---
type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};
let selectError: string | null = null;
const deleteCalls: [string, string, unknown][] = [];
const updateCalls: [string, Row, [string, unknown][]][] = [];
const inCalls: [string, string, unknown[]][] = [];
const insertSpy = vi.fn();
const adminFrom = vi.fn((table: string) => makeBuilder(table));

function makeBuilder(table: string) {
  let op: "select" | "insert" | "update" | "delete" = "select";
  let payload: Row | null = null;
  const filters: [string, unknown][] = [];
  const builder = {
    select: () => builder,
    order: () => builder,
    single: () => builder,
    insert: (row: Row) => {
      op = "insert";
      payload = row;
      insertSpy(table, row);
      return builder;
    },
    update: (row: Row) => {
      op = "update";
      payload = row;
      updateCalls.push([table, row, filters]);
      return builder;
    },
    in: (col: string, vals: unknown[]) => {
      inCalls.push([table, col, vals]);
      return builder;
    },
    delete: () => {
      op = "delete";
      return builder;
    },
    eq: (col: string, val: unknown) => {
      filters.push([col, val]);
      if (op === "delete") deleteCalls.push([table, col, val]);
      return builder;
    },
    then: (resolve: (v: { data: unknown; error: { message: string } | null }) => void) => {
      if (selectError && op === "select") return resolve({ data: null, error: { message: selectError } });
      if (op === "insert") return resolve({ data: { id: 99, ...payload }, error: null });
      if (op === "update") {
        const [, id] = filters[0];
        return resolve({ data: { id, ...payload }, error: null });
      }
      if (op === "delete") return resolve({ data: null, error: null });
      return resolve({ data: tables[table] ?? [], error: null });
    },
  };
  return builder;
}

vi.mock("@/lib/recipes/admin", () => ({
  getRecipesAdminClient: () => ({ from: adminFrom }),
}));

import {
  createCategory,
  createRecipe,
  deleteCategory,
  deleteRecipe,
  listIngredientsFor,
  listRecipes,
  updateCategory,
  updateRecipe,
} from "./actions";

function mockUser(u: { id: string } | null) {
  currentUser = u;
}
function mockRecipes(rows: Row[]) {
  tables.recipes = rows;
}

beforeEach(() => {
  currentUser = null;
  isFamilyMember = true;
  tables = { recipes: [], categories: [] };
  selectError = null;
  deleteCalls.length = 0;
  updateCalls.length = 0;
  inCalls.length = 0;
  insertSpy.mockClear();
  adminFrom.mockClear();
});

describe("recipe actions", () => {
  it("ohne Session: Fehler, keine DB-Abfrage", async () => {
    mockUser(null);
    expect(await listRecipes()).toEqual({ error: "Nicht angemeldet." });
    expect(await createRecipe({ name: "Dal", category: "Suppen", bemerkung: "" })).toEqual({
      error: "Nicht angemeldet.",
    });
    expect(await deleteRecipe(1)).toEqual({ error: "Nicht angemeldet." });
    expect(adminFrom).not.toHaveBeenCalled();
  });

  it("angemeldet, aber kein Familienmitglied: Fehler, keine DB-Abfrage", async () => {
    mockUser({ id: "fremd" });
    isFamilyMember = false;
    expect(await listRecipes()).toEqual({ error: "Nicht angemeldet." });
    expect(await deleteRecipe(1)).toEqual({ error: "Nicht angemeldet." });
    expect(adminFrom).not.toHaveBeenCalled();
  });

  it("listRecipes liefert Rezepte und Kategorien", async () => {
    mockUser({ id: "u" });
    mockRecipes([{ id: 1, name: "Dal", category: "Suppen", bemerkung: "" }]);
    tables.categories = [{ id: "suppen", name: "Suppen", icon: "soup", color: "#0891B2" }];
    expect(await listRecipes()).toEqual({
      data: {
        recipes: [{ id: 1, name: "Dal", category: "Suppen", bemerkung: "" }],
        categories: [{ id: "suppen", name: "Suppen", icon: "soup", color: "#0891B2" }],
      },
    });
  });

  it("createRecipe lehnt Duplikat ab, ohne insert", async () => {
    mockUser({ id: "u" });
    mockRecipes([{ id: 1, name: "Dal", category: "Suppen", bemerkung: "" }]);
    expect(await createRecipe({ name: "dal", category: "Suppen", bemerkung: "" })).toEqual({
      error: "Mahlzeit „dal“ gibt es schon.",
    });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("createRecipe speichert getrimmte Werte", async () => {
    mockUser({ id: "u" });
    expect(await createRecipe({ name: " Dal ", category: "Suppen", bemerkung: "" })).toEqual({
      data: { id: 99, name: "Dal", category: "Suppen", bemerkung: "" },
    });
  });

  it("updateRecipe erlaubt eigenen Namen", async () => {
    mockUser({ id: "u" });
    mockRecipes([{ id: 1, name: "Dal", category: "Suppen", bemerkung: "" }]);
    expect(await updateRecipe(1, { name: "Dal", category: "Currys", bemerkung: "lecker" })).toEqual({
      data: { id: 1, name: "Dal", category: "Currys", bemerkung: "lecker" },
    });
  });

  it("deleteRecipe löscht nur das Rezept (Zutaten per FK-Cascade)", async () => {
    mockUser({ id: "u" });
    expect(await deleteRecipe(7)).toEqual({ data: null });
    expect(deleteCalls).toEqual([["recipes", "id", 7]]);
  });

  it("DB-Fehler wird als { error } zurückgegeben, nicht geworfen", async () => {
    mockUser({ id: "u" });
    selectError = "boom";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await listRecipes()).toEqual({ error: "Mahlzeiten konnten nicht geladen werden." });
    spy.mockRestore();
  });
});

describe("category actions", () => {
  const suppen = { id: "suppen", name: "Suppen", icon: "soup", color: "#0891B2" };

  it("ohne Familienmitglied: Fehler, keine DB-Abfrage", async () => {
    mockUser(null);
    const input = { name: "Pasta", icon: "pasta", color: "#DC2626" };
    expect(await createCategory(input)).toEqual({ error: "Nicht angemeldet." });
    expect(await updateCategory("suppen", input)).toEqual({ error: "Nicht angemeldet." });
    expect(await deleteCategory("suppen")).toEqual({ error: "Nicht angemeldet." });
    expect(await listIngredientsFor([1])).toEqual({ error: "Nicht angemeldet." });
    expect(adminFrom).not.toHaveBeenCalled();
  });

  it("createCategory legt mit Slug-id an und liefert frischen Stand", async () => {
    mockUser({ id: "u" });
    tables.categories = [suppen];
    const res = await createCategory({ name: " Pasta ", icon: "pasta", color: "#DC2626" });
    expect(insertSpy).toHaveBeenCalledWith("categories", {
      id: "pasta",
      name: "Pasta",
      icon: "pasta",
      color: "#DC2626",
    });
    expect(res).toEqual({ data: { recipes: [], categories: [suppen] } });
  });

  it("createCategory lehnt Duplikat ab", async () => {
    mockUser({ id: "u" });
    tables.categories = [suppen];
    expect(await createCategory({ name: "suppen", icon: "soup", color: "#000000" })).toEqual({
      error: "Kategorie existiert bereits.",
    });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("updateCategory benennt um und zieht die Gerichte nach", async () => {
    mockUser({ id: "u" });
    tables.categories = [suppen];
    await updateCategory("suppen", { name: "Eintöpfe", icon: "soup", color: "#0891B2" });
    expect(updateCalls).toEqual([
      ["categories", { name: "Eintöpfe", icon: "soup", color: "#0891B2" }, [["id", "suppen"]]],
      ["recipes", { category: "Eintöpfe" }, [["category", "Suppen"]]],
    ]);
  });

  it("updateCategory ohne Namensänderung fasst Gerichte nicht an", async () => {
    mockUser({ id: "u" });
    tables.categories = [suppen];
    await updateCategory("suppen", { name: "Suppen", icon: "soup", color: "#DC2626" });
    expect(updateCalls.map(([t]) => t)).toEqual(["categories"]);
  });

  it("updateCategory: unbekannte id", async () => {
    mockUser({ id: "u" });
    expect(await updateCategory("gibtsnicht", { name: "X", icon: "", color: "" })).toEqual({
      error: "Kategorie nicht gefunden.",
    });
  });

  it("deleteCategory löscht und setzt die Gerichte auf „Ohne Kategorie“", async () => {
    mockUser({ id: "u" });
    tables.categories = [suppen];
    await deleteCategory("suppen");
    expect(deleteCalls).toEqual([["categories", "id", "suppen"]]);
    expect(updateCalls).toEqual([["recipes", { category: "" }, [["category", "Suppen"]]]]);
  });

  it("listIngredientsFor gruppiert nach recipe_id, auch für Rezepte ohne Zutaten", async () => {
    mockUser({ id: "u" });
    tables.ingredients = [
      { id: 10, recipe_id: 1, zutat: "Linsen", menge: "200 g", taetigkeit: "", sort_order: 0 },
      { id: 11, recipe_id: 1, zutat: "Zwiebel", menge: "1", taetigkeit: "würfeln", sort_order: 1 },
    ];
    const res = await listIngredientsFor([1, 2, 1]);
    expect(inCalls).toEqual([["ingredients", "recipe_id", [1, 2]]]);
    expect(res).toEqual({ data: { 1: tables.ingredients, 2: [] } });
  });

  it("listIngredientsFor mit leerer Liste fragt die DB nicht", async () => {
    mockUser({ id: "u" });
    expect(await listIngredientsFor([])).toEqual({ data: {} });
    expect(adminFrom).not.toHaveBeenCalled();
  });
});
