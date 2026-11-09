import { describe, expect, it } from "vitest";
import { filterRecipes, matchRank, nearbyPlans, normalizeSearch, offsetLabel } from "./mealPicker";
import type { Recipe } from "@/lib/recipes/types";

const r = (id: number, name: string, category = "", bemerkung = ""): Recipe => ({ id, name, category, bemerkung });

const recipes = [
  r(1, "Cannelloni mit Spinat", "Pasta"),
  r(2, "Spinatknödel", "Vegetarisch"),
  r(3, "Crème brûlée", "Dessert"),
  r(4, "Linsensuppe", "Suppe", "mit Spinat-Topping"),
];

describe("normalizeSearch", () => {
  it("entfernt Akzente und Großschreibung", () => {
    expect(normalizeSearch("  Crème Brûlée ")).toBe("creme brulee");
  });
});

describe("matchRank", () => {
  it("bewertet Namensanfang vor Wortanfang vor Teilwort vor Kategorie/Bemerkung", () => {
    expect(matchRank(recipes[1], "spin")).toBe(0);
    expect(matchRank(recipes[0], "spin")).toBe(1);
    expect(matchRank(recipes[0], "nell")).toBe(2);
    expect(matchRank(recipes[3], "spin")).toBe(3);
    expect(matchRank(recipes[2], "spin")).toBeNull();
  });

  it("verlangt alle Suchwörter", () => {
    expect(matchRank(recipes[0], "spinat pasta")).toBe(3);
    expect(matchRank(recipes[0], "spinat suppe")).toBeNull();
  });
});

describe("filterRecipes", () => {
  it("sortiert Suchtreffer nach Qualität", () => {
    expect(filterRecipes(recipes, "spin", null).map((x) => x.id)).toEqual([2, 1, 4]);
  });

  it("filtert nach Kategorie, ohne Suche in Originalreihenfolge", () => {
    expect(filterRecipes(recipes, "", "Pasta").map((x) => x.id)).toEqual([1]);
    expect(filterRecipes(recipes, " ", null)).toHaveLength(4);
  });

  it("findet ohne Akzente", () => {
    expect(filterRecipes(recipes, "creme", null).map((x) => x.id)).toEqual([3]);
  });
});

describe("nearbyPlans", () => {
  const stats = {
    count: 2,
    lastDate: "2026-11-10",
    nextDate: "2026-11-20",
    entries: [
      { date: "2026-11-20", type: "dinner" as const },
      { date: "2026-11-18", type: "lunch" as const },
      { date: "2026-11-16", type: "dinner" as const },
      { date: "2026-11-10", type: "lunch" as const },
    ],
  };

  it("liefert andere Termine im Fenster, nächste zuerst, ohne den Tag selbst", () => {
    expect(nearbyPlans(stats, "2026-11-18")).toEqual([
      { date: "2026-11-16", type: "dinner", offset: -2 },
      { date: "2026-11-20", type: "dinner", offset: 2 },
    ]);
  });

  it("offsetLabel", () => {
    expect([offsetLabel(-1), offsetLabel(1), offsetLabel(-3), offsetLabel(2)]).toEqual([
      "am Vortag",
      "am Folgetag",
      "3 Tage vorher",
      "2 Tage später",
    ]);
  });
});
