"use client";
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { listIngredientsFor } from "@/lib/recipes/actions";
import {
  buildShoppingList,
  ingredientLines,
  type IngredientLine,
  type PlannedDish,
  type Slot,
} from "@/lib/recipes/shoppingList";
import type { Ingredient, Recipe } from "@/lib/recipes/types";
import { cn } from "@/lib/utils";

const slotLabel = ({ date, type }: Slot) => {
  const day = new Date(`${date}T12:00:00`).toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
  return `${day} ${type === "lunch" ? "Mittag" : "Abend"}`;
};

/**
 * Einkaufszettel einer Kalenderwoche, alphabetisch nach Zutat. Der Abhak-Status liegt in
 * `shopping_checks` und wird per Realtime zwischen den Geräten der Familie abgeglichen.
 */
export default function ShoppingListDialog({
  title,
  familyId,
  weekStart,
  planned,
  recipes,
  onClose,
}: {
  title: string;
  familyId: string;
  /** Montag der Woche, "YYYY-MM-DD" */
  weekStart: string;
  planned: PlannedDish[];
  recipes: Recipe[];
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [ingredients, setIngredients] = useState<Record<number, Ingredient[]> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string> | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  // Nur die Rezepte laden, die tatsächlich geplant sind
  const recipeIds = useMemo(() => {
    const wanted = new Set(planned.map((p) => p.name.trim().toLocaleLowerCase("de")));
    return recipes.filter((r) => wanted.has(r.name.trim().toLocaleLowerCase("de"))).map((r) => r.id);
  }, [planned, recipes]);

  useEffect(() => {
    let alive = true;
    listIngredientsFor(recipeIds).then((res) => {
      if (!alive) return;
      if ("error" in res) setError(res.error);
      else setIngredients(res.data);
    });
    return () => {
      alive = false;
    };
  }, [recipeIds]);

  // Laden + Änderungen anderer Geräte live übernehmen
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      supabase
        .from("shopping_checks")
        .select("item_key")
        .eq("family_id", familyId)
        .eq("week_start", weekStart)
        .then(({ data, error }) => {
          if (!alive) return;
          if (error) {
            console.error("shopping_checks laden fehlgeschlagen", error);
            setError("Abhak-Status konnte nicht geladen werden.");
            return;
          }
          setChecked(new Set(data.map((r) => r.item_key)));
        });

    refresh();
    const channel = supabase
      .channel(`shopping-checks-${weekStart}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shopping_checks", filter: `family_id=eq.${familyId}` },
        (payload) => {
          const record = (Object.keys(payload.new).length > 0 ? payload.new : payload.old) as {
            week_start?: string;
          };
          if (record.week_start === undefined || record.week_start === weekStart) refresh();
        }
      )
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, familyId, weekStart]);

  const list = useMemo(
    () => (ingredients ? buildShoppingList(planned, recipes, ingredients) : null),
    [ingredients, planned, recipes]
  );
  const lines = useMemo(() => (list ? ingredientLines(list) : []), [list]);

  async function toggleChecked(line: IngredientLine) {
    if (!checked) return;
    const wasChecked = checked.has(line.key);
    const apply = (on: boolean) =>
      setChecked((prev) => {
        const next = new Set(prev);
        if (on) next.add(line.key);
        else next.delete(line.key);
        return next;
      });
    apply(!wasChecked); // optimistisch

    const { error } = wasChecked
      ? await supabase
          .from("shopping_checks")
          .delete()
          .eq("family_id", familyId)
          .eq("week_start", weekStart)
          .eq("item_key", line.key)
      : await supabase
          .from("shopping_checks")
          .upsert(
            { family_id: familyId, week_start: weekStart, item_key: line.key },
            { onConflict: "family_id,week_start,item_key", ignoreDuplicates: true }
          );
    if (error) {
      console.error("shopping_checks speichern fehlgeschlagen", error);
      apply(wasChecked);
      setError("Konnte nicht gespeichert werden. Bitte nochmal versuchen.");
    }
  }

  function toggleOpen(key: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const doneCount = checked ? lines.filter((l) => checked.has(l.key)).length : 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85dvh] gap-3 overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {list && checked && lines.length > 0 && (
            <p className="tabular text-sm text-[var(--muted-foreground)]">
              {doneCount}/{lines.length} eingekauft · wird mit der Familie geteilt
            </p>
          )}
        </DialogHeader>

        {error && (
          <p className="rounded-md bg-[var(--destructive)]/10 px-3 py-2 text-sm text-[var(--destructive)]">
            {error}
          </p>
        )}

        {!list || !checked ? (
          !error && (
            <div className="space-y-1.5">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-[var(--accent)]" />
              ))}
            </div>
          )
        ) : lines.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--muted-foreground)]">
            Keine Zutaten für die geplanten Gerichte gefunden.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)]">
            {lines.map((line) => {
              const isDone = checked.has(line.key);
              const expanded = open.has(line.key);
              return (
                <li key={line.key}>
                  <div className="flex items-center">
                    {/* Abhaken nur über die Checkbox */}
                    <button
                      type="button"
                      onClick={() => toggleChecked(line)}
                      aria-pressed={isDone}
                      aria-label={`${line.zutat} ${isDone ? "wieder auf die Liste" : "als eingekauft markieren"}`}
                      className="flex shrink-0 items-center py-2.5 pl-3 pr-2"
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-md border-2",
                          isDone
                            ? "border-transparent bg-[var(--primary)] text-[var(--primary-foreground)]"
                            : "border-[var(--input)]"
                        )}
                      >
                        {isDone && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                      </span>
                    </button>

                    {/* Antippen zeigt, für welche Gerichte die Zutat gebraucht wird */}
                    <button
                      type="button"
                      onClick={() => toggleOpen(line.key)}
                      aria-expanded={expanded}
                      className="flex min-w-0 flex-1 items-center gap-2 py-2.5 pr-3 text-left"
                    >
                      <span
                        className={cn(
                          "min-w-0 flex-1 font-medium",
                          isDone && "text-[var(--muted-foreground)] line-through"
                        )}
                      >
                        {line.zutat}
                      </span>
                      {line.amounts.length > 0 && (
                        <span
                          className={cn(
                            "tabular shrink-0 text-sm text-[var(--muted-foreground)]",
                            isDone && "opacity-50"
                          )}
                        >
                          {line.amounts.join(" + ")}
                        </span>
                      )}
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 text-[var(--muted-foreground)] transition-transform",
                          expanded && "rotate-180"
                        )}
                      />
                    </button>
                  </div>

                  {expanded && (
                    <ul className="space-y-1 bg-[var(--accent)]/40 px-4 pb-3 pt-1 text-sm">
                      {line.uses.map((u) => (
                        <li key={u.dish} className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-medium">
                            {u.slots.length > 1 && (
                              <span className="tabular mr-1 text-[var(--muted-foreground)]">{u.slots.length}×</span>
                            )}
                            {u.dish}
                          </span>
                          {(line.uses.length > 1 || u.slots.length > 1) && u.amounts.length > 0 && (
                            <span className="tabular text-xs text-[var(--muted-foreground)]">
                              {u.amounts.join(" + ")}
                            </span>
                          )}
                          <span className="tabular ml-auto text-xs text-[var(--muted-foreground)]">
                            {u.slots.map(slotLabel).join(" · ")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {list && list.unmatched.length > 0 && (
          <p className="text-xs text-[var(--muted-foreground)]">
            Ohne Rezept, daher ohne Zutaten: {list.unmatched.join(", ")}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
