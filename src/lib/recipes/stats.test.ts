import { describe, expect, it } from "vitest";
import {
  computeDishStats,
  daysBetween,
  findUnlistedDishes,
  pickSuggestion,
  relativeDay,
  sortRecipes,
  statsFor,
} from "./stats";
import { validateIngredients } from "./logic";
import type { Recipe } from "./types";

const TODAY = "2026-11-05";
const r = (id: number, name: string): Recipe => ({ id, name, category: "Pasta", bemerkung: "" });
const meals = [
  { date: "2026-10-01", lunch: "Pommes", dinner: "Brotzeit" },
  { date: "2026-11-01", lunch: " pommes ", dinner: null },
  { date: "2026-11-05", lunch: null, dinner: "Dal" },
  { date: "2026-11-09", lunch: "Pommes", dinner: "Brotzeit" },
];

describe("computeDishStats", () => {
  const stats = computeDishStats(meals, TODAY);
  it("zählt nur Vergangenes, case-/whitespace-insensitiv", () => {
    expect(statsFor(stats, "Pommes")).toMatchObject({
      count: 2,
      lastDate: "2026-11-01",
      nextDate: "2026-11-09",
    });
  });
  it("heute zählt als geplant, nicht als gegessen", () => {
    expect(statsFor(stats, "Dal")).toMatchObject({ count: 0, lastDate: null, nextDate: TODAY });
  });
  it("Einträge neueste zuerst", () => {
    expect(statsFor(stats, "pommes").entries.map((e) => e.date)).toEqual([
      "2026-11-09",
      "2026-11-01",
      "2026-10-01",
    ]);
  });
  it("unbekanntes Gericht: leere Stats", () => {
    expect(statsFor(stats, "Gibts nicht").count).toBe(0);
  });
});

describe("findUnlistedDishes", () => {
  it("liefert Plan-Gerichte ohne Rezept, häufigste zuerst", () => {
    expect(findUnlistedDishes(meals, [r(1, "Pommes")])).toEqual([
      { name: "Brotzeit", count: 2 },
      { name: "Dal", count: 1 },
    ]);
  });
});

describe("relativeDay / daysBetween", () => {
  it("rechnet über Zeitumstellung korrekt", () => expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2));
  it.each([
    ["2026-11-05", "heute"],
    ["2026-11-06", "morgen"],
    ["2026-11-04", "gestern"],
    ["2026-11-01", "vor 4 Tagen"],
    ["2026-10-01", "vor 5 Wochen"],
    ["2026-05-01", "vor 6 Monaten"],
  ])("%s → %s", (date, label) => expect(relativeDay(date, TODAY)).toBe(label));
});

describe("sortRecipes", () => {
  const stats = computeDishStats(meals, TODAY);
  const list = [r(1, "Dal"), r(2, "Pommes"), r(3, "Brotzeit")];
  it("popular", () =>
    expect(sortRecipes(list, stats, "popular").map((x) => x.name)).toEqual(["Pommes", "Brotzeit", "Dal"]));
  it("forgotten: nie gekocht zuerst", () =>
    expect(sortRecipes(list, stats, "forgotten").map((x) => x.name)).toEqual(["Dal", "Brotzeit", "Pommes"]));
  it("recent", () =>
    expect(sortRecipes(list, stats, "recent").map((x) => x.name)).toEqual(["Pommes", "Brotzeit", "Dal"]));
});

describe("pickSuggestion", () => {
  const stats = computeDishStats(meals, TODAY);
  it("überspringt Gerichte, die in den nächsten 7 Tagen geplant sind", () => {
    const list = [r(1, "Pommes"), r(2, "Dal"), r(3, "Lasagne")];
    for (const roll of [0, 0.5, 0.99]) expect(pickSuggestion(list, stats, TODAY, () => roll)?.name).toBe("Lasagne");
  });
  it("excludeId würfelt ein anderes Gericht", () => {
    const list = [r(3, "Lasagne"), r(4, "Curry")];
    expect(pickSuggestion(list, stats, TODAY, () => 0, 3)?.name).toBe("Curry");
  });
  it("leere Liste → null", () => expect(pickSuggestion([], stats, TODAY)).toBeNull());
});

describe("validateIngredients", () => {
  it("trimmt, verwirft leere Zeilen, nummeriert neu", () =>
    expect(
      validateIngredients([
        { id: 4, zutat: " Mehl ", menge: " 200g ", taetigkeit: "" },
        { zutat: "", menge: "", taetigkeit: " " },
        { zutat: "Ei", menge: "2", taetigkeit: "verquirlen" },
      ])
    ).toEqual({
      ok: true,
      value: [
        { id: 4, zutat: "Mehl", menge: "200g", taetigkeit: "", sort_order: 0 },
        { zutat: "Ei", menge: "2", taetigkeit: "verquirlen", sort_order: 1 },
      ],
    }));
  it("Menge ohne Zutat ist Fehler", () =>
    expect(validateIngredients([{ zutat: " ", menge: "1 EL", taetigkeit: "" }])).toEqual({
      ok: false,
      error: "Zutat fehlt in Zeile 1.",
    }));
});
