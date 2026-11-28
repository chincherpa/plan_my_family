import { describe, expect, it } from "vitest";
import type { Note } from "@/lib/supabase/types";
import {
  filterNotes,
  isValidPin,
  notesErrorCode,
  sortNotes,
  upsertNote,
  validateNote,
} from "./logic";

function note(id: string, updated_at: string, is_important = false, title = id, body = ""): Note {
  return {
    id,
    family_id: "f",
    title,
    body,
    is_important,
    created_at: "2026-01-01T00:00:00Z",
    updated_at,
  };
}

describe("isValidPin", () => {
  it("akzeptiert 4–8 Ziffern", () => {
    expect(isValidPin("0000")).toBe(true);
    expect(isValidPin("12345678")).toBe(true);
  });
  it("lehnt zu kurz, zu lang und Nicht-Ziffern ab", () => {
    expect(isValidPin("123")).toBe(false);
    expect(isValidPin("123456789")).toBe(false);
    expect(isValidPin("12a4")).toBe(false);
    expect(isValidPin(" 1234")).toBe(false);
  });
});

describe("validateNote", () => {
  it("verlangt Titel oder Text", () => {
    expect(validateNote("  ", "\n")).toBe("empty");
    expect(validateNote("Titel", "")).toBeNull();
    expect(validateNote("", "Text")).toBeNull();
  });
  it("begrenzt die Länge", () => {
    expect(validateNote("x".repeat(201), "")).toBe("too_long");
    expect(validateNote("", "x".repeat(20001))).toBe("too_long");
  });
});

describe("sortNotes", () => {
  it("sortiert wichtige zuerst, dann neueste zuerst", () => {
    const sorted = sortNotes([
      note("alt", "2026-01-01T00:00:00Z"),
      note("neu", "2026-03-01T00:00:00Z"),
      note("wichtig-alt", "2025-01-01T00:00:00Z", true),
    ]);
    expect(sorted.map((n) => n.id)).toEqual(["wichtig-alt", "neu", "alt"]);
  });
});

describe("upsertNote", () => {
  it("ersetzt vorhandene und fügt neue hinzu", () => {
    const list = [note("a", "2026-01-01T00:00:00Z")];
    expect(upsertNote(list, note("a", "2026-01-01T00:00:00Z", true))[0].is_important).toBe(true);
    expect(upsertNote(list, note("b", "2026-02-01T00:00:00Z")).map((n) => n.id)).toEqual(["b", "a"]);
  });
});

describe("filterNotes", () => {
  it("sucht in Titel und Text ohne Groß-/Kleinschreibung", () => {
    const list = [note("a", "x", false, "Einkauf"), note("b", "x", false, "WLAN", "Passwort Straße")];
    expect(filterNotes(list, "einkauf").map((n) => n.id)).toEqual(["a"]);
    expect(filterNotes(list, "STRASSE").map((n) => n.id)).toEqual([]);
    expect(filterNotes(list, "straße").map((n) => n.id)).toEqual(["b"]);
    expect(filterNotes(list, "  ")).toHaveLength(2);
  });
});

describe("notesErrorCode", () => {
  it("bildet unbekannte Werte auf unknown ab", () => {
    expect(notesErrorCode("locked")).toBe("locked");
    expect(notesErrorCode("boom")).toBe("unknown");
    expect(notesErrorCode(undefined)).toBe("unknown");
  });
});
