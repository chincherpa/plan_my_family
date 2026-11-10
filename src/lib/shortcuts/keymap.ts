import type { Json } from "@/lib/supabase/types";

/**
 * Tastatur-Shortcuts: Aktionen, Standardbelegung und Normalisierung von
 * Tastenkombinationen. Eine Kombination ist ein String wie "N", "Shift+D",
 * "ArrowLeft" oder "?" — Modifier immer in der Reihenfolge Ctrl, Alt, Shift, Meta.
 */

export type ShortcutGroup = "Kalender" | "Navigation" | "Allgemein";

export const SHORTCUT_ACTIONS = [
  { id: "newAppointment", label: "Neuer Termin", group: "Kalender", defaultKey: "N" },
  { id: "newEvent", label: "Neues Ereignis (Geburtstag, Jahrestag)", group: "Kalender", defaultKey: "E" },
  { id: "today", label: "Zu heute springen", group: "Kalender", defaultKey: "T" },
  { id: "prevDay", label: "Vorheriger Tag", group: "Kalender", defaultKey: "ArrowLeft" },
  { id: "nextDay", label: "Nächster Tag", group: "Kalender", defaultKey: "ArrowRight" },
  { id: "pickDate", label: "Datum wählen", group: "Kalender", defaultKey: "D" },
  { id: "editMeal", label: "Essen des Tages bearbeiten", group: "Kalender", defaultKey: "M" },
  { id: "goCalendar", label: "Kalender öffnen", group: "Navigation", defaultKey: "1" },
  { id: "goMeals", label: "Essen öffnen", group: "Navigation", defaultKey: "2" },
  { id: "goAnniversaries", label: "Jahrestage öffnen", group: "Navigation", defaultKey: "3" },
  { id: "goSettings", label: "Einstellungen öffnen", group: "Navigation", defaultKey: "4" },
  { id: "toggleTodos", label: "Todo-Liste ein/aus", group: "Allgemein", defaultKey: "L" },
  { id: "toggleTheme", label: "Hell/Dunkel umschalten", group: "Allgemein", defaultKey: "Shift+D" },
  { id: "showHelp", label: "Shortcut-Übersicht", group: "Allgemein", defaultKey: "?" },
] as const satisfies readonly { id: string; label: string; group: ShortcutGroup; defaultKey: string }[];

export type ShortcutActionId = (typeof SHORTCUT_ACTIONS)[number]["id"];

export const SHORTCUT_GROUPS: ShortcutGroup[] = ["Kalender", "Navigation", "Allgemein"];

/** Abweichungen von der Standardbelegung; null = Aktion deaktiviert. */
export type ShortcutOverrides = Partial<Record<ShortcutActionId, string | null>>;
/** Wirksame Belegung je Aktion; null = keine Taste. */
export type Keymap = Record<ShortcutActionId, string | null>;

const ACTION_IDS = new Set<string>(SHORTCUT_ACTIONS.map((a) => a.id));
const MODIFIERS = ["Ctrl", "Alt", "Shift", "Meta"] as const;
type Modifier = (typeof MODIFIERS)[number];

export function isShortcutActionId(id: string): id is ShortcutActionId {
  return ACTION_IDS.has(id);
}

export function actionLabel(id: ShortcutActionId): string {
  return SHORTCUT_ACTIONS.find((a) => a.id === id)?.label ?? id;
}

/** Zerlegt "Ctrl+Shift+N" in Modifier und Grundtaste ("+" selbst ist eine gültige Taste). */
function splitCombo(combo: string): { mods: Set<string>; key: string } | null {
  const mods = new Set<string>();
  let rest = combo;
  for (;;) {
    const match = /^(Ctrl|Alt|Shift|Meta)\+(.+)$/.exec(rest);
    if (!match) break;
    if (mods.has(match[1])) return null;
    mods.add(match[1]);
    rest = match[2];
  }
  if (!rest || (MODIFIERS as readonly string[]).includes(rest)) return null;
  return { mods, key: rest };
}

function joinCombo(mods: Set<string>, key: string): string {
  return [...MODIFIERS.filter((m) => mods.has(m)), key].join("+");
}

/** Bringt eine Kombination in die kanonische Form, oder null wenn ungültig. */
export function normalizeCombo(combo: string): string | null {
  const parts = splitCombo(combo.trim());
  if (!parts) return null;
  let { key } = parts;
  if (key.length === 1) {
    if (/\s/.test(key)) return null;
    key = key.toUpperCase();
  } else if (!/^[A-Z][A-Za-z0-9]+$/.test(key)) {
    return null; // benannte Tasten wie "ArrowLeft", "F2", "Home"
  }
  return joinCombo(parts.mods, key);
}

/** Minimal benötigte Felder eines KeyboardEvent — testbar ohne DOM. */
export interface KeyLike {
  key: string;
  code?: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

/** Kombination eines Tastendrucks, oder null bei reinem Modifier / unbekannter Taste. */
export function eventToCombo(e: KeyLike): string | null {
  if (!e.key || e.key === "Unidentified" || e.key === "Dead") return null;
  if ((MODIFIERS as readonly string[]).includes(e.key) || e.key === "Control" || e.key === "AltGraph") {
    return null;
  }
  const mods = new Set<Modifier>();
  if (e.ctrlKey) mods.add("Ctrl");
  if (e.altKey) mods.add("Alt");
  if (e.metaKey) mods.add("Meta");

  let key = e.key === " " ? "Space" : e.key;
  // Mit Alt/Ctrl/Meta liefert e.key oft Sonderzeichen (macOS: Alt+N = "˜") —
  // dann die physische Taste nehmen.
  if (mods.size > 0 && e.code) {
    const physical = /^Key([A-Z])$/.exec(e.code) ?? /^Digit([0-9])$/.exec(e.code);
    if (physical) key = physical[1];
  }

  if (key.length === 1) {
    const isLetter = key.toLowerCase() !== key.toUpperCase();
    // Bei Zeichen wie "?" oder "!" steckt Shift schon im Zeichen.
    if (isLetter && e.shiftKey) mods.add("Shift");
    key = key.toUpperCase();
  } else if (e.shiftKey) {
    mods.add("Shift");
  }
  return normalizeCombo(joinCombo(mods, key));
}

const RESERVED_KEYS = new Set(["Escape", "Tab", "Enter", "Space", "Backspace", "Delete"]);

/**
 * Kombinationen, die Browser, Betriebssystem oder Formulare brauchen: Strg/⌘
 * (Kopieren, neuer Tab, …), Funktionstasten und Tasten zur Bedienung von
 * Dialogen und Eingaben. Esc schließt Dialoge und bleibt daher fest.
 */
export function isReservedCombo(combo: string): boolean {
  const parts = splitCombo(combo);
  if (!parts) return true;
  if (parts.mods.has("Ctrl") || parts.mods.has("Meta")) return true;
  if (RESERVED_KEYS.has(parts.key)) return true;
  return /^F\d{1,2}$/.test(parts.key);
}

/** Liest die jsonb-Spalte robust: unbekannte Aktionen und ungültige Kombinationen fallen weg. */
export function parseShortcutOverrides(value: Json | undefined): ShortcutOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: ShortcutOverrides = {};
  for (const [id, raw] of Object.entries(value)) {
    if (!isShortcutActionId(id)) continue;
    if (raw === null) {
      result[id] = null;
      continue;
    }
    if (typeof raw !== "string") continue;
    const combo = normalizeCombo(raw);
    if (combo && !isReservedCombo(combo)) result[id] = combo;
  }
  return result;
}

export function resolveKeymap(overrides: ShortcutOverrides): Keymap {
  const map = {} as Keymap;
  for (const action of SHORTCUT_ACTIONS) {
    map[action.id] = action.id in overrides ? (overrides[action.id] ?? null) : action.defaultKey;
  }
  return map;
}

/** Tastenkombination → Aktion. Bei Doppelbelegung gewinnt die erste Aktion der Liste. */
export function invertKeymap(keymap: Keymap): Map<string, ShortcutActionId> {
  const byCombo = new Map<string, ShortcutActionId>();
  for (const action of SHORTCUT_ACTIONS) {
    const combo = keymap[action.id];
    if (combo && !byCombo.has(combo)) byCombo.set(combo, action.id);
  }
  return byCombo;
}

/** Kombinationen, die mehr als einer Aktion zugeordnet sind. */
export function findConflicts(keymap: Keymap): Map<string, ShortcutActionId[]> {
  const byCombo = new Map<string, ShortcutActionId[]>();
  for (const action of SHORTCUT_ACTIONS) {
    const combo = keymap[action.id];
    if (!combo) continue;
    byCombo.set(combo, [...(byCombo.get(combo) ?? []), action.id]);
  }
  return new Map([...byCombo].filter(([, ids]) => ids.length > 1));
}

/**
 * Setzt die Taste einer Aktion und gibt die neuen Overrides zurück. Ist die
 * Taste schon vergeben, bekommt die andere Aktion die bisherige Taste (Tausch).
 * Overrides, die der Standardbelegung entsprechen, werden entfernt.
 */
export function assignCombo(
  overrides: ShortcutOverrides,
  id: ShortcutActionId,
  combo: string | null
): ShortcutOverrides {
  const keymap = resolveKeymap(overrides);
  const previous = keymap[id];
  keymap[id] = combo;
  if (combo) {
    for (const action of SHORTCUT_ACTIONS) {
      if (action.id !== id && keymap[action.id] === combo) keymap[action.id] = previous;
    }
  }
  const next: ShortcutOverrides = {};
  for (const action of SHORTCUT_ACTIONS) {
    if (keymap[action.id] !== action.defaultKey) next[action.id] = keymap[action.id];
  }
  return next;
}

const KEY_SYMBOLS: Record<string, string> = {
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Shift: "⇧",
  Escape: "Esc",
  Backspace: "⌫",
  Ctrl: "Strg",
  Meta: "⌘",
  PageUp: "Bild ↑",
  PageDown: "Bild ↓",
  Home: "Pos1",
  End: "Ende",
};

/** Einzelteile für die Anzeige als <kbd>, z. B. "Shift+D" → ["⇧", "D"]. */
export function comboParts(combo: string): string[] {
  const parts = splitCombo(combo);
  if (!parts) return [combo];
  return [...MODIFIERS.filter((m) => parts.mods.has(m)), parts.key].map((p) => KEY_SYMBOLS[p] ?? p);
}

/** Kurzform für Tooltips, z. B. "Nächster Tag (→)". */
export function withShortcutHint(label: string, combo: string | null | undefined): string {
  return combo ? `${label} (${comboParts(combo).join(" ")})` : label;
}
