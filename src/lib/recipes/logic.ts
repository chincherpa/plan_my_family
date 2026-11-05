import type { IngredientInput, Recipe, RecipeCategory, RecipeInput } from "./types";

export function validateRecipeInput(
  input: RecipeInput,
  existing: Recipe[],
  ownId?: number
): { ok: true; value: RecipeInput } | { ok: false; error: string } {
  const value: RecipeInput = {
    name: input.name.trim(),
    category: input.category.trim(),
    bemerkung: input.bemerkung.trim(),
  };

  if (!value.name) return { ok: false, error: "Name fehlt." };
  if (!value.category) return { ok: false, error: "Kategorie fehlt." };

  const key = value.name.toLocaleLowerCase("de");
  const duplicate = existing.some(
    (r) => r.id !== ownId && r.name.trim().toLocaleLowerCase("de") === key
  );
  if (duplicate) return { ok: false, error: `Mahlzeit „${value.name}“ gibt es schon.` };

  return { ok: true, value };
}

export function buildCategoryOptions(
  categories: RecipeCategory[],
  recipes: Recipe[]
): { value: string }[] {
  const names = new Set<string>();
  for (const c of categories) if (c.name.trim()) names.add(c.name.trim());
  for (const r of recipes) if (r.category.trim()) names.add(r.category.trim());
  return [...names].sort((a, b) => a.localeCompare(b, "de")).map((value) => ({ value }));
}

export function toMealOptions(recipes: Recipe[]): { value: string; group: string }[] {
  return recipes.map((r) => ({ value: r.name, group: r.category }));
}

export type NormalizedIngredient = IngredientInput & { sort_order: number };

/**
 * Trimmt Zutaten-Zeilen, verwirft komplett leere Zeilen und vergibt sort_order
 * in Listenreihenfolge. Eine Zeile mit Menge/Tätigkeit, aber ohne Zutat ist ein Fehler.
 */
export function validateIngredients(
  rows: IngredientInput[]
): { ok: true; value: NormalizedIngredient[] } | { ok: false; error: string } {
  const value: NormalizedIngredient[] = [];
  for (const [index, row] of rows.entries()) {
    const zutat = row.zutat.trim();
    const menge = row.menge.trim();
    const taetigkeit = row.taetigkeit.trim();
    if (!zutat && !menge && !taetigkeit) continue;
    if (!zutat) return { ok: false, error: `Zutat fehlt in Zeile ${index + 1}.` };
    value.push({
      ...(row.id !== undefined ? { id: row.id } : {}),
      zutat,
      menge,
      taetigkeit,
      sort_order: value.length,
    });
  }
  return { ok: true, value };
}
