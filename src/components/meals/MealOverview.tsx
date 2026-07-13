"use client";
import { useMemo, useState } from "react";
import { useDataStore } from "@/lib/store/dataStore";
import MealDropdown from "./MealDropdown";

type MealType = "lunch" | "dinner";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

interface DayEntry {
  date: Date;
  dateStr: string;
  isPast: boolean;
  isToday: boolean;
}

export default function MealOverview() {
  const { mealPlans } = useDataStore();
  const [open, setOpen] = useState<{ dateStr: string; mealType: MealType } | null>(null);

  const today = startOfDay(new Date());

  const days = useMemo<DayEntry[]>(() => {
    // Past days that have at least one meal plan
    const pastDateStrs = new Set(
      mealPlans
        .filter((p) => new Date(p.date) < today)
        .map((p) => p.date)
    );
    const pastDays: DayEntry[] = Array.from(pastDateStrs)
      .map((ds) => {
        const date = new Date(ds + "T00:00:00");
        return { date, dateStr: ds, isPast: true, isToday: false };
      });

    // All days from today + 30 days ahead
    const futureDays: DayEntry[] = Array.from({ length: 31 }, (_, i) => {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      const dateStr = toDateStr(date);
      return { date, dateStr, isPast: false, isToday: i === 0 };
    });

    // Merge, sort ascending, deduplicate (today might also appear in pastDateStrs edge-case)
    const all = [...pastDays, ...futureDays];
    const seen = new Set<string>();
    return all
      .filter((d) => {
        if (seen.has(d.dateStr)) return false;
        seen.add(d.dateStr);
        return true;
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [mealPlans, today]);

  // Group by KW
  const groups = useMemo(() => {
    const result: { kw: number; year: number; days: DayEntry[] }[] = [];
    for (const day of days) {
      const kw = getISOWeek(day.date);
      const year = day.date.getFullYear();
      const last = result[result.length - 1];
      if (last && last.kw === kw && last.year === year) {
        last.days.push(day);
      } else {
        result.push({ kw, year, days: [day] });
      }
    }
    return result;
  }, [days]);

  function getMealPlan(dateStr: string, mealType: MealType) {
    return mealPlans.find((p) => p.date === dateStr && p.meal_type === mealType);
  }

  function renderMealCell(dateStr: string, mealType: MealType, isPast: boolean) {
    const plan = getMealPlan(dateStr, mealType);
    const hasRecipe = !!plan?.recipe;
    const isOpen = open?.dateStr === dateStr && open?.mealType === mealType;
    const emoji = mealType === "lunch" ? "🍽" : "🌙";
    const label = mealType === "lunch" ? "Mittag" : "Abend";

    return (
      <div className="relative">
        <button
          onClick={() => setOpen(isOpen ? null : { dateStr, mealType })}
          disabled={isPast}
          className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors w-full text-left ${
            isPast
              ? "cursor-default text-[var(--muted-foreground)]/60"
              : hasRecipe
              ? "text-[var(--foreground)] bg-[var(--primary)]/10 hover:bg-[var(--primary)]/20"
              : "text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
          }`}
        >
          <span className={isPast ? "opacity-50" : ""}>{emoji}</span>
          <span className="truncate">
            {hasRecipe ? plan!.recipe!.name : <span className="italic">{label}</span>}
          </span>
        </button>
        {isOpen && (
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
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Mahlzeiten</h1>

      {groups.map(({ kw, year, days: groupDays }) => (
        <div key={`${year}-${kw}`}>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
              KW {kw}
            </span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>

          <div className="space-y-1">
            {groupDays.map(({ date, dateStr, isPast, isToday }) => {
              const weekday = date.toLocaleDateString("de-DE", { weekday: "short" });
              const dayLabel = date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });

              return (
                <div
                  key={dateStr}
                  className={`flex items-center gap-3 px-3 py-1.5 rounded-lg transition-colors ${
                    isToday
                      ? "bg-[var(--primary)]/8 ring-1 ring-[var(--primary)]/30"
                      : isPast
                      ? "opacity-50"
                      : "hover:bg-[var(--muted)]/40"
                  }`}
                >
                  {/* Date label */}
                  <div className="w-20 shrink-0 flex items-center gap-1.5">
                    {isToday && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] shrink-0" />
                    )}
                    <span
                      className={`text-xs font-medium ${
                        isToday ? "text-[var(--primary)]" : isPast ? "text-[var(--muted-foreground)]" : "text-[var(--foreground)]"
                      }`}
                    >
                      {weekday} {dayLabel}
                    </span>
                  </div>

                  {/* Lunch */}
                  <div className="flex-1 min-w-0">
                    {renderMealCell(dateStr, "lunch", isPast)}
                  </div>

                  {/* Dinner */}
                  <div className="flex-1 min-w-0">
                    {renderMealCell(dateStr, "dinner", isPast)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
