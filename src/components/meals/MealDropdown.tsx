"use client";
import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDataStore } from "@/lib/store/dataStore";
import type { MealPlanWithRecipe, Recipe } from "@/lib/supabase/types";

interface Props {
  dateStr: string;          // "YYYY-MM-DD"
  mealType: "lunch" | "dinner";
  onClose: () => void;
}

export default function MealDropdown({ dateStr, mealType, onClose }: Props) {
  const { family, recipes, upsertMealPlan } = useDataStore();
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const filtered = recipes.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      (r.category ?? "").toLowerCase().includes(search.toLowerCase())
  );

  async function selectRecipe(recipe: Recipe | null) {
    if (!family) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("meal_plans")
      .upsert(
        { family_id: family.id, date: dateStr, meal_type: mealType, recipe_id: recipe?.id ?? null },
        { onConflict: "family_id,date,meal_type" }
      )
      .select("*, recipe:recipes(id, name, category)")
      .single();
    if (data) upsertMealPlan(data as MealPlanWithRecipe);
    onClose();
  }

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full mt-0.5 z-50 bg-[var(--popover)] border border-[var(--border)] rounded-lg shadow-lg w-56 overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-2 border-b border-[var(--border)]">
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rezept suchen…"
          className="w-full text-xs bg-transparent outline-none placeholder:text-[var(--muted-foreground)]"
        />
      </div>
      <div className="max-h-48 overflow-y-auto">
        <button
          className="w-full text-left px-3 py-1.5 text-xs text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
          onClick={() => selectRecipe(null)}
        >
          — Kein Rezept
        </button>
        {filtered.map((recipe) => (
          <button
            key={recipe.id}
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--accent)] flex items-center gap-1.5"
            onClick={() => selectRecipe(recipe)}
          >
            {recipe.category && (
              <span className="text-[var(--muted-foreground)] shrink-0">[{recipe.category}]</span>
            )}
            <span className="truncate">{recipe.name}</span>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="px-3 py-2 text-xs text-[var(--muted-foreground)]">Keine Rezepte gefunden.</p>
        )}
      </div>
    </div>
  );
}
