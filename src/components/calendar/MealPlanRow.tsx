"use client";
import { useState } from "react";
import { UtensilsCrossed } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useDataStore } from "@/lib/store/dataStore";
import { toDateKey } from "@/lib/utils";
import type { MealPlan, MealType } from "@/lib/supabase/types";

function MealField({ dateKey, mealType, label }: { dateKey: string; mealType: MealType; label: string }) {
  const { family, meals, upsertMeal, removeMeal } = useDataStore();
  const saved = meals.find((m) => m.date === dateKey && m.meal_type === mealType)?.text ?? "";
  const [value, setValue] = useState(saved);
  const [lastSaved, setLastSaved] = useState(saved);

  // Sync when data arrives from realtime / initial load
  if (saved !== lastSaved) {
    setLastSaved(saved);
    setValue(saved);
  }

  async function save() {
    const trimmed = value.trim();
    if (!family || trimmed === saved) return;
    const supabase = createClient();
    if (trimmed === "") {
      await supabase
        .from("meal_plans")
        .delete()
        .eq("family_id", family.id)
        .eq("date", dateKey)
        .eq("meal_type", mealType);
      removeMeal(dateKey, mealType);
    } else {
      const { data } = await supabase
        .from("meal_plans")
        .upsert(
          { family_id: family.id, date: dateKey, meal_type: mealType, text: trimmed },
          { onConflict: "family_id,date,meal_type" }
        )
        .select()
        .single();
      if (data) upsertMeal(data as MealPlan);
    }
  }

  return (
    <label className="flex items-center gap-1 flex-1 min-w-0">
      <span className="text-[10px] font-medium text-[var(--muted-foreground)] shrink-0">{label}</span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        placeholder="–"
        className="flex-1 min-w-0 bg-transparent text-[11px] rounded px-1 py-0.5 border border-transparent hover:border-[var(--border)] focus:border-[var(--border)] focus:bg-[var(--background)] focus:outline-none text-[var(--foreground)]"
      />
    </label>
  );
}

/** Compact lunch/dinner planning row shown in each day header */
export default function MealPlanRow({ day, height }: { day: Date; height: number }) {
  const dateKey = toDateKey(day);
  return (
    <div className="flex items-center gap-2 pl-3 pr-2" style={{ height }}>
      <UtensilsCrossed className="w-3.5 h-3.5 text-[var(--muted-foreground)] shrink-0" />
      <MealField dateKey={dateKey} mealType="lunch" label="Mittag" />
      <MealField dateKey={dateKey} mealType="dinner" label="Abend" />
    </div>
  );
}
