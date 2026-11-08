"use client";
import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { useDataStore } from "@/lib/store/dataStore";
import { createCategory, deleteCategory, updateCategory } from "@/lib/recipes/actions";
import { CATEGORY_COLORS, CATEGORY_ICONS, categoryEmoji } from "@/lib/recipes/stats";
import type { RecipeCategory } from "@/lib/recipes/types";
import { cn, hexToRgba } from "@/lib/utils";

type FormState = { editing: RecipeCategory | null; name: string; icon: string; color: string };

const emptyForm = (): FormState => ({
  editing: null,
  name: "",
  icon: "casserole",
  color: CATEGORY_COLORS[0],
});

/** Kategorien der Rezepte-App anlegen, bearbeiten, löschen. */
export default function CategoryManager({
  onClose,
  onToast,
  onDeleted,
}: {
  onClose: () => void;
  onToast: (message: string) => void;
  /** Name der gelöschten Kategorie, z.B. um einen aktiven Filter zurückzusetzen */
  onDeleted?: (name: string) => void;
}) {
  const { recipes, recipeCategories, setRecipes } = useDataStore();
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<RecipeCategory | null>(null);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of recipes) map.set(r.category, (map.get(r.category) ?? 0) + 1);
    return map;
  }, [recipes]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (!form.name.trim()) {
      setError("Bitte gib einen Namen ein.");
      return;
    }
    setBusy(true);
    setError(null);
    const input = { name: form.name, icon: form.icon, color: form.color };
    const res = form.editing ? await updateCategory(form.editing.id, input) : await createCategory(input);
    setBusy(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setRecipes(res.data.recipes, res.data.categories);
    onToast(form.editing ? `Kategorie „${form.name.trim()}“ gespeichert` : `Kategorie „${form.name.trim()}“ angelegt`);
    setForm(null);
  }

  async function handleDelete(category: RecipeCategory) {
    setBusy(true);
    setError(null);
    const res = await deleteCategory(category.id);
    setBusy(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setRecipes(res.data.recipes, res.data.categories);
    if (form?.editing?.id === category.id) setForm(null);
    onDeleted?.(category.name);
    onToast(`Kategorie „${category.name}“ gelöscht`);
  }

  const deleteCount = confirmDelete ? counts.get(confirmDelete.name) ?? 0 : 0;

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="pr-6">
          <DialogTitle>Kategorien verwalten</DialogTitle>
          <DialogPrimitive.Description className="text-sm text-[var(--muted-foreground)]">
            Gilt auch in der Rezepte-App. Umbenennen zieht die Gerichte mit.
          </DialogPrimitive.Description>
        </DialogHeader>

        {error && (
          <p className="rounded-lg bg-[var(--destructive)]/10 px-3 py-2 text-sm text-[var(--destructive)]">{error}</p>
        )}

        {form ? (
          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-xl border border-[var(--border)] p-4"
            style={{ background: `linear-gradient(135deg, ${hexToRgba(form.color, 0.16)}, transparent 70%)` }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="category-name">{form.editing ? "Kategorie bearbeiten" : "Neue Kategorie"}</Label>
              <Input
                id="category-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="z.B. Suppe"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>Icon</Label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORY_ICONS.map(({ id, emoji }) => (
                  <button
                    key={id}
                    type="button"
                    title={id}
                    onClick={() => setForm({ ...form, icon: id })}
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-xl border text-xl transition-all",
                      form.icon === id
                        ? "border-transparent shadow-sm"
                        : "border-[var(--border)] opacity-70 hover:opacity-100"
                    )}
                    style={form.icon === id ? { backgroundColor: hexToRgba(form.color, 0.3) } : undefined}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Farbe</Label>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    title={c}
                    aria-label={`Farbe ${c}`}
                    onClick={() => setForm({ ...form, color: c })}
                    className={cn(
                      "h-8 w-8 rounded-full transition-transform",
                      form.color === c ? "scale-110 ring-2 ring-[var(--foreground)] ring-offset-2 ring-offset-[var(--card)]" : "hover:scale-105"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setForm(null)} disabled={busy}>
                Abbrechen
              </Button>
              <Button type="submit" disabled={busy || !form.name.trim()}>
                {busy ? "Speichert…" : form.editing ? "Speichern" : "Anlegen"}
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="outline" onClick={() => setForm(emptyForm())} className="gap-1.5" disabled={busy}>
            <Plus className="h-4 w-4" /> Neue Kategorie
          </Button>
        )}

        <ul className="space-y-1.5">
          {recipeCategories.length === 0 && (
            <li className="py-4 text-center text-sm text-[var(--muted-foreground)]">Noch keine Kategorien.</li>
          )}
          {recipeCategories.map((c) => {
            const count = counts.get(c.name) ?? 0;
            return (
              <li
                key={c.id}
                className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-2 pr-1"
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg"
                  style={{ backgroundColor: hexToRgba(c.color, 0.25) }}
                >
                  {categoryEmoji(c)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.name}</span>
                  <span className="text-xs text-[var(--muted-foreground)]">
                    {count} Gericht{count === 1 ? "" : "e"}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Bearbeiten"
                  disabled={busy}
                  onClick={() => {
                    setError(null);
                    setForm({ editing: c, name: c.name, icon: c.icon, color: c.color || CATEGORY_COLORS[0] });
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Löschen"
                  disabled={busy}
                  onClick={() => setConfirmDelete(c)}
                  className="text-[var(--destructive)] hover:text-[var(--destructive)]"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            );
          })}
        </ul>

        <ConfirmDialog
          open={!!confirmDelete}
          onOpenChange={(open) => !open && setConfirmDelete(null)}
          title={`Kategorie „${confirmDelete?.name ?? ""}“ löschen?`}
          description={
            deleteCount > 0
              ? `${deleteCount} Gericht${deleteCount === 1 ? "" : "e"} bleiben erhalten und landen unter „Ohne Kategorie“.`
              : undefined
          }
          onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        />
      </DialogContent>
    </Dialog>
  );
}
