import { describe, expect, it } from "vitest";
import { buildCategoryOptions, toMealOptions, validateRecipeInput } from "./logic";

describe("validateRecipeInput", () => {
  const existing = [{ id: 1, name: "Kartoffelsalat", category: "Kartoffel", bemerkung: "" }];

  it("trimmt Felder", () =>
    expect(validateRecipeInput({ name: " Dal ", category: " Suppen ", bemerkung: " x " }, existing))
      .toEqual({ ok: true, value: { name: "Dal", category: "Suppen", bemerkung: "x" } }));

  it("leerer Name", () =>
    expect(validateRecipeInput({ name: "  ", category: "Pasta", bemerkung: "" }, existing))
      .toEqual({ ok: false, error: "Name fehlt." }));

  it("leere Kategorie", () =>
    expect(validateRecipeInput({ name: "Dal", category: "", bemerkung: "" }, existing))
      .toEqual({ ok: false, error: "Kategorie fehlt." }));

  it("Duplikat case-insensitiv", () =>
    expect(validateRecipeInput({ name: "kartoffelsalat ", category: "Kartoffel", bemerkung: "" }, existing))
      .toEqual({ ok: false, error: "Mahlzeit „kartoffelsalat“ gibt es schon." }));

  it("eigener Name beim Bearbeiten erlaubt", () =>
    expect(
      validateRecipeInput({ name: "Kartoffelsalat", category: "Salate", bemerkung: "" }, existing, 1).ok
    ).toBe(true));
});

describe("buildCategoryOptions", () => {
  it("enthält Kategorien ohne categories-Eintrag, dedupliziert, sortiert", () =>
    expect(
      buildCategoryOptions(
        [{ id: "pasta", name: "Pasta", icon: "pasta", color: "#DC2626" }],
        [
          { id: 1, name: "X", category: "Sonstiges", bemerkung: "" },
          { id: 2, name: "Y", category: "Pasta", bemerkung: "" },
        ]
      )
    ).toEqual([{ value: "Pasta" }, { value: "Sonstiges" }]));
});

describe("toMealOptions", () => {
  it("mappt name/category", () =>
    expect(toMealOptions([{ id: 1, name: "Dal", category: "Suppen", bemerkung: "" }]))
      .toEqual([{ value: "Dal", group: "Suppen" }]));
});
