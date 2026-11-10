import { createClient } from "@/lib/supabase/client";
import type { Meal } from "@/lib/supabase/types";
import type { MealType } from "@/lib/recipes/stats";

/**
 * Setzt Mittag oder Abend eines Tages. Der Upsert enthält nur die eine Spalte,
 * PostgREST aktualisiert bei Konflikt nur diese – der andere Slot bleibt erhalten,
 * auch wenn er parallel (anderes Fenster) geändert wurde.
 */
export async function saveMealSlot(
  familyId: string,
  date: string,
  type: MealType,
  dish: string | null
): Promise<Meal | null> {
  const { data, error } = await createClient()
    .from("meals")
    .upsert(
      {
        family_id: familyId,
        date,
        ...(type === "lunch" ? { lunch: dish } : { dinner: dish }),
      },
      { onConflict: "family_id,date" }
    )
    .select()
    .single();
  if (error || !data) return null;
  return data as Meal;
}
