// Einkaufszettel: fasst die Zutaten mehrerer Gerichte zusammen.
// Mengen sind Freitext („2“, „200 g“, „1 Dose“). Zahlen mit gleicher Einheit werden addiert,
// alles andere wird als eigene Angabe nebeneinander gelistet.

import { dishKey } from "./stats";
import type { Ingredient, Recipe } from "./types";

export type ShoppingLine = {
  zutat: string;
  /** Zusammengefasste Mengen, z.B. ["400 g", "1 Dose"] */
  amounts: string[];
};

export type ShoppingList = {
  lines: ShoppingLine[];
  /** Geplante Gerichte ohne passendes Rezept – haben keine Zutaten */
  unmatched: string[];
};

const NUMBER_PREFIX = /^(\d+(?:[.,]\d+)?)\s*(.*)$/;

function formatNumber(n: number): string {
  return n.toLocaleString("de-DE", { maximumFractionDigits: 2 });
}

export function buildShoppingList(
  dishNames: string[],
  recipes: Recipe[],
  ingredientsByRecipe: Record<number, Ingredient[]>
): ShoppingList {
  // Gleiche Gerichte (z.B. Mittag und Abend) nur einmal berücksichtigen
  const uniqueDishes = new Map<string, string>();
  for (const name of dishNames) {
    const key = dishKey(name);
    if (key && !uniqueDishes.has(key)) uniqueDishes.set(key, name.trim());
  }

  const recipeByKey = new Map<string, Recipe>();
  for (const r of recipes) {
    const key = dishKey(r.name);
    if (!recipeByKey.has(key)) recipeByKey.set(key, r);
  }

  const unmatched: string[] = [];
  // Schlüssel: Zutat (kleingeschrieben) → Summen je Einheit + Rohangaben
  const groups = new Map<
    string,
    { zutat: string; sums: Map<string, { total: number; unit: string }>; raw: Set<string> }
  >();

  for (const [key, displayName] of uniqueDishes) {
    const recipe = recipeByKey.get(key);
    if (!recipe) {
      unmatched.push(displayName);
      continue;
    }
    for (const ing of ingredientsByRecipe[recipe.id] ?? []) {
      const zutat = ing.zutat.trim();
      if (!zutat) continue;
      const groupKey = dishKey(zutat);
      let group = groups.get(groupKey);
      if (!group) {
        group = { zutat, sums: new Map(), raw: new Set() };
        groups.set(groupKey, group);
      }

      const menge = ing.menge.trim();
      if (!menge) continue;
      const match = menge.match(NUMBER_PREFIX);
      if (match) {
        const value = Number(match[1].replace(",", "."));
        const unit = match[2].trim();
        const unitKey = unit.toLocaleLowerCase("de");
        const sum = group.sums.get(unitKey);
        if (sum) sum.total += value;
        else group.sums.set(unitKey, { total: value, unit });
      } else {
        group.raw.add(menge);
      }
    }
  }

  const lines: ShoppingLine[] = [...groups.values()]
    .map((g) => {
      const amounts = [...g.sums.values()].map(({ total, unit }) =>
        [formatNumber(total), unit].filter(Boolean).join(" ")
      );
      amounts.push(...g.raw);
      return { zutat: g.zutat, amounts };
    })
    .sort((a, b) => a.zutat.localeCompare(b.zutat, "de"));

  return { lines, unmatched };
}
