import { describe, expect, it } from "vitest";
import { buildShoppingList } from "./shoppingList";
import type { Ingredient, Recipe } from "./types";

const recipe = (id: number, name: string): Recipe => ({ id, name, category: "", bemerkung: "" });
const ing = (recipe_id: number, zutat: string, menge: string): Ingredient => ({
  id: Math.random(),
  recipe_id,
  zutat,
  menge,
  taetigkeit: "",
  sort_order: 0,
});

const recipes = [recipe(1, "Linsen-Curry"), recipe(2, "Pasta")];
const ingredients = {
  1: [ing(1, "Linsen", "200 g"), ing(1, "Kokosmilch", "1 Dose"), ing(1, "Zwiebel", "2")],
  2: [ing(2, "Zwiebel", "1"), ing(2, "Linsen", "100 g"), ing(2, "Parmesan", "")],
};

describe("buildShoppingList", () => {
  it("addiert gleiche Zutaten mit gleicher Einheit über Gerichte hinweg", () => {
    const list = buildShoppingList(["Linsen-Curry", "Pasta"], recipes, ingredients);
    const linsen = list.lines.find((l) => l.zutat === "Linsen");
    expect(linsen?.amounts).toEqual(["300 g"]);
    const zwiebel = list.lines.find((l) => l.zutat === "Zwiebel");
    expect(zwiebel?.amounts).toEqual(["3"]);
  });

  it("zählt gleiche Gerichte (Mittag und Abend) nur einmal", () => {
    const list = buildShoppingList(["Pasta", "pasta "], recipes, ingredients);
    expect(list.lines.find((l) => l.zutat === "Zwiebel")?.amounts).toEqual(["1"]);
  });

  it("Gerichte ohne Rezept landen in unmatched", () => {
    const list = buildShoppingList(["Pizza", "Pasta"], recipes, ingredients);
    expect(list.unmatched).toEqual(["Pizza"]);
  });

  it("Mengen ohne Zahl bleiben als eigene Angabe erhalten", () => {
    const list = buildShoppingList(["Linsen-Curry"], recipes, {
      1: [ing(1, "Salz", "etwas"), ing(1, "Salz", "1 Prise")],
    });
    expect(list.lines[0].amounts).toEqual(["1 Prise", "etwas"]);
  });

  it("sortiert alphabetisch und versteht Dezimalkommas", () => {
    const list = buildShoppingList(["Pasta"], recipes, {
      2: [ing(2, "Milch", "0,5 l"), ing(2, "Butter", "1,25 kg")],
    });
    expect(list.lines.map((l) => l.zutat)).toEqual(["Butter", "Milch"]);
    expect(list.lines[1].amounts).toEqual(["0,5 l"]);
    expect(list.lines[0].amounts).toEqual(["1,25 kg"]);
  });
});
