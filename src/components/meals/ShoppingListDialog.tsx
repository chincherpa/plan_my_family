"use client";
import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listIngredientsFor } from "@/lib/recipes/actions";
import { buildShoppingList } from "@/lib/recipes/shoppingList";
import type { Ingredient, Recipe } from "@/lib/recipes/types";
import { cn } from "@/lib/utils";

/** Einkaufszettel für eine Liste geplanter Gerichte (Namen aus dem Essensplan). */
export default function ShoppingListDialog({
  title,
  dishNames,
  recipes,
  onClose,
}: {
  title: string;
  dishNames: string[];
  recipes: Recipe[];
  onClose: () => void;
}) {
  const [ingredients, setIngredients] = useState<Record<number, Ingredient[]> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  // Nur die Rezepte laden, die tatsächlich geplant sind
  const recipeIds = useMemo(() => {
    const wanted = new Set(dishNames.map((n) => n.trim().toLocaleLowerCase("de")));
    return recipes.filter((r) => wanted.has(r.name.trim().toLocaleLowerCase("de"))).map((r) => r.id);
  }, [dishNames, recipes]);

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

  const list = useMemo(
    () => (ingredients ? buildShoppingList(dishNames, recipes, ingredients) : null),
    [ingredients, dishNames, recipes]
  );

  function toggle(zutat: string) {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(zutat)) next.delete(zutat);
      else next.add(zutat);
      return next;
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85dvh] gap-3 overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {error ? (
          <p className="text-sm text-[var(--destructive)]">{error}</p>
        ) : !list ? (
          <div className="space-y-1.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-[var(--accent)]" />
            ))}
          </div>
        ) : list.lines.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--muted-foreground)]">
            Keine Zutaten für die geplanten Gerichte gefunden.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)]">
              {list.lines.map((line) => {
                const checked = done.has(line.zutat);
                return (
                  <li key={line.zutat}>
                    <button
                      type="button"
                      onClick={() => toggle(line.zutat)}
                      aria-pressed={checked}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-[var(--accent)]"
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2",
                          checked
                            ? "border-transparent bg-[var(--primary)] text-[var(--primary-foreground)]"
                            : "border-[var(--input)]"
                        )}
                      >
                        {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                      </span>
                      <span className={cn("min-w-0 flex-1 font-medium", checked && "text-[var(--muted-foreground)] line-through")}>
                        {line.zutat}
                      </span>
                      <span className={cn("tabular shrink-0 text-sm text-[var(--muted-foreground)]", checked && "opacity-50")}>
                        {line.amounts.join(" + ")}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {list.unmatched.length > 0 && (
              <p className="text-xs text-[var(--muted-foreground)]">
                Ohne Rezept, daher ohne Zutaten: {list.unmatched.join(", ")}
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
