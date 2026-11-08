import { describe, expect, it } from "vitest";
import {
  buildCategoryOptions,
  categoryIdFromName,
  categoryLabel,
  toMealOptions,
  validateCategoryInput,
  validateRecipeInput,
} from "./logic";

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

describe("Kategorien", () => {
  const existing = [{ id: "suppe", name: "Suppe", icon: "soup", color: "#0891B2" }];

  it("id wie in der Rezepte-App", () => {
    expect(categoryIdFromName("Aufläufe & Gratins")).toBe("auflufegratins");
    expect(categoryIdFromName("Ein sehr langer Kategoriename")).toHaveLength(20);
  });

  it("leere Kategorie heißt „Ohne Kategorie“", () => {
    expect(categoryLabel("")).toBe("Ohne Kategorie");
    expect(categoryLabel("Pasta")).toBe("Pasta");
  });

  it("neue Kategorie: getrimmt, id aus Name", () =>
    expect(validateCategoryInput({ name: " Pasta ", icon: "pasta", color: "#DC2626" }, existing)).toEqual({
      ok: true,
      value: { id: "pasta", name: "Pasta", icon: "pasta", color: "#DC2626" },
    }));

  it("Name ohne a–z bekommt trotzdem eine id", () => {
    const res = validateCategoryInput({ name: "Ü", icon: "", color: "" }, existing);
    expect(res.ok && res.value.id).toMatch(/^kat/);
  });

  it("leerer Name", () =>
    expect(validateCategoryInput({ name: " ", icon: "", color: "" }, existing)).toEqual({
      ok: false,
      error: "Bitte gib einen Namen ein.",
    }));

  it("Duplikat (Name case-insensitiv)", () =>
    expect(validateCategoryInput({ name: "SUPPE", icon: "", color: "" }, existing)).toEqual({
      ok: false,
      error: "Kategorie existiert bereits.",
    }));

  it("Umbenennen behält die id und darf den eigenen Namen tragen", () =>
    expect(validateCategoryInput({ name: "Suppen", icon: "soup", color: "#000" }, existing, "suppe")).toEqual({
      ok: true,
      value: { id: "suppe", name: "Suppen", icon: "soup", color: "#000" },
    }));

  it("„Ohne Kategorie“ ist reserviert", () =>
    expect(validateCategoryInput({ name: "ohne kategorie", icon: "", color: "" }, existing).ok).toBe(false));
});
