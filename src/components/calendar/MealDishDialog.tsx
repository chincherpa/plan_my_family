"use client";
import { useEffect, useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { BookOpen, PenLine } from "lucide-react";
import { useDataStore } from "@/lib/store/dataStore";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import DishEditor from "@/components/meals/DishEditor";
import { computeDishStats, dishKey, statsFor, type MealType } from "@/lib/recipes/stats";
import type { Meal } from "@/lib/supabase/types";
import { localDateStr } from "@/lib/utils";

/**
 * Tap on a planned dish in the calendar: ask whether to change the meal plan
 * or to show the recipe. Free-text dishes without a recipe go straight to the editor.
 */
export default function MealDishDialog({
  date,
  type,
  meal,
  onEdit,
  onClose,
}: {
  /** Local date "YYYY-MM-DD" */
  date: string;
  type: MealType;
  meal: Meal | undefined;
  onEdit: () => void;
  onClose: () => void;
}) {
  const { meals, recipes } = useDataStore();
  const [showRecipe, setShowRecipe] = useState(false);

  const dish = meal?.[type]?.trim() ?? "";
  const recipe = useMemo(() => recipes.find((r) => dishKey(r.name) === dishKey(dish)) ?? null, [recipes, dish]);
  const todayStr = localDateStr(new Date());
  const stats = useMemo(() => computeDishStats(meals, todayStr), [meals, todayStr]);

  // Nichts zu fragen, wenn es kein Rezept gibt (Freitext) – direkt bearbeiten
  useEffect(() => {
    if (!recipe && !showRecipe) onEdit();
  }, [recipe, showRecipe, onEdit]);

  if (showRecipe && recipe) {
    return (
      <DishEditor
        recipe={recipe}
        stats={statsFor(stats, recipe.name)}
        onClose={onClose}
        // Der Kalender hat keine eigene Toast-Leiste; Änderungen sind im Plan sichtbar
        onToast={() => {}}
      />
    );
  }
  if (!recipe) return null;

  const dateLabel = new Date(`${date}T12:00:00`).toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="pr-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            {type === "lunch" ? "🍽 Mittag" : "🌙 Abend"} · {dateLabel}
          </p>
          <DialogTitle className="leading-snug">{dish}</DialogTitle>
          <DialogPrimitive.Description className="sr-only">
            Gericht ändern oder Rezept anzeigen
          </DialogPrimitive.Description>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onEdit}>
            <PenLine className="h-4 w-4" />
            Ändern
          </Button>
          <Button autoFocus onClick={() => setShowRecipe(true)}>
            <BookOpen className="h-4 w-4" />
            Rezept anzeigen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
