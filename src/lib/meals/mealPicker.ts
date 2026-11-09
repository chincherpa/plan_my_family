import { daysBetween, type DishStats, type MealType } from "@/lib/recipes/stats";
import type { Recipe } from "@/lib/recipes/types";

/** Kleinbuchstaben ohne Akzente, damit „creme“ auch „Crème“ findet. */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("de")
    .trim();
}

/**
 * Trefferqualität für die Suche: 0 = Name beginnt mit der Suche, 1 = ein Wort im Namen beginnt
 * damit, 2 = irgendwo im Namen, 3 = nur in Kategorie/Bemerkung, null = kein Treffer.
 * Mehrere Suchwörter müssen alle vorkommen; die schlechteste Wertung zählt.
 */
export function matchRank(recipe: Recipe, query: string): number | null {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  const name = normalizeSearch(recipe.name);
  const rest = normalizeSearch(`${recipe.category} ${recipe.bemerkung}`);
  let worst = 0;
  for (const w of words) {
    let rank: number;
    if (name.startsWith(w)) rank = 0;
    else if (name.split(/[\s\-–,]+/).some((part) => part.startsWith(w))) rank = 1;
    else if (name.includes(w)) rank = 2;
    else if (rest.includes(w)) rank = 3;
    else return null;
    worst = Math.max(worst, rank);
  }
  return worst;
}

/** Filtert nach Kategorie und Suche. Mit Suche: beste Treffer zuerst, sonst Reihenfolge von `recipes`. */
export function filterRecipes(recipes: Recipe[], query: string, category: string | null): Recipe[] {
  const inCategory = category === null ? recipes : recipes.filter((r) => r.category === category);
  if (!query.trim()) return inCategory;
  return inCategory
    .map((recipe, index) => ({ recipe, index, rank: matchRank(recipe, query) }))
    .filter((e): e is { recipe: Recipe; index: number; rank: number } => e.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((e) => e.recipe);
}

/** Andere Termine desselben Gerichts innerhalb von ±`window` Tagen um `date` (der Tag selbst zählt nicht). */
export function nearbyPlans(
  stats: DishStats,
  date: string,
  window = 3
): { date: string; type: MealType; offset: number }[] {
  return stats.entries
    .map((e) => ({ ...e, offset: daysBetween(date, e.date) }))
    .filter((e) => e.offset !== 0 && Math.abs(e.offset) <= window)
    .sort((a, b) => Math.abs(a.offset) - Math.abs(b.offset) || a.offset - b.offset);
}

/** „gestern“, „übermorgen“, „in 3 Tagen“ – relativ zum bearbeiteten Tag, nicht zu heute. */
export function offsetLabel(offset: number): string {
  if (offset === -1) return "am Vortag";
  if (offset === 1) return "am Folgetag";
  return offset < 0 ? `${-offset} Tage vorher` : `${offset} Tage später`;
}
