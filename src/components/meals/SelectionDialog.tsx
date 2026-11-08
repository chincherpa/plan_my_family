"use client";
import { FileDown, X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { categoryLabel } from "@/lib/recipes/logic";
import { categoryEmoji, FALLBACK_CATEGORY_COLOR } from "@/lib/recipes/stats";
import { CARDS_PER_PAGE } from "@/lib/recipes/pdf";
import type { Recipe, RecipeCategory } from "@/lib/recipes/types";
import { hexToRgba } from "@/lib/utils";

/** Übersicht der für den PDF-Export ausgewählten Gerichte. */
export default function SelectionDialog({
  recipes,
  catByName,
  exporting,
  onRemove,
  onClearAll,
  onExport,
  onClose,
}: {
  recipes: Recipe[];
  catByName: Map<string, RecipeCategory>;
  exporting: boolean;
  onRemove: (id: number) => void;
  onClearAll: () => void;
  onExport: () => void;
  onClose: () => void;
}) {
  const pages = Math.ceil(recipes.length / CARDS_PER_PAGE);
  return (
    <Dialog open onOpenChange={(open) => !open && !exporting && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="pr-6">
          <DialogTitle>Ausgewählte Gerichte</DialogTitle>
          <DialogPrimitive.Description className="text-sm text-[var(--muted-foreground)]">
            {recipes.length === 0
              ? "Noch nichts ausgewählt."
              : `${recipes.length} Kärtchen · ${pages} Seite${pages === 1 ? "" : "n"} A4`}
          </DialogPrimitive.Description>
        </DialogHeader>

        {recipes.length > 0 && (
          <ul className="max-h-[50dvh] space-y-1.5 overflow-y-auto">
            {recipes.map((r) => {
              const cat = catByName.get(r.category);
              const color = cat?.color ?? FALLBACK_CATEGORY_COLOR;
              return (
                <li key={r.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] p-2 pr-1">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg"
                    style={{ backgroundColor: hexToRgba(color, 0.22) }}
                  >
                    {categoryEmoji(cat)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{r.name}</span>
                    <span className="block truncate text-xs text-[var(--muted-foreground)]">
                      {categoryLabel(r.category)}
                    </span>
                  </span>
                  <Button variant="ghost" size="icon" title="Aus Auswahl entfernen" onClick={() => onRemove(r.id)}>
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="link" onClick={onClearAll} disabled={recipes.length === 0 || exporting} className="px-0 text-[var(--destructive)]">
            Alle entfernen
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={exporting}>
              Schließen
            </Button>
            <Button onClick={onExport} disabled={recipes.length === 0 || exporting} className="gap-1.5">
              <FileDown className="h-4 w-4" />
              {exporting ? "Erstellt…" : "PDF erstellen"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
