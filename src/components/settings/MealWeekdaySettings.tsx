"use client";
import { useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { useDataStore } from "@/lib/store/dataStore";
import { createClient } from "@/lib/supabase/client";
import { buildCategoryOptions } from "@/lib/recipes/logic";
import {
  WEEKDAYS,
  parseWeekdayCategories,
  withWeekdayCategory,
  type WeekdayCategories,
} from "@/lib/meals/weekdayCategories";

/** Pro Wochentag eine Essenskategorie, die im Essensplan-Dialog vorausgewählt wird. */
export default function MealWeekdaySettings() {
  const { family, setFamily, recipes, recipeCategories, recipesError } = useDataStore();
  const [error, setError] = useState<string | null>(null);
  // Wie in CalendarDisplaySettings: auf den zuletzt von der DB bestätigten Stand zurückrollen,
  // und nur die Antwort der neuesten Anfrage auswerten.
  const confirmed = useRef<WeekdayCategories | null>(null);
  const latestRequest = useRef(0);

  const current = parseWeekdayCategories(family?.meal_weekday_categories);
  const categoryOptions = buildCategoryOptions(recipeCategories, recipes).map((o) => o.value);

  async function handleChange(day: number, category: string) {
    if (!family) return;
    const fallback = confirmed.current ?? current;
    const next = withWeekdayCategory(current, day, category);
    const request = ++latestRequest.current;
    setFamily({ ...family, meal_weekday_categories: next });
    setError(null);
    const { error: updateError } = await createClient()
      .from("families")
      .update({ meal_weekday_categories: next })
      .eq("id", family.id);
    if (request !== latestRequest.current) return;
    const latest = useDataStore.getState().family;
    if (updateError) {
      if (latest) setFamily({ ...latest, meal_weekday_categories: fallback });
      setError("Wochenplan konnte nicht gespeichert werden.");
      return;
    }
    confirmed.current = next;
  }

  return (
    <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
          <CalendarDays className="w-5 h-5 text-[var(--primary)]" />
        </div>
        <div>
          <p className="font-medium">Essens-Wochenplan</p>
          <p className="text-sm text-[var(--muted-foreground)]">
            Kategorie pro Wochentag – wird beim Planen zuerst angezeigt
          </p>
        </div>
      </div>

      <div className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm sm:pl-13">
        {WEEKDAYS.map(({ day, label }) => {
          const value = current[String(day)] ?? "";
          // Eine gespeicherte Kategorie, die es in der Rezept-DB (noch) nicht gibt, bleibt wählbar.
          const options =
            value && !categoryOptions.includes(value) ? [...categoryOptions, value] : categoryOptions;
          return (
            <label key={day} className="contents">
              <span className="text-[var(--muted-foreground)]">{label}</span>
              <select
                className="w-full border border-[var(--border)] rounded px-2 py-1 bg-[var(--card)] text-[var(--foreground)] text-sm"
                value={value}
                disabled={!family}
                onChange={(e) => handleChange(day, e.target.value)}
              >
                <option value="">— keine —</option>
                {options.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>

      {recipesError && (
        <p className="text-xs text-[var(--muted-foreground)]">
          Kategorien aus der Rezepte-App nicht verfügbar.
        </p>
      )}
      {error && <p className="text-sm text-[var(--destructive)]">{error}</p>}
    </div>
  );
}
