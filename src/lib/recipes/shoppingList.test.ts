import { describe, expect, it } from "vitest";
import {
  buildShoppingList,
  ingredientLines,
  sumAmounts,
  weekStartOf,
  type PlannedDish,
} from "./shoppingList";
import type { Ingredient, Recipe } from "./types";

const recipe = (id: number, name: string): Recipe => ({ id, name, category: "", bemerkung: "" });
let ingId = 0;
const ing = (recipe_id: number, zutat: string, menge: string): Ingredient => ({
  id: ++ingId,
  recipe_id,
  zutat,
  menge,
  taetigkeit: "",
  sort_order: 0,
});
const plan = (name: string, date: string, type: "lunch" | "dinner" = "dinner"): PlannedDish => ({
  name,
  date,
  type,
});

const recipes = [recipe(1, "Linsen-Curry"), recipe(2, "Pasta"), recipe(3, "Salat")];
const ingredients = {
  1: [ing(1, "Linsen", "200 g"), ing(1, "Kokosmilch", "1 Dose"), ing(1, "Zwiebel", "2")],
  2: [ing(2, "Zwiebel", "1"), ing(2, "Linsen", "100 g"), ing(2, "Parmesan", "")],
  3: [],
};

describe("buildShoppingList", () => {
  it("gliedert nach Gericht, chronologisch nach erstem Termin", () => {
    const list = buildShoppingList(
      [plan("Pasta", "2026-11-12"), plan("Linsen-Curry", "2026-11-10")],
      recipes,
      ingredients
    );
    expect(list.dishes.map((d) => d.dish)).toEqual(["Linsen-Curry", "Pasta"]);
    expect(list.dishes[0].items.map((i) => [i.zutat, i.menge])).toEqual([
      ["Linsen", "200 g"],
      ["Kokosmilch", "1 Dose"],
      ["Zwiebel", "2"],
    ]);
  });

  it("führt ein mehrfach geplantes Gericht einmal, mit allen Terminen", () => {
    const list = buildShoppingList(
      [plan("Pasta", "2026-11-12", "lunch"), plan("pasta ", "2026-11-10")],
      recipes,
      ingredients
    );
    expect(list.dishes).toHaveLength(1);
    expect(list.dishes[0].slots).toEqual([
      { date: "2026-11-10", type: "dinner" },
      { date: "2026-11-12", type: "lunch" },
    ]);
  });

  it("vergibt stabile Schlüssel je Gericht und Zutat", () => {
    const list = buildShoppingList([plan("Linsen-Curry", "2026-11-10")], recipes, {
      1: [ing(1, " Zwiebel ", "1"), ing(1, "zwiebel", "1")],
    });
    expect(list.dishes[0].items.map((i) => i.key)).toEqual([
      "linsen-curry|zwiebel",
      "linsen-curry|zwiebel#2",
    ]);
  });

  it("Gericht ohne Zutaten bleibt sichtbar, ohne Rezept landet es in unmatched", () => {
    const list = buildShoppingList(
      [plan("Pizza", "2026-11-11"), plan("Salat", "2026-11-10")],
      recipes,
      ingredients
    );
    expect(list.dishes.map((d) => [d.dish, d.items.length])).toEqual([["Salat", 0]]);
    expect(list.unmatched).toEqual(["Pizza"]);
  });
});

describe("ingredientLines", () => {
  const list = buildShoppingList(
    [plan("Pasta", "2026-11-12", "lunch"), plan("Linsen-Curry", "2026-11-10"), plan("Pasta", "2026-11-13")],
    recipes,
    ingredients
  );
  const lines = ingredientLines(list);

  it("sortiert alphabetisch nach Zutat und summiert die Mengen", () => {
    expect(lines.map((l) => [l.zutat, l.amounts])).toEqual([
      ["Kokosmilch", ["1 Dose"]],
      ["Linsen", ["300 g"]],
      ["Parmesan", []],
      ["Zwiebel", ["3"]],
    ]);
  });

  it("listet je Zutat die Gerichte mit Menge und Terminen, chronologisch", () => {
    expect(lines.find((l) => l.zutat === "Zwiebel")?.uses).toEqual([
      { dish: "Linsen-Curry", amounts: ["2"], slots: [{ date: "2026-11-10", type: "dinner" }] },
      {
        dish: "Pasta",
        amounts: ["1"],
        slots: [
          { date: "2026-11-12", type: "lunch" },
          { date: "2026-11-13", type: "dinner" },
        ],
      },
    ]);
  });

  it("Schlüssel hängt nur an der Zutat, auch bei kurzen Namen gültig", () => {
    const short = ingredientLines(
      buildShoppingList([plan("Pasta", "2026-11-10")], recipes, { 2: [ing(2, "Ei", "2")] })
    );
    expect(short[0].key).toBe("z|ei");
  });
});

describe("sumAmounts", () => {
  it("addiert gleiche Einheiten, behält Freitext", () => {
    expect(sumAmounts(["200 g", "100 G", "1 Dose", "etwas", ""])).toEqual(["300 g", "1 Dose", "etwas"]);
  });
  it("versteht Dezimalkommas", () => {
    expect(sumAmounts(["0,5 l", "0,25 l"])).toEqual(["0,75 l"]);
  });
});

describe("weekStartOf", () => {
  it("liefert den Montag", () => {
    expect(weekStartOf(new Date(2026, 10, 9))).toBe("2026-11-09"); // Montag
    expect(weekStartOf(new Date(2026, 10, 15))).toBe("2026-11-09"); // Sonntag
    expect(weekStartOf(new Date(2026, 10, 16))).toBe("2026-11-16");
  });
});
