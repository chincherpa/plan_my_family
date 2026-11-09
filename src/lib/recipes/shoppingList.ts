// Einkaufszettel: fasst die Zutaten mehrerer geplanter Gerichte zusammen.
// Mengen sind Freitext („2“, „200 g“, „1 Dose“). Zahlen mit gleicher Einheit werden addiert,
// alles andere wird als eigene Angabe nebeneinander gelistet.

import { dishKey } from "./stats";
import type { Ingredient, Recipe } from "./types";

/** Ein Essensplan-Eintrag: welches Gericht, an welchem Tag, zu welcher Mahlzeit. */
export type PlannedDish = {
  name: string;
  /** YYYY-MM-DD */
  date: string;
  type: "lunch" | "dinner";
};

/** Ein Gericht, das eine Zutat braucht, mit allen Terminen, an denen es geplant ist. */
export type ShoppingSource = {
  dish: string;
  slots: { date: string; type: "lunch" | "dinner" }[];
};

export type ShoppingLine = {
  zutat: string;
  /** Zusammengefasste Mengen, z.B. ["400 g", "1 Dose"] */
  amounts: string[];
  sources: ShoppingSource[];
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
  planned: PlannedDish[],
  recipes: Recipe[],
  ingredientsByRecipe: Record<number, Ingredient[]>
): ShoppingList {
  const recipeByKey = new Map<string, Recipe>();
  for (const r of recipes) {
    const key = dishKey(r.name);
    if (!recipeByKey.has(key)) recipeByKey.set(key, r);
  }

  // Termine je Gericht sammeln (Mittag und Abend bzw. mehrere Tage bleiben alle sichtbar)
  const slotsByDish = new Map<string, { name: string; slots: ShoppingSource["slots"] }>();
  for (const p of planned) {
    const key = dishKey(p.name);
    if (!key) continue;
    const entry = slotsByDish.get(key) ?? { name: p.name.trim(), slots: [] };
    entry.slots.push({ date: p.date, type: p.type });
    slotsByDish.set(key, entry);
  }

  const unmatched: string[] = [];
  // Schlüssel: Zutat (kleingeschrieben) → Summen je Einheit, Rohangaben und Quellgerichte
  const groups = new Map<
    string,
    {
      zutat: string;
      sums: Map<string, { total: number; unit: string }>;
      raw: Set<string>;
      sources: Map<string, ShoppingSource>;
    }
  >();

  for (const [key, { name, slots }] of slotsByDish) {
    const recipe = recipeByKey.get(key);
    if (!recipe) {
      unmatched.push(name);
      continue;
    }
    // Gericht wird einmal in die Menge eingerechnet, die Termine stehen in den Quellen
    for (const ing of ingredientsByRecipe[recipe.id] ?? []) {
      const zutat = ing.zutat.trim();
      if (!zutat) continue;
      const groupKey = dishKey(zutat);
      let group = groups.get(groupKey);
      if (!group) {
        group = { zutat, sums: new Map(), raw: new Set(), sources: new Map() };
        groups.set(groupKey, group);
      }
      if (!group.sources.has(key)) {
        group.sources.set(key, { dish: name, slots: [...slots].sort(bySlot) });
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
      return {
        zutat: g.zutat,
        amounts,
        sources: [...g.sources.values()].sort((a, b) => a.dish.localeCompare(b.dish, "de")),
      };
    })
    .sort((a, b) => a.zutat.localeCompare(b.zutat, "de"));

  return { lines, unmatched };
}

function bySlot(a: ShoppingSource["slots"][number], b: ShoppingSource["slots"][number]): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.type === b.type ? 0 : a.type === "lunch" ? -1 : 1;
}
