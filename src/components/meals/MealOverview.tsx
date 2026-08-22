"use client";
import { useMemo, useState } from "react";
import { useDataStore } from "@/lib/store/dataStore";
import { getISOWeek, localDateStr, startOfDay } from "@/lib/utils";
import MealEditDialog from "@/components/calendar/MealEditDialog";

type MealType = "lunch" | "dinner";

interface DayEntry {
  date: Date;
  dateStr: string;
  isPast: boolean;
  isToday: boolean;
}

const DAYS_AHEAD = 31;

export default function MealOverview() {
  const { meals } = useDataStore();
  const [editDate, setEditDate] = useState<string | null>(null);

  const mealsByDate = useMemo(
    () => new Map(meals.map((m) => [m.date, m])),
    [meals]
  );

  const days = useMemo<DayEntry[]>(() => {
    const today = startOfDay(new Date());
    const todayStr = localDateStr(today);

    // Today + the next 30 days, plus any past day that already has a meal
    const entries = new Map<string, DayEntry>();

    for (const meal of meals) {
      if (meal.date >= todayStr) continue;
      entries.set(meal.date, {
        date: new Date(`${meal.date}T00:00:00`),
        dateStr: meal.date,
        isPast: true,
        isToday: false,
      });
    }

    for (let i = 0; i < DAYS_AHEAD; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      const dateStr = localDateStr(date);
      entries.set(dateStr, { date, dateStr, isPast: false, isToday: i === 0 });
    }

    return [...entries.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [meals]);

  // Group by ISO calendar week
  const groups = useMemo(() => {
    const result: { kw: number; year: number; days: DayEntry[] }[] = [];
    for (const day of days) {
      const kw = getISOWeek(day.date);
      const year = day.date.getFullYear();
      const last = result[result.length - 1];
      if (last && last.kw === kw && last.year === year) last.days.push(day);
      else result.push({ kw, year, days: [day] });
    }
    return result;
  }, [days]);

  function renderMealCell(dateStr: string, mealType: MealType, isPast: boolean) {
    const dish = mealsByDate.get(dateStr)?.[mealType];
    const emoji = mealType === "lunch" ? "🍽" : "🌙";
    const label = mealType === "lunch" ? "Mittag" : "Abend";

    return (
      <button
        onClick={() => setEditDate(dateStr)}
        disabled={isPast}
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors w-full text-left ${
          isPast
            ? "cursor-default text-[var(--muted-foreground)]/60"
            : dish
            ? "text-[var(--foreground)] bg-[var(--primary)]/10 hover:bg-[var(--primary)]/20"
            : "text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
        }`}
      >
        <span className={isPast ? "opacity-50" : ""}>{emoji}</span>
        <span className="truncate">
          {dish ?? <span className="italic">{label}</span>}
        </span>
      </button>
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
                        isToday
                          ? "text-[var(--primary)]"
                          : isPast
                          ? "text-[var(--muted-foreground)]"
                          : "text-[var(--foreground)]"
                      }`}
                    >
                      {weekday} {dayLabel}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">{renderMealCell(dateStr, "lunch", isPast)}</div>
                  <div className="flex-1 min-w-0">{renderMealCell(dateStr, "dinner", isPast)}</div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {editDate && (
        <MealEditDialog
          date={editDate}
          meal={mealsByDate.get(editDate) ?? null}
          onClose={() => setEditDate(null)}
        />
      )}
    </div>
  );
}
