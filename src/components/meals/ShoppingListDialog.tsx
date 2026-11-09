"use client";
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listIngredientsFor } from "@/lib/recipes/actions";
import { buildShoppingList, type PlannedDish, type ShoppingSource } from "@/lib/recipes/shoppingList";
import type { Ingredient, Recipe } from "@/lib/recipes/types";
import { cn } from "@/lib/utils";

const slotLabel = (date: string, type: "lunch" | "dinner") => {
  const day = new Date(`${date}T12:00:00`).toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
  return `${day} · ${type === "lunch" ? "Mittag" : "Abend"}`;
};

/** Einkaufszettel für die geplanten Gerichte einer Woche. */
export default function ShoppingListDialog({
  title,
  planned,
  recipes,
  onClose,
}: {
  title: string;
  planned: PlannedDish[];
  recipes: Recipe[];
  onClose: () => void;
}) {
  const [ingredients, setIngredients] = useState<Record<number, Ingredient[]> | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Abgehakte Zutaten (nur für diesen Dialog, nicht gespeichert) */
  const [done, setDone] = useState<Set<string>>(new Set());
  /** Aufgeklappte Infofelder */
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

  const list = useMemo(
    () => (ingredients ? buildShoppingList(planned, recipes, ingredients) : null),
    [ingredients, planned, recipes]
  );

  function toggleIn(set: Set<string>, key: string): Set<string> {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
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
                const expanded = open.has(line.zutat);
                return (
                  <li key={line.zutat}>
                    <div className="flex items-center">
                      {/* Abhaken nur über die Checkbox */}
                      <button
                        type="button"
                        onClick={() => setDone((d) => toggleIn(d, line.zutat))}
                        aria-pressed={checked}
                        aria-label={`${line.zutat} ${checked ? "wieder auf die Liste" : "als eingekauft markieren"}`}
                        className="flex shrink-0 items-center py-2.5 pl-3 pr-2"
                      >
                        <span
                          className={cn(
                            "flex h-5 w-5 items-center justify-center rounded-md border-2",
                            checked
                              ? "border-transparent bg-[var(--primary)] text-[var(--primary-foreground)]"
                              : "border-[var(--input)]"
                          )}
                        >
                          {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                        </span>
                      </button>

                      {/* Antippen klappt die Info aus */}
                      <button
                        type="button"
                        onClick={() => setOpen((o) => toggleIn(o, line.zutat))}
                        aria-expanded={expanded}
                        className="flex min-w-0 flex-1 items-center gap-2 py-2.5 pr-3 text-left"
                      >
                        <span
                          className={cn(
                            "min-w-0 flex-1 font-medium",
                            checked && "text-[var(--muted-foreground)] line-through"
                          )}
                        >
                          {line.zutat}
                        </span>
                        <span
                          className={cn(
                            "tabular shrink-0 text-sm text-[var(--muted-foreground)]",
                            checked && "opacity-50"
                          )}
                        >
                          {line.amounts.join(" + ")}
                        </span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 shrink-0 text-[var(--muted-foreground)] transition-transform",
                            expanded && "rotate-180"
                          )}
                        />
                      </button>
                    </div>

                    {expanded && (
                      <div className="space-y-2 bg-[var(--accent)]/50 px-4 pb-3 pt-1 text-sm">
                        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                          Gebraucht für
                        </p>
                        <ul className="space-y-1.5">
                          {line.sources.map((s: ShoppingSource) => (
                            <li key={s.dish}>
                              <span className="font-medium">{s.dish}</span>
                              <span className="block text-xs text-[var(--muted-foreground)]">
                                {s.slots.map((slot) => slotLabel(slot.date, slot.type)).join(" · ")}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
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
