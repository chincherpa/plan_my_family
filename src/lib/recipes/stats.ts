import type { Recipe, RecipeCategory } from "./types";

// Auswertung des Essensplans pro Gericht. meals.lunch/dinner sind Freitext, deshalb
// werden Gerichte über den getrimmten, kleingeschriebenen Namen zugeordnet.

export type MealType = "lunch" | "dinner";

type PlanRow = { date: string; lunch: string | null; dinner: string | null };

export type DishStats = {
  /** Wie oft vor heute im Plan stand */
  count: number;
  /** Letztes Datum vor heute */
  lastDate: string | null;
  /** Nächstes Datum ab heute */
  nextDate: string | null;
  /** Alle Einträge, neueste zuerst */
  entries: { date: string; type: MealType }[];
};

export type SortMode = "name" | "recent" | "popular" | "forgotten";

export function dishKey(name: string): string {
  return name.trim().toLocaleLowerCase("de");
}

export function computeDishStats(meals: PlanRow[], todayStr: string): Map<string, DishStats> {
  const stats = new Map<string, DishStats>();
  for (const meal of meals) {
    for (const type of ["lunch", "dinner"] as const) {
      const dish = meal[type];
      if (!dish?.trim()) continue;
      const key = dishKey(dish);
      let s = stats.get(key);
      if (!s) {
        s = { count: 0, lastDate: null, nextDate: null, entries: [] };
        stats.set(key, s);
      }
      s.entries.push({ date: meal.date, type });
      if (meal.date < todayStr) {
        s.count++;
        if (!s.lastDate || meal.date > s.lastDate) s.lastDate = meal.date;
      } else if (!s.nextDate || meal.date < s.nextDate) {
        s.nextDate = meal.date;
      }
    }
  }
  for (const s of stats.values()) {
    s.entries.sort((a, b) => b.date.localeCompare(a.date) || a.type.localeCompare(b.type));
  }
  return stats;
}

/** Gerichte, die im Plan stehen, aber in der Rezeptliste fehlen. Häufigste zuerst. */
export function findUnlistedDishes(
  meals: PlanRow[],
  recipes: Recipe[]
): { name: string; count: number }[] {
  const known = new Set(recipes.map((r) => dishKey(r.name)));
  const found = new Map<string, { name: string; count: number; latest: string }>();
  for (const meal of meals) {
    for (const dish of [meal.lunch, meal.dinner]) {
      if (!dish?.trim()) continue;
      const key = dishKey(dish);
      if (known.has(key)) continue;
      const entry = found.get(key);
      if (!entry) found.set(key, { name: dish.trim(), count: 1, latest: meal.date });
      else {
        entry.count++;
        // Schreibweise des jüngsten Eintrags gewinnt
        if (meal.date > entry.latest) {
          entry.name = dish.trim();
          entry.latest = meal.date;
        }
      }
    }
  }
  return [...found.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "de"))
    .map(({ name, count }) => ({ name, count }));
}

/** Ganze Tage von a nach b (beide "YYYY-MM-DD"). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function relativeDay(dateStr: string, todayStr: string): string {
  const d = daysBetween(todayStr, dateStr);
  if (d === 0) return "heute";
  if (d === 1) return "morgen";
  if (d === -1) return "gestern";
  const abs = Math.abs(d);
  const unit =
    abs < 14 ? `${abs} Tagen` : abs < 60 ? `${Math.round(abs / 7)} Wochen` : `${Math.round(abs / 30)} Monaten`;
  return d > 0 ? `in ${unit}` : `vor ${unit}`;
}

const EMPTY: DishStats = { count: 0, lastDate: null, nextDate: null, entries: [] };

export function statsFor(stats: Map<string, DishStats>, name: string): DishStats {
  return stats.get(dishKey(name)) ?? EMPTY;
}

export function sortRecipes(
  recipes: Recipe[],
  stats: Map<string, DishStats>,
  mode: SortMode
): Recipe[] {
  const byName = (a: Recipe, b: Recipe) => a.name.localeCompare(b.name, "de");
  const last = (r: Recipe) => statsFor(stats, r.name).lastDate;
  return [...recipes].sort((a, b) => {
    switch (mode) {
      case "popular":
        return statsFor(stats, b.name).count - statsFor(stats, a.name).count || byName(a, b);
      case "recent": {
        const la = last(a) ?? "";
        const lb = last(b) ?? "";
        return lb.localeCompare(la) || byName(a, b);
      }
      case "forgotten": {
        // Nie gekocht zuerst, dann am längsten her
        const la = last(a) ?? "";
        const lb = last(b) ?? "";
        return la.localeCompare(lb) || byName(a, b);
      }
      default:
        return byName(a, b);
    }
  });
}

/**
 * Zufallsvorschlag, gewichtet nach „wie lange nicht gegessen“. Gerichte, die in den
 * nächsten 7 Tagen schon geplant sind, fallen raus (außer es bleibt sonst nichts).
 */
export function pickSuggestion(
  recipes: Recipe[],
  stats: Map<string, DishStats>,
  todayStr: string,
  random: () => number = Math.random,
  excludeId?: number
): Recipe | null {
  const notPlannedSoon = recipes.filter((r) => {
    const next = statsFor(stats, r.name).nextDate;
    return !next || daysBetween(todayStr, next) > 7;
  });
  let pool = notPlannedSoon.length > 0 ? notPlannedSoon : recipes;
  if (excludeId !== undefined && pool.length > 1) pool = pool.filter((r) => r.id !== excludeId);
  if (pool.length === 0) return null;

  const weights = pool.map((r) => {
    const lastDate = statsFor(stats, r.name).lastDate;
    return lastDate ? Math.min(daysBetween(lastDate, todayStr), 60) + 1 : 45;
  });
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = random() * total;
  for (const [i, w] of weights.entries()) {
    roll -= w;
    if (roll < 0) return pool[i];
  }
  return pool[pool.length - 1];
}

const ICON_EMOJI: Record<string, string> = {
  potato: "🥔",
  pasta: "🍝",
  casserole: "🥘",
  beans: "🫘",
  salad: "🥗",
  soup: "🍲",
  pizza: "🍕",
  burger: "🍔",
  fish: "🐟",
  meat: "🍖",
  rice: "🍚",
  cake: "🍰",
  dessert: "🍮",
};

/** Wählbare Kategorie-Icons (id wie in der Rezepte-App) mit Emoji-Darstellung. */
export const CATEGORY_ICONS = Object.entries(ICON_EMOJI).map(([id, emoji]) => ({ id, emoji }));

/** Farbpalette der Rezepte-App für Kategorien. */
export const CATEGORY_COLORS = [
  "#D97706",
  "#DC2626",
  "#7C3AED",
  "#059669",
  "#0891B2",
  "#65A30D",
  "#DB2777",
  "#2563EB",
  "#EA580C",
  "#4F46E5",
];

export function categoryEmoji(category: RecipeCategory | undefined): string {
  return (category && ICON_EMOJI[category.icon]) ?? "🍽️";
}

/** Neutrale Farbe für Kategorien ohne Eintrag in categories (z.B. „Sonstiges“). */
export const FALLBACK_CATEGORY_COLOR = "#8b8d98";
