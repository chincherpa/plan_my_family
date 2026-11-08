import type { Json } from "@/lib/supabase/types";

/** JS-Wochentag (Date#getDay, 0 = Sonntag) als String → Kategoriename. */
export type WeekdayCategories = Record<string, string>;

/** Anzeige-Reihenfolge Montag bis Sonntag, mit JS-Wochentag. */
export const WEEKDAYS: { day: number; label: string }[] = [
  { day: 1, label: "Montag" },
  { day: 2, label: "Dienstag" },
  { day: 3, label: "Mittwoch" },
  { day: 4, label: "Donnerstag" },
  { day: 5, label: "Freitag" },
  { day: 6, label: "Samstag" },
  { day: 0, label: "Sonntag" },
];

/** Liest die jsonb-Spalte robust: unbekannte Schlüssel und leere Werte fallen weg. */
export function parseWeekdayCategories(value: Json | undefined): WeekdayCategories {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: WeekdayCategories = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!/^[0-6]$/.test(key) || typeof raw !== "string") continue;
    const name = raw.trim();
    if (name) result[key] = name;
  }
  return result;
}

/** Setzt (oder entfernt bei leerem Namen) die Kategorie eines Wochentags. */
export function withWeekdayCategory(
  current: WeekdayCategories,
  day: number,
  category: string
): WeekdayCategories {
  const next = { ...current };
  const name = category.trim();
  if (name) next[String(day)] = name;
  else delete next[String(day)];
  return next;
}

/** Kategorie für ein lokales Datum "YYYY-MM-DD", oder null. */
export function categoryForDate(map: WeekdayCategories, date: string): string | null {
  const day = new Date(`${date}T12:00:00`).getDay();
  return map[String(day)] ?? null;
}

function categoryKey(name: string): string {
  return name.trim().toLocaleLowerCase("de");
}

/** Nur Optionen der Kategorie (Vergleich ohne Groß-/Kleinschreibung). */
export function filterByCategory<T extends { group?: string }>(options: T[], category: string): T[] {
  const key = categoryKey(category);
  return options.filter((o) => o.group !== undefined && categoryKey(o.group) === key);
}
