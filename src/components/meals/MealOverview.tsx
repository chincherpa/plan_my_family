"use client";
import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useDataStore } from "@/lib/store/dataStore";
import { getISOWeek, localDateStr, startOfDay } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import MealEditDialog from "@/components/calendar/MealEditDialog";
import type { Meal } from "@/lib/supabase/types";

type MealType = "lunch" | "dinner";

interface DayEntry {
  date: Date;
  dateStr: string;
  isPast: boolean;
  isToday: boolean;
}

const DAYS_AHEAD = 31;

export default function MealOverview() {
  const { family, meals, upsertMeal } = useDataStore();
  const [editDate, setEditDate] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

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

  async function handleDelete(dateStr: string, mealType: MealType) {
    if (!family) return;
    const key = `${dateStr}-${mealType}`;
    setDeleting(key);
    const supabase = createClient();
    const existing = mealsByDate.get(dateStr);
    const { data, error } = await supabase
      .from("meals")
      .upsert(
        {
          family_id: family.id,
          date: dateStr,
          lunch: mealType === "lunch" ? null : existing?.lunch ?? null,
          dinner: mealType === "dinner" ? null : existing?.dinner ?? null,
        },
        { onConflict: "family_id,date" }
      )
      .select()
      .single();
    setDeleting(null);
    if (!error && data) upsertMeal(data as Meal);
  }

  async function handleSwap(fromDate: string, toDate: string, mealType: MealType) {
    if (!family || fromDate === toDate) return;
    const from = mealsByDate.get(fromDate);
    const to = mealsByDate.get(toDate);
    const fromDish = from?.[mealType] ?? null;
    const toDish = to?.[mealType] ?? null;
    if (!fromDish) return;

    const supabase = createClient();
    const [fromResult, toResult] = await Promise.all([
      supabase
        .from("meals")
        .upsert(
          {
            family_id: family.id,
            date: fromDate,
            lunch: mealType === "lunch" ? toDish : from?.lunch ?? null,
            dinner: mealType === "dinner" ? toDish : from?.dinner ?? null,
          },
          { onConflict: "family_id,date" }
        )
        .select()
        .single(),
      supabase
        .from("meals")
        .upsert(
          {
            family_id: family.id,
            date: toDate,
            lunch: mealType === "lunch" ? fromDish : to?.lunch ?? null,
            dinner: mealType === "dinner" ? fromDish : to?.dinner ?? null,
          },
          { onConflict: "family_id,date" }
        )
        .select()
        .single(),
    ]);

    if (!fromResult.error && fromResult.data) upsertMeal(fromResult.data as Meal);
    if (!toResult.error && toResult.data) upsertMeal(toResult.data as Meal);
  }

  function renderMealCell(dateStr: string, mealType: MealType, isPast: boolean) {
    const dish = mealsByDate.get(dateStr)?.[mealType];
    const emoji = mealType === "lunch" ? "🍽" : "🌙";
    const label = mealType === "lunch" ? "Mittag" : "Abend";
    const key = `${dateStr}-${mealType}`;
    const isDragOver = dragOverKey === key && dragKey !== key;

    return (
      <div className="flex items-center gap-1">
        <button
          onClick={() => setEditDate(dateStr)}
          disabled={isPast}
          draggable={!isPast && !!dish}
          onDragStart={(e) => {
            setDragKey(key);
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", key);
          }}
          onDragEnd={() => {
            setDragKey(null);
            setDragOverKey(null);
          }}
          onDragOver={(e) => {
            if (isPast || dragKey === null) return;
            const [, dragMealType] = dragKey.split(/-(?=[a-z]+$)/);
            if (dragMealType !== mealType) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDragOverKey(key);
          }}
          onDragLeave={() => setDragOverKey((k) => (k === key ? null : k))}
          onDrop={(e) => {
            e.preventDefault();
            setDragOverKey(null);
            setDragKey(null);
            const sourceKey = e.dataTransfer.getData("text/plain");
            const [sourceDate, sourceMealType] = sourceKey.split(/-(?=[a-z]+$)/);
            if (sourceMealType !== mealType) return;
            handleSwap(sourceDate, dateStr, mealType);
          }}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full text-left ${
            isPast
              ? "cursor-default text-[var(--muted-foreground)]/60"
              : dish
              ? "text-[var(--foreground)] bg-[var(--primary)]/10 hover:bg-[var(--primary)]/20 cursor-grab active:cursor-grabbing"
              : "text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
          } ${isDragOver ? "ring-2 ring-[var(--primary)]" : ""} ${
            dragKey === key ? "opacity-40" : ""
          }`}
        >
          <span className={isPast ? "opacity-50" : ""}>{emoji}</span>
          <span className="truncate">
            {dish ?? <span className="italic">{label}</span>}
          </span>
        </button>
        {dish && !isPast && (
          <button
            type="button"
            onClick={() => handleDelete(dateStr, mealType)}
            disabled={deleting === key}
            title="Eintrag löschen"
            className="shrink-0 p-1 rounded text-[var(--destructive)] hover:bg-[var(--destructive)]/10 disabled:opacity-40"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-3 py-5 sm:p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Essensplan</h1>
        <p className="text-sm text-[var(--muted-foreground)]">Tippen zum Bearbeiten · Ziehen zum Tauschen</p>
      </div>

      {groups.map(({ kw, year, days: groupDays }) => (
        <div key={`${year}-${kw}`}>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
              KW {kw}
            </span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>

          <div className="space-y-1.5">
            {groupDays.map(({ date, dateStr, isPast, isToday }) => {
              const weekday = date.toLocaleDateString("de-DE", { weekday: "short" });
              const dayLabel = date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });

              return (
                <div
                  key={dateStr}
                  className={`flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1.5 px-3 py-2 rounded-xl bg-[var(--card)] transition-colors ${
                    isToday
                      ? "ring-2 ring-[var(--primary)]"
                      : isPast
                      ? "opacity-50"
                      : ""
                  }`}
                >
                  {/* Date label */}
                  <div className="w-full sm:w-24 shrink-0 flex items-center gap-1.5">
                    {isToday && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] shrink-0" />
                    )}
                    <span
                      className={`text-sm font-semibold ${
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
