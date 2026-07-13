"use client";
import { useState } from "react";
import { Plus, Pencil, Trash2, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useDataStore } from "@/lib/store/dataStore";
import type { Recipe } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function RecipesSettings() {
  const { recipes, addRecipe, updateRecipe, removeRecipe } = useDataStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setEditing(null);
    setName("");
    setCategory("");
    setDialogOpen(true);
  }

  function openEdit(recipe: Recipe) {
    setEditing(recipe);
    setName(recipe.name);
    setCategory(recipe.category ?? "");
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const supabase = createClient();

    if (editing) {
      const { data } = await supabase
        .from("recipes")
        .update({ name: name.trim(), category: category.trim() || null })
        .eq("id", editing.id)
        .select()
        .single();
      if (data) updateRecipe(editing.id, data as Recipe);
    } else {
      const { data } = await supabase
        .from("recipes")
        .insert({ name: name.trim(), category: category.trim() || null })
        .select()
        .single();
      if (data) addRecipe(data as Recipe);
    }

    setSaving(false);
    setDialogOpen(false);
  }

  async function handleDelete(id: number) {
    if (!confirm("Rezept wirklich löschen?")) return;
    const supabase = createClient();
    await supabase.from("recipes").delete().eq("id", id);
    removeRecipe(id);
  }

  // Group by category for display
  const categories = Array.from(new Set(recipes.map((r) => r.category ?? "Sonstige"))).sort();

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/settings">
          <Button variant="ghost" size="icon">
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Rezepte</h1>
      </div>

      <div className="space-y-2">
        {recipes.length === 0 && (
          <p className="text-[var(--muted-foreground)] text-sm py-4 text-center">
            Noch keine Rezepte eingetragen.
          </p>
        )}
        {categories.map((cat) => (
          <div key={cat}>
            <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-1 px-1">
              {cat}
            </p>
            {recipes
              .filter((r) => (r.category ?? "Sonstige") === cat)
              .map((recipe) => (
                <div
                  key={recipe.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border)] bg-[var(--card)] mb-1"
                >
                  <div className="flex-1">
                    <p className="font-medium">{recipe.name}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(recipe)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(recipe.id)}
                    className="text-[var(--destructive)] hover:text-[var(--destructive)]"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
          </div>
        ))}
      </div>

      <Button onClick={openCreate} className="gap-2">
        <Plus className="w-4 h-4" />
        Rezept hinzufügen
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Rezept bearbeiten" : "Neues Rezept"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Spaghetti Bolognese"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>Kategorie <span className="text-[var(--muted-foreground)] font-normal">(optional)</span></Label>
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="z.B. Pasta, Salat, Suppe"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>
                Abbrechen
              </Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving || !name.trim()}>
                {saving ? "Speichern..." : "Speichern"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
