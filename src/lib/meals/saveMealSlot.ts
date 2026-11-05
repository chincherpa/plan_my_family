import { createClient } from "@/lib/supabase/client";
import type { Meal } from "@/lib/supabase/types";
import type { MealType } from "@/lib/recipes/stats";

/** Setzt Mittag oder Abend eines Tages; der andere Slot bleibt erhalten. */
export async function saveMealSlot(
  familyId: string,
  existing: Meal | undefined,
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
        lunch: type === "lunch" ? dish : existing?.lunch ?? null,
        dinner: type === "dinner" ? dish : existing?.dinner ?? null,
      },
      { onConflict: "family_id,date" }
    )
    .select()
    .single();
  if (error || !data) return null;
  return data as Meal;
}
