import { describe, expect, it } from "vitest";
import { buildShoppingList, type PlannedDish } from "./shoppingList";
import type { Ingredient, Recipe } from "./types";

const recipe = (id: number, name: string): Recipe => ({ id, name, category: "", bemerkung: "" });
const ing = (recipe_id: number, zutat: string, menge: string): Ingredient => ({
  id: recipe_id * 100 + zutat.length + menge.length,
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

const recipes = [recipe(1, "Linsen-Curry"), recipe(2, "Pasta")];
const ingredients = {
  1: [ing(1, "Linsen", "200 g"), ing(1, "Kokosmilch", "1 Dose"), ing(1, "Zwiebel", "2")],
  2: [ing(2, "Zwiebel", "1"), ing(2, "Linsen", "100 g"), ing(2, "Parmesan", "")],
};

describe("buildShoppingList", () => {
  it("addiert gleiche Zutaten mit gleicher Einheit über Gerichte hinweg", () => {
    const list = buildShoppingList(
      [plan("Linsen-Curry", "2026-11-10"), plan("Pasta", "2026-11-11")],
      recipes,
      ingredients
    );
    expect(list.lines.find((l) => l.zutat === "Linsen")?.amounts).toEqual(["300 g"]);
    expect(list.lines.find((l) => l.zutat === "Zwiebel")?.amounts).toEqual(["3"]);
  });

  it("rechnet ein Gericht, das zweimal geplant ist, nur einmal in die Menge", () => {
    const list = buildShoppingList(
      [plan("Pasta", "2026-11-10"), plan("pasta ", "2026-11-12", "lunch")],
      recipes,
      ingredients
    );
    expect(list.lines.find((l) => l.zutat === "Zwiebel")?.amounts).toEqual(["1"]);
  });

  it("listet pro Zutat alle Gerichte mit ihren Terminen", () => {
    const list = buildShoppingList(
      [
        plan("Pasta", "2026-11-12", "lunch"),
        plan("Linsen-Curry", "2026-11-10"),
        plan("Pasta", "2026-11-10", "dinner"),
      ],
      recipes,
      ingredients
    );
    const linsen = list.lines.find((l) => l.zutat === "Linsen");
    expect(linsen?.sources).toEqual([
      {
        dish: "Linsen-Curry",
        slots: [{ date: "2026-11-10", type: "dinner" }],
      },
      {
        dish: "Pasta",
        slots: [
          { date: "2026-11-10", type: "dinner" },
          { date: "2026-11-12", type: "lunch" },
        ],
      },
    ]);
    // Kokosmilch kommt nur aus einem Gericht
    expect(list.lines.find((l) => l.zutat === "Kokosmilch")?.sources).toHaveLength(1);
  });

  it("Gerichte ohne Rezept landen in unmatched", () => {
    const list = buildShoppingList(
      [plan("Pizza", "2026-11-10"), plan("Pasta", "2026-11-11")],
      recipes,
      ingredients
    );
    expect(list.unmatched).toEqual(["Pizza"]);
  });

  it("Mengen ohne Zahl bleiben als eigene Angabe erhalten", () => {
    const list = buildShoppingList([plan("Linsen-Curry", "2026-11-10")], recipes, {
      1: [ing(1, "Salz", "etwas"), ing(1, "Salz", "1 Prise")],
    });
    expect(list.lines[0].amounts).toEqual(["1 Prise", "etwas"]);
  });

  it("sortiert alphabetisch und versteht Dezimalkommas", () => {
    const list = buildShoppingList([plan("Pasta", "2026-11-10")], recipes, {
      2: [ing(2, "Milch", "0,5 l"), ing(2, "Butter", "1,25 kg")],
    });
    expect(list.lines.map((l) => l.zutat)).toEqual(["Butter", "Milch"]);
    expect(list.lines[1].amounts).toEqual(["0,5 l"]);
    expect(list.lines[0].amounts).toEqual(["1,25 kg"]);
  });
});
