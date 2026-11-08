import { describe, expect, it } from "vitest";
import { createRecipeCardsPdf } from "./pdf";
import type { RecipeWithIngredients } from "./types";

const recipe = (id: number, ingredients = 3): RecipeWithIngredients => ({
  id,
  name: `Gericht ${id}`,
  category: id % 2 ? "Suppen" : "",
  bemerkung: id === 1 ? "mit Brot" : "",
  ingredients: Array.from({ length: ingredients }, (_, i) => ({
    id: id * 100 + i,
    recipe_id: id,
    zutat: `Zutat ${i}`,
    menge: `${i + 1} EL`,
    taetigkeit: i % 2 ? "hacken" : "",
    sort_order: i,
  })),
});

describe("createRecipeCardsPdf", () => {
  it("4 Karten pro Seite, A4 quer", async () => {
    const doc = await createRecipeCardsPdf([1, 2, 3, 4, 5].map((id) => recipe(id)));
    expect(doc.getNumberOfPages()).toBe(2);
    expect(Math.round(doc.internal.pageSize.getWidth())).toBe(297);
    expect(Math.round(doc.internal.pageSize.getHeight())).toBe(210);
  });

  it("zu viele Zutaten sprengen die Karte nicht", async () => {
    const doc = await createRecipeCardsPdf([recipe(1, 60)]);
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it("Titel mit Kategorie, ohne Kategorie nur der Name", async () => {
    const doc = await createRecipeCardsPdf([recipe(1), recipe(2)]);
    const raw = doc.output();
    expect(raw).toContain("Suppen - Gericht 1");
    expect(raw).toContain("(Gericht 2)");
    expect(raw).not.toContain(" - Gericht 2");
  });
});
