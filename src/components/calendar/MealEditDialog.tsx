"use client";
import { useMemo, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  ArrowDownAZ,
  CalendarDays,
  Check,
  Dices,
  Flame,
  Hourglass,
  PenLine,
  Search,
  TriangleAlert,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useDataStore } from "@/lib/store/dataStore";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Meal } from "@/lib/supabase/types";
import { categoryLabel } from "@/lib/recipes/logic";
import {
  categoryEmoji,
  computeDishStats,
  dishKey,
  FALLBACK_CATEGORY_COLOR,
  pickSuggestion,
  relativeDay,
  sortRecipes,
  statsFor,
  type MealType,
  type SortMode,
} from "@/lib/recipes/stats";
import { categoryForDate, parseWeekdayCategories } from "@/lib/meals/weekdayCategories";
import { filterRecipes, nearbyPlans, offsetLabel } from "@/lib/meals/mealPicker";
import { cn, hexToRgba, localDateStr } from "@/lib/utils";

interface MealEditDialogProps {
  /** Local date "YYYY-MM-DD" */
  date: string;
  meal: Meal | null;
  /** Welcher Slot beim Öffnen aktiv ist; sonst der erste freie */
  initialType?: MealType;
  onClose: () => void;
}

const SLOTS: { type: MealType; label: string; emoji: string }[] = [
  { type: "lunch", label: "Mittag", emoji: "🍽" },
  { type: "dinner", label: "Abend", emoji: "🌙" },
];

const SORTS: { mode: SortMode; label: string; icon: typeof Flame }[] = [
  { mode: "popular", label: "Beliebt", icon: Flame },
  { mode: "name", label: "A–Z", icon: ArrowDownAZ },
  { mode: "forgotten", label: "Lange her", icon: Hourglass },
];

const shortDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });

export default function MealEditDialog({ date, meal, initialType, onClose }: MealEditDialogProps) {
  const { family, meals, upsertMeal, recipes, recipeCategories, recipesError } = useDataStore();
  const todayStr = localDateStr(new Date());

  const [values, setValues] = useState<Record<MealType, string>>({
    lunch: meal?.lunch ?? "",
    dinner: meal?.dinner ?? "",
  });
  const [active, setActive] = useState<MealType>(
    initialType ?? (!meal?.lunch?.trim() || meal?.dinner?.trim() ? "lunch" : "dinner")
  );
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("popular");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Wochenplan (Einstellungen): Kategorie des Wochentags vorauswählen, falls es Gerichte darin gibt
  const dayCategory = useMemo(() => {
    const name = categoryForDate(parseWeekdayCategories(family?.meal_weekday_categories), date);
    if (!name) return null;
    return recipes.find((r) => dishKey(r.category) === dishKey(name))?.category ?? null;
  }, [family?.meal_weekday_categories, date, recipes]);
  const [category, setCategory] = useState<string | null>(dayCategory);

  const stats = useMemo(() => computeDishStats(meals, todayStr), [meals, todayStr]);
  const catByName = useMemo(() => new Map(recipeCategories.map((c) => [c.name, c])), [recipeCategories]);

  const chips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of recipes) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
    return [...counts.entries()]
      .sort(([a], [b]) => (a === dayCategory ? -1 : b === dayCategory ? 1 : a.localeCompare(b, "de")))
      .map(([name, count]) => ({ name, count, cat: catByName.get(name) }));
  }, [recipes, catByName, dayCategory]);

  const sorted = useMemo(() => sortRecipes(recipes, stats, sort), [recipes, stats, sort]);
  const visible = useMemo(() => filterRecipes(sorted, query, category), [sorted, query, category]);
  // Suche über alle Kategorien, wenn in der gewählten nichts passt
  const searchAll = query.trim() !== "" && visible.length === 0 && category !== null;
  const shown = searchAll ? filterRecipes(sorted, query, null) : visible;

  const trimmedQuery = query.trim();
  const exactMatch = recipes.some((r) => dishKey(r.name) === dishKey(trimmedQuery));

  const dateLabel = new Date(`${date}T12:00:00`).toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  function pick(name: string) {
    const other: MealType = active === "lunch" ? "dinner" : "lunch";
    const unpick = dishKey(values[active]) === dishKey(name);
    setValues((v) => ({ ...v, [active]: unpick ? "" : name }));
    setQuery("");
    // Mittag gewählt, Abend noch frei: direkt weiter zum Abend
    if (!unpick && active === "lunch" && !values[other].trim()) setActive(other);
  }

  function rollDice() {
    const pool = category === null ? recipes : recipes.filter((r) => r.category === category);
    const current = recipes.find((r) => dishKey(r.name) === dishKey(values[active]));
    const choice = pickSuggestion(pool, stats, todayStr, Math.random, current?.id);
    if (!choice) return;
    setValues((v) => ({ ...v, [active]: choice.name }));
    setQuery("");
    requestAnimationFrame(() =>
      listRef.current
        ?.querySelector(`[data-recipe-id="${choice.id}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    );
  }

  async function handleSave() {
    if (!family) return;
    // Nur Slots schreiben, die sich seit dem Öffnen geändert haben
    const changed: Partial<Record<MealType, string | null>> = {};
    for (const type of ["lunch", "dinner"] as const) {
      const next = values[type].trim() || null;
      if (next !== ((meal?.[type] ?? "").trim() || null)) changed[type] = next;
    }
    if (Object.keys(changed).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    const { data, error: saveError } = await createClient()
      .from("meals")
      .upsert(
        {
          family_id: family.id,
          date,
          ...changed,
        },
        { onConflict: "family_id,date" }
      )
      .select()
      .single();

    setSaving(false);
    if (saveError || !data) {
      setError("Essensplan konnte nicht gespeichert werden.");
      return;
    }
    upsertMeal(data as Meal);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex h-[90dvh] flex-col gap-3 overflow-hidden pb-5 sm:h-[min(44rem,85dvh)] sm:max-w-lg"
        onOpenAutoFocus={(e) => {
          // Auf dem Handy keine Tastatur, die die Liste verdeckt
          e.preventDefault();
          if (window.matchMedia("(pointer: fine)").matches) searchRef.current?.focus();
        }}
      >
        <DialogHeader className="pr-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            Essensplan
          </p>
          <DialogTitle>{dateLabel}</DialogTitle>
          <DialogPrimitive.Description className="sr-only">
            Gericht für Mittag und Abend auswählen
          </DialogPrimitive.Description>
        </DialogHeader>

        {/* Mittag / Abend */}
        <div className="grid grid-cols-2 gap-2">
          {SLOTS.map(({ type, label, emoji }) => {
            const value = values[type].trim();
            const isActive = active === type;
            return (
              <div
                key={type}
                className={cn(
                  "relative rounded-xl border transition-all",
                  isActive
                    ? "border-[var(--primary)] bg-[var(--primary)]/10 shadow-sm ring-1 ring-[var(--primary)]"
                    : "border-[var(--border)] hover:bg-[var(--accent)]"
                )}
              >
                <button
                  type="button"
                  onClick={() => setActive(type)}
                  aria-pressed={isActive}
                  className="block w-full px-3 py-2 pr-8 text-left"
                >
                  <span className="text-xs font-medium text-[var(--muted-foreground)]">
                    {emoji} {label}
                  </span>
                  <span
                    className={cn(
                      "block truncate text-sm font-semibold",
                      !value && "font-normal italic text-[var(--muted-foreground)]"
                    )}
                  >
                    {value || "noch frei"}
                  </span>
                </button>
                {value && (
                  <button
                    type="button"
                    onClick={() => setValues((v) => ({ ...v, [type]: "" }))}
                    title={`${label} leeren`}
                    className="absolute right-1.5 top-1.5 rounded-md p-1 text-[var(--muted-foreground)] hover:bg-[var(--destructive)]/10 hover:text-[var(--destructive)]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Suche */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || !trimmedQuery) return;
              e.preventDefault();
              pick(shown[0]?.name ?? trimmedQuery);
            }}
            placeholder={`${SLOTS.find((s) => s.type === active)!.label}: Gericht suchen oder eintippen`}
            enterKeyHint="done"
            className="h-10 w-full rounded-xl border border-[var(--input)] bg-[var(--background)] pl-9 pr-9 text-sm outline-none placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                searchRef.current?.focus();
              }}
              title="Suche leeren"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {recipes.length > 0 && (
          <>
            {/* Kategorien */}
            <div className="no-scrollbar -mx-5 flex shrink-0 gap-1.5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
              <Chip active={category === null} onClick={() => setCategory(null)}>
                Alle <span className="tabular opacity-60">{recipes.length}</span>
              </Chip>
              {chips.map(({ name, count, cat }) => (
                <Chip
                  key={name}
                  active={category === name}
                  color={cat?.color ?? FALLBACK_CATEGORY_COLOR}
                  onClick={() => setCategory(category === name ? null : name)}
                >
                  {name === dayCategory && (
                    <CalendarDays className="h-3.5 w-3.5 text-[var(--primary)]" aria-label="Wochenplan" />
                  )}
                  <span className="text-xs">{categoryEmoji(cat)}</span>
                  {categoryLabel(name)}
                  <span className="tabular opacity-60">{count}</span>
                </Chip>
              ))}
            </div>

            {/* Sortierung + Zufall */}
            <div className="flex shrink-0 items-center gap-2">
              <div className="flex flex-1 rounded-xl bg-[var(--background)] p-0.5">
                {SORTS.map(({ mode, label, icon: Icon }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setSort(mode)}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 rounded-[10px] py-1.5 text-xs font-medium transition-all",
                      sort === mode
                        ? "bg-[var(--accent)] text-[var(--foreground)] shadow-sm"
                        : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={rollDice}
                title="Zufallsvorschlag (lange nicht gegessen wird bevorzugt)"
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--border)] px-2.5 text-xs font-medium hover:bg-[var(--accent)]"
              >
                <Dices className="h-4 w-4 text-[var(--primary)]" />
                Zufall
              </button>
            </div>
          </>
        )}

        {/* Gerichte */}
        <div ref={listRef} className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {trimmedQuery && !exactMatch && (
            <button
              type="button"
              onClick={() => pick(trimmedQuery)}
              className="mb-1 flex w-full items-center gap-3 rounded-xl border border-dashed border-[var(--input)] px-3 py-2.5 text-left hover:bg-[var(--accent)]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]">
                <PenLine className="h-4 w-4 text-[var(--muted-foreground)]" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">„{trimmedQuery}“ übernehmen</span>
                <span className="block text-xs text-[var(--muted-foreground)]">Freitext, ohne Rezept</span>
              </span>
            </button>
          )}

          {searchAll && shown.length > 0 && (
            <p className="px-1 pb-1 pt-0.5 text-xs text-[var(--muted-foreground)]">
              Nichts in {categoryLabel(category!)} – Treffer aus allen Kategorien:
            </p>
          )}

          {shown.length === 0 && !trimmedQuery && (
            <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">
              {recipesError
                ? "Rezeptliste nicht verfügbar – einfach oben eintippen."
                : recipes.length === 0
                ? "Noch keine Gerichte angelegt – einfach oben eintippen."
                : "Keine Gerichte in dieser Kategorie."}
            </p>
          )}

          <ul className="space-y-1">
            {shown.map((recipe) => {
              const cat = catByName.get(recipe.category);
              const color = cat?.color ?? FALLBACK_CATEGORY_COLOR;
              const s = statsFor(stats, recipe.name);
              const key = dishKey(recipe.name);
              const selected = dishKey(values[active]) === key;
              const inOther = SLOTS.find((slot) => slot.type !== active && dishKey(values[slot.type]) === key);
              const near = nearbyPlans(s, date)[0];
              return (
                <li key={recipe.id} data-recipe-id={recipe.id}>
                  <button
                    type="button"
                    onClick={() => pick(recipe.name)}
                    aria-pressed={selected}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors",
                      selected ? "bg-[var(--primary)]/15 ring-1 ring-[var(--primary)]" : "hover:bg-[var(--accent)]"
                    )}
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base"
                      style={{ backgroundColor: hexToRgba(color, 0.22) }}
                    >
                      {categoryEmoji(cat)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{recipe.name}</span>
                      <span className="block truncate text-xs text-[var(--muted-foreground)]">
                        {category === null && <>{categoryLabel(recipe.category)} · </>}
                        {s.lastDate ? `zuletzt ${relativeDay(s.lastDate, todayStr)}` : "noch nie gegessen"}
                        {s.count > 1 && ` · ${s.count}×`}
                      </span>
                      {near && (
                        <span className="mt-0.5 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                          <TriangleAlert className="h-3 w-3 shrink-0" />
                          <span className="truncate">
                            schon {offsetLabel(near.offset)} geplant ({shortDate(near.date)}{" "}
                            {near.type === "lunch" ? "Mittag" : "Abend"})
                          </span>
                        </span>
                      )}
                    </span>
                    {inOther && !selected && (
                      <span className="shrink-0 rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-medium text-[var(--muted-foreground)]">
                        {inOther.label}
                      </span>
                    )}
                    {selected && (
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)]">
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {error && (
          <p className="shrink-0 rounded-md bg-[var(--destructive)]/10 px-3 py-2 text-sm text-[var(--destructive)]">
            {error}
          </p>
        )}

        <div className="flex shrink-0 gap-2 border-t border-[var(--border)] pt-3">
          <Button variant="outline" className="flex-1" onClick={onClose} type="button">
            Abbrechen
          </Button>
          <Button className="flex-1" onClick={handleSave} disabled={saving}>
            {saving ? "Speichern…" : "Speichern"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Chip({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-sm transition-all",
        active
          ? "border-transparent font-medium text-[var(--foreground)] shadow-sm"
          : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      )}
      style={active ? { backgroundColor: color ? hexToRgba(color, 0.25) : "var(--accent)" } : undefined}
    >
      {children}
    </button>
  );
}
