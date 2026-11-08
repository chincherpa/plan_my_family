import { beforeEach, describe, expect, it } from "vitest";
import { useRecipeSelection } from "./recipeSelectionStore";

const ids = () => [...useRecipeSelection.getState().selected].sort();

beforeEach(() => useRecipeSelection.setState({ selected: new Set(), addedThisSession: new Set() }));

describe("recipeSelectionStore", () => {
  it("toggle wählt aus und wieder ab", () => {
    useRecipeSelection.getState().toggle(1);
    useRecipeSelection.getState().toggle(2);
    useRecipeSelection.getState().toggle(1);
    expect(ids()).toEqual([2]);
  });

  it("toggleAll: erst alle auswählen, dann alle abwählen – andere bleiben", () => {
    const s = useRecipeSelection.getState();
    s.toggle(9);
    s.toggle(1);
    s.toggleAll([1, 2, 3]);
    expect(ids()).toEqual([1, 2, 3, 9]);
    useRecipeSelection.getState().toggleAll([1, 2, 3]);
    expect(ids()).toEqual([9]);
  });

  it("Neue auswählen ergänzt, clear leert", () => {
    const s = useRecipeSelection.getState();
    s.markAdded(5);
    s.markAdded(6);
    s.selectMany(useRecipeSelection.getState().addedThisSession);
    expect(ids()).toEqual([5, 6]);
    useRecipeSelection.getState().clear();
    expect(ids()).toEqual([]);
  });
});
