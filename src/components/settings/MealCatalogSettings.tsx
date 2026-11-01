"use client";
import { useState } from "react";
import { Plus, Pencil, Trash2, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useDataStore } from "@/lib/store/dataStore";
import type { MealCatalogItem } from "@/lib/supabase/types";
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

export default function MealCatalogSettings() {
  const { mealCatalog, family, setMealCatalog } = useDataStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MealCatalogItem | null>(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoryOptions = [...new Set(mealCatalog.map((item) => item.category))]
    .sort((a, b) => a.localeCompare(b, "de"))
    .map((c) => ({ value: c }));

  const groups = new Map<string, MealCatalogItem[]>();
  for (const item of mealCatalog) {
    if (!groups.has(item.category)) groups.set(item.category, []);
    groups.get(item.category)!.push(item);
  }
  const groupNames = [...groups.keys()].sort((a, b) => a.localeCompare(b, "de"));

  function openCreate() {
    setError(null);
    setEditing(null);
    setName("");
    setCategory("");
    setDialogOpen(true);
  }

  function openEdit(item: MealCatalogItem) {
    setError(null);
    setEditing(item);
    setName(item.name);
    setCategory(item.category);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!family || !name.trim() || !category.trim()) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();

    if (editing) {
      const { data, error: saveError } = await supabase
        .from("meal_catalog")
        .update({ name: name.trim(), category: category.trim() })
        .eq("id", editing.id)
        .select();
      const rows = data as MealCatalogItem[] | null;
      if (saveError || !rows?.[0]) {
        setError(saveError?.message ?? "Mahlzeit konnte nicht gespeichert werden.");
        setSaving(false);
        return;
      }
      setMealCatalog(mealCatalog.map((m) => (m.id === editing.id ? rows[0] : m)));
    } else {
      const { data, error: saveError } = await supabase
        .from("meal_catalog")
        .insert({ family_id: family.id, name: name.trim(), category: category.trim() })
        .select();
      const rows = data as MealCatalogItem[] | null;
      if (saveError || !rows?.[0]) {
        setError(saveError?.message ?? "Mahlzeit konnte nicht erstellt werden.");
        setSaving(false);
        return;
      }
      setMealCatalog([...mealCatalog, rows[0]]);
    }

    setSaving(false);
    setDialogOpen(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Mahlzeit wirklich löschen?")) return;
    setError(null);
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("meal_catalog").delete().eq("id", id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setMealCatalog(mealCatalog.filter((m) => m.id !== id));
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
        <h1 className="text-3xl font-bold tracking-tight">Mahlzeiten</h1>
      </div>

      <div className="space-y-4">
        {groupNames.map((groupName) => (
          <div key={groupName} className="space-y-2">
            <h2 className="text-sm font-medium text-[var(--muted-foreground)]">{groupName}</h2>
            {groups
              .get(groupName)!
              .sort((a, b) => a.name.localeCompare(b.name, "de"))
              .map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--card)]"
                >
                  <div className="flex-1">
                    <p className="font-medium">{item.name}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(item)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(item.id)}
                    className="text-[var(--destructive)] hover:text-[var(--destructive)]"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
          </div>
        ))}
        {mealCatalog.length === 0 && (
          <p className="text-[var(--muted-foreground)] text-sm py-4 text-center">
            Noch keine Mahlzeiten eingetragen.
          </p>
        )}
      </div>

      <Button onClick={openCreate} className="gap-2">
        <Plus className="w-4 h-4" />
        Mahlzeit hinzufügen
      </Button>

      {error && <p className="text-sm text-[var(--destructive)]">{error}</p>}

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
                placeholder="z.B. Currys — oder neue Kategorie eingeben"
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
