// Einkaufszettel: Zutaten der geplanten Gerichte einer Woche, alphabetisch nach Zutat.
// buildShoppingList ordnet die Zutaten zuerst den Gerichten zu, ingredientLines fasst sie
// dann je Zutat zusammen. Mengen sind Freitext („2“, „200 g“, „1 Dose“): Zahlen mit gleicher
// Einheit werden addiert, alles andere steht nebeneinander.

import { localDateStr } from "@/lib/utils";
import { dishKey } from "./stats";
import type { Ingredient, Recipe } from "./types";

type MealType = "lunch" | "dinner";

/** Ein Essensplan-Eintrag: welches Gericht, an welchem Tag, zu welcher Mahlzeit. */
export type PlannedDish = {
  name: string;
  /** YYYY-MM-DD */
  date: string;
  type: MealType;
};

export type Slot = { date: string; type: MealType };

export type ShoppingItem = {
  /** Schlüssel für den gespeicherten Abhak-Status: "<gericht>|<zutat>" */
  key: string;
  /** dishKey(zutat) – verbindet gleiche Zutaten verschiedener Gerichte */
  zutatKey: string;
  zutat: string;
  menge: string;
};

export type ShoppingDish = {
  key: string;
  dish: string;
  slots: Slot[];
  items: ShoppingItem[];
};

export type ShoppingList = {
  /** Chronologisch nach erstem Termin */
  dishes: ShoppingDish[];
  /** Geplante Gerichte ohne passendes Rezept – haben keine Zutaten */
  unmatched: string[];
};

/** Montag der Woche von `date` als "YYYY-MM-DD" (lokale Zeit). */
export function weekStartOf(date: Date): string {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return localDateStr(monday);
}

function bySlot(a: Slot, b: Slot): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.type === b.type ? 0 : a.type === "lunch" ? -1 : 1;
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

  // Gleiches Gericht an mehreren Terminen erscheint einmal, mit allen Terminen
  const byDish = new Map<string, { name: string; slots: Slot[] }>();
  for (const p of planned) {
    const key = dishKey(p.name);
    if (!key) continue;
    const entry = byDish.get(key) ?? { name: p.name.trim(), slots: [] };
    entry.slots.push({ date: p.date, type: p.type });
    byDish.set(key, entry);
  }

  const dishes: ShoppingDish[] = [];
  const unmatched: { name: string; first: Slot }[] = [];

  for (const [key, { name, slots }] of byDish) {
    slots.sort(bySlot);
    const recipe = recipeByKey.get(key);
    if (!recipe) {
      unmatched.push({ name, first: slots[0] });
      continue;
    }
    const seen = new Map<string, number>();
    const items: ShoppingItem[] = [];
    for (const ing of ingredientsByRecipe[recipe.id] ?? []) {
      const zutat = ing.zutat.trim();
      if (!zutat) continue;
      const zutatKey = dishKey(zutat);
      // Doppelte Zutat im selben Rezept bekommt einen eigenen Haken
      const n = (seen.get(zutatKey) ?? 0) + 1;
      seen.set(zutatKey, n);
      items.push({
        key: `${key}|${zutatKey}${n > 1 ? `#${n}` : ""}`,
        zutatKey,
        zutat,
        menge: ing.menge.trim(),
      });
    }
    dishes.push({ key, dish: name, slots, items });
  }

  dishes.sort((a, b) => bySlot(a.slots[0], b.slots[0]));
  unmatched.sort((a, b) => bySlot(a.first, b.first));
  return { dishes, unmatched: unmatched.map((u) => u.name) };
}

/** Eine Zeile des Einkaufszettels: eine Zutat, zusammengefasst über alle Gerichte. */
export type IngredientLine = {
  /** Schlüssel für den gespeicherten Abhak-Status: "z|<zutat>" */
  key: string;
  zutat: string;
  /** Gesamtmenge, z.B. ["300 g", "1 Dose"] */
  amounts: string[];
  /** Gerichte, die diese Zutat brauchen, chronologisch nach erstem Termin */
  uses: { dish: string; amounts: string[]; slots: Slot[] }[];
};

/** Einkaufszettel alphabetisch nach Zutat; gleiche Zutaten verschiedener Gerichte in einer Zeile. */
export function ingredientLines(list: ShoppingList): IngredientLine[] {
  type Use = { dish: string; mengen: string[]; slots: Slot[] };
  type Group = { zutat: string; mengen: string[]; uses: Map<string, Use> };
  const byZutat = new Map<string, Group>();
  for (const d of list.dishes) {
    for (const item of d.items) {
      const line: Group = byZutat.get(item.zutatKey) ?? { zutat: item.zutat, mengen: [], uses: new Map() };
      line.mengen.push(item.menge);
      const use: Use = line.uses.get(d.key) ?? { dish: d.dish, mengen: [], slots: d.slots };
      use.mengen.push(item.menge);
      line.uses.set(d.key, use);
      byZutat.set(item.zutatKey, line);
    }
  }
  return [...byZutat.entries()]
    .map(([zutatKey, l]) => ({
      key: `z|${zutatKey}`,
      zutat: l.zutat,
      amounts: sumAmounts(l.mengen),
      uses: [...l.uses.values()]
        .sort((a, b) => bySlot(a.slots[0], b.slots[0]))
        .map((u) => ({ dish: u.dish, amounts: sumAmounts(u.mengen), slots: u.slots })),
    }))
    .sort((a, b) => a.zutat.localeCompare(b.zutat, "de"));
}

const NUMBER_PREFIX = /^(\d+(?:[.,]\d+)?)\s*(.*)$/;

/** Fasst Freitext-Mengen zusammen: ["200 g", "100 g", "1 Dose"] → ["300 g", "1 Dose"]. */
export function sumAmounts(mengen: string[]): string[] {
  const sums = new Map<string, { total: number; unit: string }>();
  const raw = new Set<string>();
  for (const m of mengen) {
    const menge = m.trim();
    if (!menge) continue;
    const match = menge.match(NUMBER_PREFIX);
    if (!match) {
      raw.add(menge);
      continue;
    }
    const value = Number(match[1].replace(",", "."));
    const unit = match[2].trim();
    const unitKey = unit.toLocaleLowerCase("de");
    const sum = sums.get(unitKey);
    if (sum) sum.total += value;
    else sums.set(unitKey, { total: value, unit });
  }
  return [
    ...[...sums.values()].map(({ total, unit }) =>
      [total.toLocaleString("de-DE", { maximumFractionDigits: 2 }), unit].filter(Boolean).join(" ")
    ),
    ...raw,
  ];
}
