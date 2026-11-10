import { describe, expect, it } from "vitest";
import {
  SHORTCUT_ACTIONS,
  assignCombo,
  comboParts,
  eventToCombo,
  findConflicts,
  invertKeymap,
  isReservedCombo,
  normalizeCombo,
  parseShortcutOverrides,
  resolveKeymap,
  type KeyLike,
} from "./keymap";

const key = (k: string, extra: Partial<KeyLike> = {}): KeyLike => ({
  key: k,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...extra,
});

describe("normalizeCombo", () => {
  it("macht Buchstaben groß und ordnet Modifier", () => {
    expect(normalizeCombo("n")).toBe("N");
    expect(normalizeCombo("Shift+Alt+n")).toBe("Alt+Shift+N");
  });

  it("akzeptiert Sonderzeichen und benannte Tasten", () => {
    expect(normalizeCombo("?")).toBe("?");
    expect(normalizeCombo("+")).toBe("+");
    expect(normalizeCombo("Shift++")).toBe("Shift++");
    expect(normalizeCombo("ArrowLeft")).toBe("ArrowLeft");
  });

  it("verwirft Ungültiges", () => {
    expect(normalizeCombo("")).toBeNull();
    expect(normalizeCombo("Shift")).toBeNull();
    expect(normalizeCombo("Shift+Shift+N")).toBeNull();
    expect(normalizeCombo("foo bar")).toBeNull();
  });
});

describe("eventToCombo", () => {
  it("Buchstaben ohne und mit Shift", () => {
    expect(eventToCombo(key("n"))).toBe("N");
    expect(eventToCombo(key("D", { shiftKey: true }))).toBe("Shift+D");
  });

  it("Shift steckt bei Zeichen wie ? schon im Zeichen", () =>
    expect(eventToCombo(key("?", { shiftKey: true }))).toBe("?"));

  it("Shift bei benannten Tasten bleibt erhalten", () =>
    expect(eventToCombo(key("ArrowLeft", { shiftKey: true }))).toBe("Shift+ArrowLeft"));

  it("nimmt mit Alt die physische Taste (macOS-Sonderzeichen)", () =>
    expect(eventToCombo(key("˜", { altKey: true, code: "KeyN" }))).toBe("Alt+N"));

  it("Leertaste heißt Space", () => expect(eventToCombo(key(" "))).toBe("Space"));

  it("reine Modifier ergeben null", () => {
    expect(eventToCombo(key("Shift", { shiftKey: true }))).toBeNull();
    expect(eventToCombo(key("Control", { ctrlKey: true }))).toBeNull();
    expect(eventToCombo(key("Dead"))).toBeNull();
  });
});

describe("isReservedCombo", () => {
  it("sperrt Strg/⌘, Funktionstasten und Bedientasten", () => {
    for (const c of ["Ctrl+N", "Meta+T", "F5", "Escape", "Tab", "Enter", "Space", "Shift+Tab"]) {
      expect(isReservedCombo(c), c).toBe(true);
    }
  });

  it("erlaubt Einzeltasten und Alt", () => {
    for (const c of ["N", "Shift+D", "?", "ArrowLeft", "Alt+N"]) {
      expect(isReservedCombo(c), c).toBe(false);
    }
  });
});

describe("parseShortcutOverrides", () => {
  it("übernimmt gültige Einträge normalisiert, null = deaktiviert", () =>
    expect(parseShortcutOverrides({ today: "h", prevDay: null })).toEqual({ today: "H", prevDay: null }));

  it("verwirft unbekannte Aktionen, reservierte und ungültige Werte", () =>
    expect(parseShortcutOverrides({ foo: "X", today: "Ctrl+T", nextDay: 5, goMeals: "" })).toEqual({}));

  it("null, Arrays und Skalare ergeben {}", () => {
    expect(parseShortcutOverrides(null)).toEqual({});
    expect(parseShortcutOverrides(undefined)).toEqual({});
    expect(parseShortcutOverrides(["N"])).toEqual({});
    expect(parseShortcutOverrides("N")).toEqual({});
  });
});

describe("resolveKeymap / invertKeymap", () => {
  it("Standardbelegung ist konfliktfrei und nicht reserviert", () => {
    const keymap = resolveKeymap({});
    expect(findConflicts(keymap).size).toBe(0);
    for (const a of SHORTCUT_ACTIONS) expect(isReservedCombo(a.defaultKey), a.id).toBe(false);
  });

  it("Overrides ersetzen und deaktivieren", () => {
    const keymap = resolveKeymap({ today: "H", prevDay: null });
    expect(keymap.today).toBe("H");
    expect(keymap.prevDay).toBeNull();
    expect(keymap.nextDay).toBe("ArrowRight");
    const inverted = invertKeymap(keymap);
    expect(inverted.get("H")).toBe("today");
    expect(inverted.has("T")).toBe(false);
    expect(inverted.has("ArrowLeft")).toBe(false);
  });

  it("findConflicts meldet Doppelbelegung", () =>
    expect(findConflicts(resolveKeymap({ today: "N" })).get("N")).toEqual(["newAppointment", "today"]));
});

describe("assignCombo", () => {
  it("tauscht bei bereits belegter Taste", () => {
    const next = assignCombo({}, "today", "N");
    const keymap = resolveKeymap(next);
    expect(keymap.today).toBe("N");
    expect(keymap.newAppointment).toBe("T");
    expect(findConflicts(keymap).size).toBe(0);
  });

  it("entfernt Overrides, die der Standardbelegung entsprechen", () => {
    expect(assignCombo({ today: "H" }, "today", "T")).toEqual({});
    expect(assignCombo({}, "today", "N")).toEqual({ today: "N", newAppointment: "T" });
  });

  it("null deaktiviert ohne Tausch", () => expect(assignCombo({}, "prevDay", null)).toEqual({ prevDay: null }));
});

describe("comboParts", () => {
  it("zeigt Symbole", () => {
    expect(comboParts("Shift+D")).toEqual(["⇧", "D"]);
    expect(comboParts("ArrowRight")).toEqual(["→"]);
    expect(comboParts("?")).toEqual(["?"]);
  });
});
