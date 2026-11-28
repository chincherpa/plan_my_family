import { z } from "zod";
import {
  computeDishStats,
  daysBetween,
  dishKey,
  pickSuggestion,
  statsFor,
  type DishStats,
  type MealType,
} from "@/lib/recipes/stats";
import type { Recipe } from "@/lib/recipes/types";
import { categoryForDate, type WeekdayCategories } from "./weekdayCategories";

/**
 * Essensvorschläge: Claude wählt für freie Mittag-/Abend-Plätze Gerichte aus der
 * Rezeptliste der Familie. Claude nennt nur Rezept-IDs aus der mitgeschickten Liste;
 * hier wird die Antwort gegen die echte Liste geprüft und – falls Claude zu wenig
 * liefert oder nicht erreichbar ist – lokal mit `pickSuggestion` aufgefüllt.
 */

/** Vorschläge pro Platz: der erste ist die Empfehlung, die übrigen „Ersetzen“-Alternativen. */
export const OPTIONS_PER_SLOT = 3;
export const MAX_SLOTS = 28;
/** So weit zurück fließt der Essensplan in die Statistik (beliebt / lange her). */
export const HISTORY_DAYS = 365;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ── Request-Body ────────────────────────────────────────────────────────────

export const SuggestRequestSchema = z.object({
  slots: z
    .array(
      z.object({
        date: z.string().regex(DATE_RE, "Datum als JJJJ-MM-TT."),
        type: z.enum(["lunch", "dinner"]),
      })
    )
    .min(1, "Mindestens ein Platz.")
    .max(MAX_SLOTS, `Höchstens ${MAX_SLOTS} Plätze.`),
});

export type SuggestSlot = { date: string; type: MealType };

// ── Antwort von Claude ──────────────────────────────────────────────────────

export const AiSuggestionSchema = z.object({
  suggestions: z.array(
    z.object({
      slot: z.number().int().describe("Nummer des Platzes aus der Liste <plaetze>."),
      options: z
        .array(
          z.object({
            recipe_id: z.number().int().describe("ID eines Gerichts aus <gerichte>."),
            reason: z.string().describe("Kurze Begründung auf Deutsch, höchstens 6 Wörter."),
          })
        )
        .describe(`Bis zu ${OPTIONS_PER_SLOT} verschiedene Gerichte, das beste zuerst.`),
    })
  ),
});

export type AiSuggestion = z.infer<typeof AiSuggestionSchema>;

// ── Ergebnis ────────────────────────────────────────────────────────────────

export type SuggestionOption = { name: string; category: string; reason: string };
export type SlotSuggestion = SuggestSlot & { options: SuggestionOption[] };

type PlanRow = { date: string; lunch: string | null; dinner: string | null };

const WEEKDAY_FMT = new Intl.DateTimeFormat("de-DE", { weekday: "long", timeZone: "UTC" });
function weekdayOf(date: string): string {
  return WEEKDAY_FMT.format(new Date(`${date}T12:00:00Z`));
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const SLOT_LABEL: Record<MealType, string> = { lunch: "Mittag", dinner: "Abend" };

/** Nutzertext für Claude: Gerichte mit Statistik, bereits Geplantes und die freien Plätze. */
export function buildPlannerPrompt(input: {
  recipes: Recipe[];
  meals: PlanRow[];
  slots: SuggestSlot[];
  weekdayCategories: WeekdayCategories;
  todayStr: string;
}): string {
  const { recipes, meals, slots, weekdayCategories, todayStr } = input;
  const stats = computeDishStats(meals, todayStr);

  const dishLines = recipes.map((r) => {
    const s = statsFor(stats, r.name);
    const last = s.lastDate ? `zuletzt vor ${daysBetween(s.lastDate, todayStr)} Tagen` : "noch nie gegessen";
    const note = r.bemerkung.trim() ? ` | ${r.bemerkung.trim().slice(0, 80)}` : "";
    return `${r.id} | ${r.name} | ${r.category || "ohne Kategorie"} | ${s.count}× | ${last}${note}`;
  });

  // Geplantes rund um die Plätze, damit sich nichts wiederholt
  const dates = slots.map((s) => s.date).sort();
  const from = addDays(dates[0], -7);
  const to = addDays(dates[dates.length - 1], 7);
  const plannedLines = meals
    .filter((m) => m.date >= from && m.date <= to && (m.lunch?.trim() || m.dinner?.trim()))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) => {
      const parts = [m.lunch?.trim() && `Mittag: ${m.lunch.trim()}`, m.dinner?.trim() && `Abend: ${m.dinner.trim()}`];
      return `${m.date} (${weekdayOf(m.date)}): ${parts.filter(Boolean).join(", ")}`;
    });

  const slotLines = slots.map((s, i) => {
    const cat = categoryForDate(weekdayCategories, s.date);
    return `${i} | ${s.date} (${weekdayOf(s.date)}) | ${SLOT_LABEL[s.type]}${cat ? ` | Wochentag-Kategorie: ${cat}` : ""}`;
  });

  return [
    `Heute ist ${weekdayOf(todayStr)}, der ${todayStr}.`,
    "",
    "<gerichte>",
    "id | Name | Kategorie | so oft gegessen | zuletzt | Bemerkung",
    ...dishLines,
    "</gerichte>",
    "",
    "<bereits_geplant>",
    ...(plannedLines.length > 0 ? plannedLines : ["(nichts)"]),
    "</bereits_geplant>",
    "",
    "<plaetze>",
    "Nummer | Datum | Mahlzeit | Vorgabe",
    ...slotLines,
    "</plaetze>",
  ].join("\n");
}

/** Gewünschte Kategorie für einen Platz – nur, wenn es in der Rezeptliste Gerichte dazu gibt. */
function wantedCategory(recipes: Recipe[], map: WeekdayCategories, date: string): string | null {
  const name = categoryForDate(map, date);
  if (!name) return null;
  return recipes.some((r) => dishKey(r.category) === dishKey(name)) ? name : null;
}

/**
 * Wählt lokal ein Gericht, das noch nicht in `exclude` steht – bevorzugt aus der
 * Wochentag-Kategorie, gewichtet nach „lange nicht gegessen“. null, wenn nichts übrig ist.
 */
export function pickLocalOption(input: {
  recipes: Recipe[];
  stats: Map<string, DishStats>;
  todayStr: string;
  category: string | null;
  exclude: Set<string>;
  random?: () => number;
}): SuggestionOption | null {
  const { recipes, stats, todayStr, category, exclude, random = Math.random } = input;
  const free = recipes.filter((r) => !exclude.has(dishKey(r.name)));
  const inCategory = category ? free.filter((r) => dishKey(r.category) === dishKey(category)) : [];
  const pool = inCategory.length > 0 ? inCategory : free;
  const recipe = pickSuggestion(pool, stats, todayStr, random);
  if (!recipe) return null;
  const last = statsFor(stats, recipe.name).lastDate;
  const reason =
    inCategory.length > 0
      ? `passt zum Wochentag (${recipe.category})`
      : last
      ? `zuletzt vor ${daysBetween(last, todayStr)} Tagen`
      : "mal wieder etwas Neues";
  return { name: recipe.name, category: recipe.category, reason };
}

/**
 * Übersetzt Claudes Antwort in Vorschläge pro Platz: nur bekannte Rezept-IDs,
 * keine Doppelungen innerhalb eines Platzes, und jede Empfehlung (erste Option)
 * höchstens einmal in der Anfrage. Fehlende Optionen werden lokal ergänzt.
 * `ai` darf null sein (Claude nicht erreichbar) – dann ist alles lokal.
 */
export function resolveSuggestions(input: {
  slots: SuggestSlot[];
  ai: AiSuggestion | null;
  recipes: Recipe[];
  meals: PlanRow[];
  weekdayCategories: WeekdayCategories;
  todayStr: string;
  random?: () => number;
}): SlotSuggestion[] {
  const { slots, ai, recipes, meals, weekdayCategories, todayStr, random } = input;
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const stats = computeDishStats(meals, todayStr);

  const aiBySlot = new Map<number, AiSuggestion["suggestions"][number]["options"]>();
  for (const s of ai?.suggestions ?? []) {
    if (s.slot >= 0 && s.slot < slots.length && !aiBySlot.has(s.slot)) aiBySlot.set(s.slot, s.options);
  }

  const usedFirst = new Set<string>();
  return slots.map((slot, i) => {
    const options: SuggestionOption[] = [];
    const seen = new Set<string>();
    for (const o of aiBySlot.get(i) ?? []) {
      const recipe = byId.get(o.recipe_id);
      if (!recipe) continue;
      const key = dishKey(recipe.name);
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({ name: recipe.name, category: recipe.category, reason: o.reason.trim() || "Vorschlag" });
    }

    // Empfehlung schon in einem anderen Platz? Eine noch freie Alternative nach vorne holen.
    const firstFree = options.findIndex((o) => !usedFirst.has(dishKey(o.name)));
    if (firstFree > 0) options.unshift(...options.splice(firstFree, 1));
    else if (firstFree === -1 && options.length > 0) {
      const local = pickLocalOption({
        recipes,
        stats,
        todayStr,
        category: wantedCategory(recipes, weekdayCategories, slot.date),
        exclude: new Set([...seen, ...usedFirst]),
        random,
      });
      if (local) {
        options.unshift(local);
        seen.add(dishKey(local.name));
      }
    }

    while (options.length < OPTIONS_PER_SLOT) {
      const exclude = new Set(seen);
      if (options.length === 0) for (const k of usedFirst) exclude.add(k);
      const local = pickLocalOption({
        recipes,
        stats,
        todayStr,
        category: wantedCategory(recipes, weekdayCategories, slot.date),
        exclude,
        random,
      });
      if (!local) break;
      options.push(local);
      seen.add(dishKey(local.name));
    }

    if (options[0]) usedFirst.add(dishKey(options[0].name));
    return { ...slot, options: options.slice(0, OPTIONS_PER_SLOT) };
  });
}
