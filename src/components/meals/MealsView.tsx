"use client";
import { useState } from "react";
import { CalendarDays, ChefHat } from "lucide-react";
import { useDataStore } from "@/lib/store/dataStore";
import { cn } from "@/lib/utils";
import MealOverview from "./MealOverview";
import DishManager from "./DishManager";

export type MealsTab = "plan" | "gerichte";

const TABS: { id: MealsTab; label: string; icon: typeof ChefHat }[] = [
  { id: "plan", label: "Plan", icon: CalendarDays },
  { id: "gerichte", label: "Gerichte", icon: ChefHat },
];

export default function MealsView({ initialTab }: { initialTab: MealsTab }) {
  const [tab, setTab] = useState<MealsTab>(initialTab);
  const recipeCount = useDataStore((s) => s.recipes.length);

  function switchTab(next: MealsTab) {
    setTab(next);
    // URL mitführen (Reload/Teilen), ohne Server-Roundtrip
    const url = new URL(window.location.href);
    if (next === "plan") url.searchParams.delete("view");
    else url.searchParams.set("view", next);
    window.history.replaceState(null, "", url);
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 px-3 py-5 sm:p-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Essen</h1>
          <div role="tablist" className="flex rounded-xl border border-[var(--border)] bg-[var(--card)] p-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                role="tab"
                type="button"
                aria-selected={tab === id}
                onClick={() => switchTab(id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all",
                  tab === id
                    ? "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
                {id === "gerichte" && recipeCount > 0 && (
                  <span
                    className={cn(
                      "tabular rounded-full px-1.5 text-[11px]",
                      tab === id ? "bg-black/15" : "bg-[var(--accent)]"
                    )}
                  >
                    {recipeCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </header>

        {tab === "plan" ? <MealOverview /> : <DishManager />}
      </div>
    </div>
  );
}
