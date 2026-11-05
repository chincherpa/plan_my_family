"use client";
import { useState } from "react";
import { Plus, Pencil, Trash2, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useDataStore } from "@/lib/store/dataStore";
import { createRecipe, deleteRecipe, updateRecipe } from "@/lib/recipes/actions";
import { buildCategoryOptions } from "@/lib/recipes/logic";
import type { Recipe } from "@/lib/recipes/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Verwaltung der Mahlzeiten-Liste. Die Daten liegen in der Rezepte-App (eigenes
// Supabase-Projekt) und werden über Server Actions gelesen und geschrieben.
export default function RecipeSettings() {
  const { recipes, recipeCategories, recipesError, setRecipes } = useDataStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Recipe | null>(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [bemerkung, setBemerkung] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoryOptions = buildCategoryOptions(recipeCategories, recipes);
  const colorByCategory = new Map(recipeCategories.map((c) => [c.name, c.color]));
  const isNewCategory =
    category.trim() !== "" && !recipeCategories.some((c) => c.name === category.trim());

  const groups = new Map<string, Recipe[]>();
  for (const item of recipes) {
    if (!groups.has(item.category)) groups.set(item.category, []);
    groups.get(item.category)!.push(item);
  }
  const groupNames = [...groups.keys()].sort((a, b) => a.localeCompare(b, "de"));

  function openCreate() {
    setError(null);
    setEditing(null);
    setName("");
    setCategory("");
    setBemerkung("");
    setDialogOpen(true);
  }

  function openEdit(item: Recipe) {
    setError(null);
    setEditing(item);
    setName(item.name);
    setCategory(item.category);
    setBemerkung(item.bemerkung);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!name.trim() || !category.trim()) return;
    setSaving(true);
    setError(null);
    const input = { name, category, bemerkung };
    const result = editing ? await updateRecipe(editing.id, input) : await createRecipe(input);
    setSaving(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    const saved = result.data;
    setRecipes(
      editing ? recipes.map((r) => (r.id === editing.id ? saved : r)) : [...recipes, saved],
      recipeCategories
    );
    setDialogOpen(false);
  }

  async function handleDelete(item: Recipe) {
    if (
      !confirm(
        `„${item.name}“ wirklich löschen? Die Mahlzeit wird auch in der Rezepte-App inkl. Zutaten gelöscht.`
      )
    )
      return;
    setError(null);
    const result = await deleteRecipe(item.id);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setRecipes(
      recipes.filter((r) => r.id !== item.id),
      recipeCategories
    );
  }

  return (
    <div className="h-full overflow-y-auto">
    <div className="max-w-2xl mx-auto px-3 py-5 sm:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/settings">
          <Button variant="ghost" size="icon">
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mahlzeiten</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Diese Liste wird mit der Rezepte-App geteilt.
          </p>
        </div>
      </div>

      {recipesError && <p className="text-sm text-[var(--destructive)]">{recipesError}</p>}

      <div className="space-y-4">
        {groupNames.map((groupName) => (
          <div key={groupName} className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-medium text-[var(--muted-foreground)]">
              {colorByCategory.has(groupName) && (
                <span
                  aria-hidden
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: colorByCategory.get(groupName) }}
                />
              )}
              {groupName}
            </h2>
            {groups
              .get(groupName)!
              .sort((a, b) => a.name.localeCompare(b.name, "de"))
              .map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--card)]"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{item.name}</p>
                    {item.bemerkung && (
                      <p className="text-sm text-[var(--muted-foreground)] truncate">
                        {item.bemerkung}
                      </p>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(item)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(item)}
                    className="text-[var(--destructive)] hover:text-[var(--destructive)]"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
          </div>
        ))}
        {recipes.length === 0 && !recipesError && (
          <p className="text-[var(--muted-foreground)] text-sm py-4 text-center">
            Noch keine Mahlzeiten eingetragen.
          </p>
        )}
      </div>

      <Button onClick={openCreate} className="gap-2" disabled={!!recipesError}>
        <Plus className="w-4 h-4" />
        Mahlzeit hinzufügen
      </Button>

      {error && !dialogOpen && <p className="text-sm text-[var(--destructive)]">{error}</p>}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Mahlzeit bearbeiten" : "Neue Mahlzeit"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {error && <p className="text-sm text-[var(--destructive)]">{error}</p>}
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Linsen-Curry"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>Kategorie</Label>
              <Combobox
                value={category}
                onChange={setCategory}
                options={categoryOptions}
                placeholder="z.B. Suppen — oder neue Kategorie eingeben"
              />
              {isNewCategory && (
                <p className="text-xs text-[var(--muted-foreground)]">
                  Neue Kategorie – erscheint in der Rezepte-App ohne Icon/Farbe.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Bemerkung</Label>
              <textarea
                value={bemerkung}
                onChange={(e) => setBemerkung(e.target.value)}
                placeholder="Optional, z.B. „alle lieben es“"
                rows={2}
                className="w-full rounded-md border border-[var(--input)] bg-transparent px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>
                Abbrechen
              </Button>
              <Button
                className="flex-1"
                onClick={handleSave}
                disabled={saving || !name.trim() || !category.trim()}
              >
                {saving ? "Speichern..." : "Speichern"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </div>
  );
}
