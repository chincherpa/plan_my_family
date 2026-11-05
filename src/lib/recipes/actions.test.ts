import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// --- Auth-Mock (Familienplaner-Session) ---
let currentUser: { id: string } | null = null;
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser }, error: null }) },
  }),
}));

// --- Fake-Query-Builder für die Rezept-DB ---
type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};
let selectError: string | null = null;
const deleteCalls: [string, string, unknown][] = [];
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

import { createRecipe, deleteRecipe, listRecipes, updateRecipe } from "./actions";

function mockUser(u: { id: string } | null) {
  currentUser = u;
}
function mockRecipes(rows: Row[]) {
  tables.recipes = rows;
}

beforeEach(() => {
  currentUser = null;
  tables = { recipes: [], categories: [] };
  selectError = null;
  deleteCalls.length = 0;
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

  it("deleteRecipe löscht erst ingredients, dann recipes", async () => {
    mockUser({ id: "u" });
    await deleteRecipe(7);
    expect(deleteCalls).toEqual([
      ["ingredients", "recipe_id", 7],
      ["recipes", "id", 7],
    ]);
  });

  it("DB-Fehler wird als { error } zurückgegeben, nicht geworfen", async () => {
    mockUser({ id: "u" });
    selectError = "boom";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await listRecipes()).toEqual({ error: "Mahlzeiten konnten nicht geladen werden." });
    spy.mockRestore();
  });
});
