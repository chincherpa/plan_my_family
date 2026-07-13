"use client";
import { useState } from "react";
import { useDataStore } from "@/lib/store/dataStore";
import MealDropdown from "@/components/meals/MealDropdown";

interface Props {
  day: Date;
}

type MealType = "lunch" | "dinner";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function MealRow({ day }: Props) {
  const { mealPlans } = useDataStore();
  const dateStr = toDateStr(day);

  const lunchPlan = mealPlans.find((p) => p.date === dateStr && p.meal_type === "lunch");
  const dinnerPlan = mealPlans.find((p) => p.date === dateStr && p.meal_type === "dinner");

  const [open, setOpen] = useState<MealType | null>(null);

  function renderPill(mealType: MealType, recipeName: string | undefined, label: string) {
    const hasRecipe = !!recipeName;
    return (
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpen(open === mealType ? null : mealType);
          }}
          className={`flex items-center gap-1 px-2 rounded text-[10px] font-medium truncate max-w-[120px] transition-colors ${
            hasRecipe
              ? "text-[var(--foreground)] bg-[var(--primary)]/10 hover:bg-[var(--primary)]/20"
              : "text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
          }`}
          style={{ height: 20 }}
        >
          <span className="shrink-0">{mealType === "lunch" ? "🍽" : "🌙"}</span>
          <span className="truncate">{hasRecipe ? recipeName : label}</span>
        </button>
        {open === mealType && (
          <MealDropdown
            dateStr={dateStr}
            mealType={mealType}
            onClose={() => setOpen(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1 px-14"
      style={{ height: 24 }}
      onClick={(e) => e.stopPropagation()}
    >
      {renderPill("lunch", lunchPlan?.recipe?.name, "Mittag")}
      {renderPill("dinner", dinnerPlan?.recipe?.name, "Abend")}
    </div>
  );
}
