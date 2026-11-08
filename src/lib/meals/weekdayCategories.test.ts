import { describe, expect, it } from "vitest";
import {
  categoryForDate,
  filterByCategory,
  parseWeekdayCategories,
  withWeekdayCategory,
} from "./weekdayCategories";

describe("parseWeekdayCategories", () => {
  it("übernimmt gültige Einträge und trimmt", () =>
    expect(parseWeekdayCategories({ "1": " Pasta ", "3": "Suppe" })).toEqual({ "1": "Pasta", "3": "Suppe" }));

  it("verwirft ungültige Schlüssel, leere und nicht-String-Werte", () =>
    expect(parseWeekdayCategories({ "7": "X", mo: "Y", "2": "  ", "4": 5, "5": null })).toEqual({}));

  it("null, undefined, Arrays und Skalare ergeben {}", () => {
    expect(parseWeekdayCategories(null)).toEqual({});
    expect(parseWeekdayCategories(undefined)).toEqual({});
    expect(parseWeekdayCategories(["Pasta"])).toEqual({});
    expect(parseWeekdayCategories("Pasta")).toEqual({});
  });
});

describe("withWeekdayCategory", () => {
  it("setzt und entfernt ohne das Original zu ändern", () => {
    const original = { "1": "Pasta" };
    expect(withWeekdayCategory(original, 2, "Kartoffel")).toEqual({ "1": "Pasta", "2": "Kartoffel" });
    expect(withWeekdayCategory(original, 1, "")).toEqual({});
    expect(original).toEqual({ "1": "Pasta" });
  });
});

describe("categoryForDate", () => {
  const map = { "1": "Pasta", "0": "Braten" };
  it("Montag", () => expect(categoryForDate(map, "2026-11-09")).toBe("Pasta"));
  it("Sonntag", () => expect(categoryForDate(map, "2026-11-08")).toBe("Braten"));
  it("ohne Eintrag null", () => expect(categoryForDate(map, "2026-11-10")).toBeNull());
});

describe("filterByCategory", () => {
  const options = [
    { value: "Spaghetti", group: "Pasta" },
    { value: "Lasagne", group: " pasta" },
    { value: "Linsensuppe", group: "Suppe" },
    { value: "Freitext" },
  ];
  it("filtert case-insensitiv", () =>
    expect(filterByCategory(options, "Pasta").map((o) => o.value)).toEqual(["Spaghetti", "Lasagne"]));
});
