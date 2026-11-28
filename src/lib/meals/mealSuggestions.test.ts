import { describe, expect, it } from "vitest";
import { buildPlannerPrompt, pickLocalOption, resolveSuggestions, type SuggestSlot } from "./mealSuggestions";
import { computeDishStats } from "@/lib/recipes/stats";
import type { Recipe } from "@/lib/recipes/types";

const TODAY = "2026-11-30"; // Montag
const r = (id: number, name: string, category = "Pasta", bemerkung = ""): Recipe => ({ id, name, category, bemerkung });
const recipes = [
  r(1, "Spaghetti Bolognese"),
  r(2, "Lasagne"),
  r(3, "Fischstäbchen", "Fisch"),
  r(4, "Lachs mit Reis", "Fisch"),
  r(5, "Linsensuppe", "Suppe", "schnell"),
];
const meals = [
  { date: "2026-11-20", lunch: "Lasagne", dinner: null },
  { date: "2026-12-02", lunch: "Linsensuppe", dinner: null },
];
const slots: SuggestSlot[] = [
  { date: "2026-12-01", type: "lunch" },
  { date: "2026-12-04", type: "dinner" },
];
const fixed = () => 0;

describe("buildPlannerPrompt", () => {
  const prompt = buildPlannerPrompt({ recipes, meals, slots, weekdayCategories: { "5": "Fisch" }, todayStr: TODAY });
  it("listet Gerichte mit ID, Statistik und Bemerkung", () => {
    expect(prompt).toContain("2 | Lasagne | Pasta | 1× | zuletzt vor 10 Tagen");
    expect(prompt).toContain("1 | Spaghetti Bolognese | Pasta | 0× | noch nie gegessen");
    expect(prompt).toContain("| schnell");
  });
  it("nennt Geplantes im Umfeld und die Wochentag-Kategorie", () => {
    expect(prompt).toContain("2026-12-02 (Mittwoch): Mittag: Linsensuppe");
    expect(prompt).toContain("1 | 2026-12-04 (Freitag) | Abend | Wochentag-Kategorie: Fisch");
  });
});

describe("resolveSuggestions", () => {
  const base = { slots, recipes, meals, weekdayCategories: {}, todayStr: TODAY, random: fixed };

  it("übernimmt Claudes Auswahl, verwirft unbekannte IDs und füllt auf", () => {
    const result = resolveSuggestions({
      ...base,
      ai: {
        suggestions: [
          { slot: 0, options: [{ recipe_id: 99, reason: "x" }, { recipe_id: 1, reason: "lange nicht" }] },
          { slot: 1, options: [{ recipe_id: 3, reason: "Fisch-Freitag" }, { recipe_id: 3, reason: "doppelt" }] },
        ],
      },
    });
    expect(result[0].options[0]).toEqual({ name: "Spaghetti Bolognese", category: "Pasta", reason: "lange nicht" });
    expect(result[1].options[0].name).toBe("Fischstäbchen");
    for (const s of result) {
      expect(s.options).toHaveLength(3);
      expect(new Set(s.options.map((o) => o.name)).size).toBe(3);
    }
  });

  it("dieselbe Empfehlung nicht in zwei Plätzen", () => {
    const result = resolveSuggestions({
      ...base,
      ai: {
        suggestions: [
          { slot: 0, options: [{ recipe_id: 1, reason: "a" }] },
          { slot: 1, options: [{ recipe_id: 1, reason: "a" }, { recipe_id: 2, reason: "b" }] },
        ],
      },
    });
    expect(result[0].options[0].name).toBe("Spaghetti Bolognese");
    expect(result[1].options[0].name).toBe("Lasagne");
    expect(result[1].options[1].name).toBe("Spaghetti Bolognese");
  });

  it("ohne Claude lokal, bevorzugt die Wochentag-Kategorie", () => {
    const result = resolveSuggestions({ ...base, ai: null, weekdayCategories: { "5": "fisch" } });
    expect(result[1].options.slice(0, 2).map((o) => o.category)).toEqual(["Fisch", "Fisch"]);
    expect(result[0].options[0].name).not.toBe(result[1].options[0].name);
  });
});

describe("pickLocalOption", () => {
  it("liefert null, wenn alles ausgeschlossen ist", () => {
    expect(
      pickLocalOption({
        recipes,
        stats: computeDishStats(meals, TODAY),
        todayStr: TODAY,
        category: null,
        exclude: new Set(recipes.map((x) => x.name.toLocaleLowerCase("de"))),
      })
    ).toBeNull();
  });
});
