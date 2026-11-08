import { create } from "zustand";

// Auswahl für den PDF-Export (wie in der Rezepte-App: bleibt während der Sitzung erhalten,
// auch beim Wechsel zwischen Plan und Gerichte). Schlüssel ist die Rezept-id, damit
// Umbenennen die Auswahl nicht verliert.

type RecipeSelectionState = {
  selected: Set<number>;
  /** In dieser Sitzung neu angelegte Gerichte („Neue auswählen“) */
  addedThisSession: Set<number>;
  toggle: (id: number) => void;
  /** Alle ids auswählen – oder alle abwählen, wenn schon alle ausgewählt sind. */
  toggleAll: (ids: number[]) => void;
  selectMany: (ids: Iterable<number>) => void;
  clear: () => void;
  markAdded: (id: number) => void;
};

export const useRecipeSelection = create<RecipeSelectionState>((set) => ({
  selected: new Set(),
  addedThisSession: new Set(),
  toggle: (id) =>
    set((s) => {
      const next = new Set(s.selected);
      if (!next.delete(id)) next.add(id);
      return { selected: next };
    }),
  toggleAll: (ids) =>
    set((s) => {
      const next = new Set(s.selected);
      const allSelected = ids.length > 0 && ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return { selected: next };
    }),
  selectMany: (ids) =>
    set((s) => {
      const next = new Set(s.selected);
      for (const id of ids) next.add(id);
      return { selected: next };
    }),
  clear: () => set({ selected: new Set() }),
  markAdded: (id) => set((s) => ({ addedThisSession: new Set(s.addedThisSession).add(id) })),
}));
