"use client";
import { useMemo, useState } from "react";
import { CalendarPlus, Check } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDataStore } from "@/lib/store/dataStore";
import { saveMealSlot } from "@/lib/meals/saveMealSlot";
import { dishKey, type MealType } from "@/lib/recipes/stats";
import { localDateStr, startOfDay } from "@/lib/utils";
import { cn } from "@/lib/utils";

const DAYS = 14;
const SLOTS: { type: MealType; label: string; emoji: string }[] = [
  { type: "lunch", label: "Mittag", emoji: "🍽" },
  { type: "dinner", label: "Abend", emoji: "🌙" },
];

/** Gericht auf einen Mittag/Abend der nächsten 14 Tage legen. */
export default function PlanDishDialog({
  dish,
  onClose,
  onPlanned,
}: {
  dish: string;
  onClose: () => void;
  onPlanned: (message: string) => void;
}) {
  const { family, meals, upsertMeal } = useDataStore();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mealsByDate = useMemo(() => new Map(meals.map((m) => [m.date, m])), [meals]);
  const days = useMemo(() => {
    const today = startOfDay(new Date());
    return Array.from({ length: DAYS }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      return { date: d, dateStr: localDateStr(d), isToday: i === 0 };
    });
  }, []);

  async function plan(dateStr: string, date: Date, type: MealType) {
    if (!family) return;
    const key = `${dateStr}-${type}`;
    setSavingKey(key);
    setError(null);
    const saved = await saveMealSlot(family.id, mealsByDate.get(dateStr), dateStr, type, dish);
    setSavingKey(null);
    if (!saved) {
      setError("Konnte nicht eingeplant werden.");
      return;
    }
    upsertMeal(saved);
    const when = date.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "numeric" });
    onPlanned(`„${dish}“ für ${when} (${type === "lunch" ? "Mittag" : "Abend"}) eingeplant`);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            <CalendarPlus className="h-4 w-4 shrink-0 text-[var(--primary)]" />
            <span className="truncate">„{dish}“ einplanen</span>
          </DialogTitle>
          <DialogPrimitive.Description className="text-sm text-[var(--muted-foreground)]">
            Freien Platz wählen – belegte werden ersetzt.
          </DialogPrimitive.Description>
        </DialogHeader>

        {error && (
          <p className="rounded-md bg-[var(--destructive)]/10 px-3 py-2 text-sm text-[var(--destructive)]">
            {error}
          </p>
        )}

        <div className="-mx-1 max-h-[55dvh] space-y-1 overflow-y-auto px-1">
          {days.map(({ date, dateStr, isToday }) => {
            const meal = mealsByDate.get(dateStr);
            const weekend = date.getDay() === 0 || date.getDay() === 6;
            return (
              <div
                key={dateStr}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-2 py-1.5",
                  isToday && "bg-[var(--primary)]/8"
                )}
              >
                <div className="w-16 shrink-0 leading-tight">
                  <p
                    className={cn(
                      "text-sm font-semibold",
                      isToday ? "text-[var(--primary)]" : weekend && "text-[var(--warning)]"
                    )}
                  >
                    {isToday ? "Heute" : date.toLocaleDateString("de-DE", { weekday: "short" })}
                  </p>
                  <p className="tabular text-xs text-[var(--muted-foreground)]">
                    {date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
                  </p>
                </div>
                {SLOTS.map(({ type, label, emoji }) => {
                  const current = meal?.[type] ?? null;
                  const isSame = !!current && dishKey(current) === dishKey(dish);
                  const key = `${dateStr}-${type}`;
                  return (
                    <button
                      key={type}
                      type="button"
                      disabled={savingKey !== null || isSame}
                      onClick={() => plan(dateStr, date, type)}
                      title={current && !isSame ? `ersetzt „${current}“` : undefined}
                      className={cn(
                        "flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-sm transition-all",
                        isSame
                          ? "bg-[var(--primary)]/15 text-[var(--primary)]"
                          : current
                          ? "bg-[var(--accent)] text-[var(--muted-foreground)] hover:bg-[var(--destructive)]/10 hover:text-[var(--foreground)]"
                          : "border border-dashed border-[var(--input)] text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:bg-[var(--primary)]/10 hover:text-[var(--primary)]",
                        savingKey === key && "animate-pulse"
                      )}
                    >
                      <span className="shrink-0 text-xs">{isSame ? <Check className="h-3.5 w-3.5" /> : emoji}</span>
                      <span className="truncate">{current ?? <span className="italic">{label} frei</span>}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
