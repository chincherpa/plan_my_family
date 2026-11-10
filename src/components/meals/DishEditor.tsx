"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  History,
  ListChecks,
  Pencil,
  Plus,
  RotateCcw,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { useDataStore } from "@/lib/store/dataStore";
import {
  createRecipe,
  deleteRecipe,
  listIngredients,
  saveIngredients,
  updateRecipe,
} from "@/lib/recipes/actions";
import { buildCategoryOptions, validateIngredients } from "@/lib/recipes/logic";
import {
  categoryEmoji,
  dishKey,
  FALLBACK_CATEGORY_COLOR,
  relativeDay,
  type DishStats,
} from "@/lib/recipes/stats";
import type { Recipe } from "@/lib/recipes/types";
import { saveMealSlot } from "@/lib/meals/saveMealSlot";
import { cn, hexToRgba, localDateStr } from "@/lib/utils";

type Row = {
  key: string;
  id?: number;
  zutat: string;
  menge: string;
  taetigkeit: string;
};

let rowSeq = 0;
const newRow = (init?: Partial<Row>): Row => ({
  key: `r${++rowSeq}`,
  zutat: "",
  menge: "",
  taetigkeit: "",
  ...init,
});
const rowsSignature = (rows: Row[]) =>
  JSON.stringify(rows.map(({ id, zutat, menge, taetigkeit }) => [id, zutat, menge, taetigkeit]));
const rowCheckId = (r: Row) => (r.id != null ? `#${r.id}` : `${r.menge}|${r.zutat}`);

// Abgehakte Zutaten (Einkaufsmodus) überleben Display-Sperre/Reload im Supermarkt.
const checkStorageKey = (recipeId: number) => `pmf.dishCheck.${recipeId}`;
function loadChecked(recipeId: number): Set<string> {
  try {
    const raw = localStorage.getItem(checkStorageKey(recipeId));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
function storeChecked(recipeId: number, checked: Set<string>) {
  try {
    if (checked.size === 0) localStorage.removeItem(checkStorageKey(recipeId));
    else localStorage.setItem(checkStorageKey(recipeId), JSON.stringify([...checked]));
  } catch {
    /* Storage nicht verfügbar – Abhaken bleibt dann nur bis zum Schließen */
  }
}

export default function DishEditor({
  recipe,
  prefillName = "",
  stats,
  onClose,
  onToast,
  onCreated,
}: {
  /** null = neues Gericht */
  recipe: Recipe | null;
  prefillName?: string;
  stats: DishStats;
  onClose: () => void;
  onToast: (message: string) => void;
  /** Neu angelegtes Gericht (für „Neue auswählen“ beim PDF-Export) */
  onCreated?: (recipe: Recipe) => void;
}) {
  const { family, upsertMeal, recipes, recipeCategories, setRecipes } = useDataStore();
  const todayStr = localDateStr(new Date());

  const [current, setCurrent] = useState<Recipe | null>(recipe);
  const [name, setName] = useState(recipe?.name ?? prefillName);
  const [category, setCategory] = useState(recipe?.category ?? "");
  const [bemerkung, setBemerkung] = useState(recipe?.bemerkung ?? "");
  const [addingCategory, setAddingCategory] = useState(false);

  /** Bestehende Gerichte öffnen in der Ansicht, erst „Bearbeiten“ schaltet den Editor frei. */
  const [mode, setMode] = useState<"view" | "edit">(recipe ? "view" : "edit");
  const [checked, setChecked] = useState<Set<string>>(() => (recipe ? loadChecked(recipe.id) : new Set()));

  const [rows, setRows] = useState<Row[]>([]);
  const [savedRows, setSavedRows] = useState<Row[]>([]);
  const initialRows = useMemo(() => rowsSignature(savedRows), [savedRows]);
  const [ingredientsLoading, setIngredientsLoading] = useState(!!recipe);
  const [ingredientsError, setIngredientsError] = useState<string | null>(null);
  const focusKey = useRef<string | null>(null);
  const inputRefs = useRef(new Map<string, HTMLInputElement>());

  const [renameInPlan, setRenameInPlan] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!recipe) return;
    let alive = true;
    listIngredients(recipe.id).then((res) => {
      if (!alive) return;
      setIngredientsLoading(false);
      if ("error" in res) {
        setIngredientsError(res.error);
        return;
      }
      const loaded = res.data.map((i) =>
        newRow({
          id: i.id,
          zutat: i.zutat,
          menge: i.menge,
          taetigkeit: i.taetigkeit,
        }),
      );
      setRows(loaded);
      setSavedRows(loaded);
    });
    return () => {
      alive = false;
    };
  }, [recipe]);

  useEffect(() => {
    if (focusKey.current) {
      inputRefs.current.get(focusKey.current)?.focus();
      focusKey.current = null;
    }
  });

  const categoryOptions = useMemo(
    () => buildCategoryOptions(recipeCategories, recipes).map((o) => o.value),
    [recipeCategories, recipes],
  );
  const catByName = useMemo(() => new Map(recipeCategories.map((c) => [c.name, c])), [recipeCategories]);
  const activeCat = catByName.get(category.trim());
  const accent = activeCat?.color ?? FALLBACK_CATEGORY_COLOR;

  const upcomingEntries = stats.entries.filter((e) => e.date >= todayStr);
  const renamed = !!current && dishKey(name) !== dishKey(current.name) && name.trim() !== "";
  const ingredientsDirty = rowsSignature(rows) !== initialRows;
  const checkedCount = savedRows.filter((r) => checked.has(rowCheckId(r))).length;

  function toggleChecked(row: Row) {
    if (!current) return;
    setChecked((prev) => {
      const next = new Set(prev);
      const id = rowCheckId(row);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      storeChecked(current.id, next);
      return next;
    });
  }
  function resetChecked() {
    if (!current) return;
    storeChecked(current.id, new Set());
    setChecked(new Set());
  }

  /** Bearbeitung verwerfen und zurück zur Ansicht (bzw. schließen bei neuem Gericht). */
  function cancelEdit() {
    if (!current) {
      onClose();
      return;
    }
    setName(current.name);
    setCategory(current.category);
    setBemerkung(current.bemerkung);
    setRows(savedRows);
    setAddingCategory(false);
    setError(null);
    setMode("view");
  }

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function addRow(afterKey?: string) {
    const row = newRow();
    focusKey.current = row.key;
    setRows((rs) => {
      const i = afterKey ? rs.findIndex((r) => r.key === afterKey) : -1;
      return i < 0 ? [...rs, row] : [...rs.slice(0, i + 1), row, ...rs.slice(i + 1)];
    });
  }
  function moveRow(key: string, delta: number) {
    setRows((rs) => {
      const i = rs.findIndex((r) => r.key === key);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= rs.length) return rs;
      const copy = [...rs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }

  async function handleSave() {
    if (!name.trim() || !category.trim()) return;
    const checkedRows = validateIngredients(rows);
    if (!checkedRows.ok) {
      setError(checkedRows.error);
      return;
    }
    setSaving(true);
    setError(null);

    const input = { name, category, bemerkung };
    const result = current ? await updateRecipe(current.id, input) : await createRecipe(input);
    if ("error" in result) {
      setSaving(false);
      setError(result.error);
      return;
    }
    const saved = result.data;
    const latest = useDataStore.getState();
    setRecipes(
      current ? latest.recipes.map((r) => (r.id === saved.id ? saved : r)) : [...latest.recipes, saved],
      latest.recipeCategories,
    );
    const oldName = current?.name;
    if (!current) onCreated?.(saved);
    setCurrent(saved);

    if (ingredientsDirty && !ingredientsError) {
      const ing = await saveIngredients(saved.id, rows);
      if ("error" in ing) {
        setSaving(false);
        setError(`Gericht gespeichert, aber: ${ing.error}`);
        return;
      }
      const reloaded = ing.data.map((i) =>
        newRow({
          id: i.id,
          zutat: i.zutat,
          menge: i.menge,
          taetigkeit: i.taetigkeit,
        }),
      );
      setRows(reloaded);
      setSavedRows(reloaded);
    }

    let renamedCount = 0;
    if (family && oldName && renamed && renameInPlan) {
      for (const entry of upcomingEntries) {
        const updated = await saveMealSlot(family.id, entry.date, entry.type, saved.name);
        if (updated) {
          upsertMeal(updated);
          renamedCount++;
        }
      }
    }

    setSaving(false);
    onToast(
      current
        ? renamedCount > 0
          ? `„${saved.name}“ gespeichert · ${renamedCount}× im Plan umbenannt`
          : `„${saved.name}“ gespeichert`
        : `„${saved.name}“ angelegt`,
    );
    if (current) setMode("view");
    else onClose();
  }

  async function handleDelete() {
    if (!current) return;
    setSaving(true);
    const res = await deleteRecipe(current.id);
    setSaving(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    const latest = useDataStore.getState();
    setRecipes(
      latest.recipes.filter((r) => r.id !== current.id),
      latest.recipeCategories,
    );
    onToast(`„${current.name}“ gelöscht`);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="gap-0 overflow-x-hidden overflow-y-auto overscroll-contain p-0 sm:max-w-xl sm:p-0">
        {/* Kopf mit Kategoriefarbe */}
        <div
          className="flex items-center gap-3 px-5 pb-4 pt-5 sm:px-6"
          style={{
            background: `linear-gradient(135deg, ${hexToRgba(accent, 0.22)}, transparent 70%)`,
          }}
        >
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl shadow-sm"
            style={{ backgroundColor: hexToRgba(accent, 0.25) }}
          >
            {categoryEmoji(activeCat)}
          </span>
          <DialogHeader className="min-w-0 pr-6">
            <DialogTitle className="truncate text-xl">
              {name.trim() || (current ? current.name : "Neues Gericht")}
            </DialogTitle>
            <DialogPrimitive.Description className="text-sm text-[var(--muted-foreground)]">
              {current
                ? stats.count > 0
                  ? `${stats.count}× gegessen · zuletzt ${relativeDay(stats.lastDate!, todayStr)}`
                  : "Noch nie gekocht"
                : "Wird auch in der Rezepte-App angelegt"}
            </DialogPrimitive.Description>
          </DialogHeader>
        </div>

        {mode === "view" && current ? (
          <div className="space-y-5 px-5 pb-6 sm:px-6">
            {current.category && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium"
                style={{ backgroundColor: hexToRgba(accent, 0.22) }}
              >
                <span className="text-xs">{categoryEmoji(activeCat)}</span>
                {current.category}
              </span>
            )}

            {current.bemerkung.trim() && (
              <p className="flex gap-2 whitespace-pre-line rounded-xl bg-[var(--accent)] px-4 py-3 text-sm">
                <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
                <span>{current.bemerkung}</span>
              </p>
            )}

            {/* Einkaufsliste */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                  <ListChecks className="h-4 w-4 text-[var(--muted-foreground)]" />
                  Zutaten
                  {savedRows.length > 0 && (
                    <span className="tabular text-xs font-normal text-[var(--muted-foreground)]">
                      {checkedCount > 0 ? `${checkedCount}/${savedRows.length}` : `(${savedRows.length})`}
                    </span>
                  )}
                </h3>
                {checkedCount > 0 && (
                  <button
                    type="button"
                    onClick={resetChecked}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Zurücksetzen
                  </button>
                )}
              </div>

              {ingredientsLoading ? (
                <div className="space-y-1.5">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-12 animate-pulse rounded-xl bg-[var(--accent)]" />
                  ))}
                </div>
              ) : ingredientsError ? (
                <p className="text-sm text-[var(--destructive)]">{ingredientsError}</p>
              ) : savedRows.length === 0 ? (
                <p className="rounded-xl border border-dashed border-[var(--input)] py-4 text-center text-sm text-[var(--muted-foreground)]">
                  Noch keine Zutaten hinterlegt
                </p>
              ) : (
                <ul className="overflow-hidden rounded-xl border border-[var(--border)]">
                  {savedRows.map((row) => {
                    const done = checked.has(rowCheckId(row));
                    return (
                      <li key={row.key} className="border-b border-[var(--border)] last:border-b-0">
                        <button
                          type="button"
                          onClick={() => toggleChecked(row)}
                          aria-pressed={done}
                          className={cn(
                            "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-[var(--accent)]",
                            done && "bg-[var(--accent)]/50",
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                              done ? "border-transparent text-white" : "border-[var(--input)]",
                            )}
                            style={done ? { backgroundColor: accent } : undefined}
                          >
                            {done && <Check className="h-4 w-4" strokeWidth={3} />}
                          </span>
                          <span className={cn("min-w-0 flex-1", done && "opacity-45")}>
                            <span className={cn("block text-base font-medium", done && "line-through")}>
                              {row.zutat}
                            </span>
                            {row.taetigkeit.trim() && (
                              <span className="block text-xs text-[var(--muted-foreground)]">
                                {row.taetigkeit}
                              </span>
                            )}
                          </span>
                          {row.menge.trim() && (
                            <span
                              className={cn(
                                "tabular shrink-0 rounded-lg bg-[var(--accent)] px-2.5 py-1 text-sm font-semibold",
                                done && "opacity-45",
                              )}
                            >
                              {row.menge}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {savedRows.length > 0 && checkedCount === savedRows.length && (
                <p className="text-center text-sm font-medium text-[var(--primary)]">Alles im Korb 🎉</p>
              )}
            </section>

            {upcomingEntries.length > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
                <History className="h-3.5 w-3.5" />
                Geplant:{" "}
                {upcomingEntries
                  .slice(0, 3)
                  .map(
                    (e) =>
                      `${e.type === "lunch" ? "Mittag" : "Abend"} ${new Date(`${e.date}T12:00:00`).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}`,
                  )
                  .join(" · ")}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={onClose}>
                Schließen
              </Button>
              <Button className="flex-1 gap-2" onClick={() => setMode("edit")}>
                <Pencil className="h-4 w-4" /> Bearbeiten
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5 px-5 pb-6 sm:px-6">
            <div className="space-y-1.5">
              <Label htmlFor="dish-name">Name</Label>
              <Input
                id="dish-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Linsen-Curry"
                autoFocus={!recipe}
              />
              {renamed && upcomingEntries.length > 0 && (
                <label className="flex cursor-pointer items-center gap-2 pt-1 text-xs text-[var(--muted-foreground)]">
                  <input
                    type="checkbox"
                    checked={renameInPlan}
                    onChange={(e) => setRenameInPlan(e.target.checked)}
                    className="accent-[var(--primary)]"
                  />
                  Auch {upcomingEntries.length} kommende
                  {upcomingEntries.length === 1 ? "n" : ""} Eintrag
                  {upcomingEntries.length === 1 ? "" : "e"} im Essensplan umbenennen
                </label>
              )}
            </div>

            <div className="space-y-2">
              <Label>Kategorie</Label>
              <div className="flex flex-wrap gap-1.5">
                {categoryOptions.map((c) => {
                  const cat = catByName.get(c);
                  const color = cat?.color ?? FALLBACK_CATEGORY_COLOR;
                  const active = c === category.trim();
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setCategory(c);
                        setAddingCategory(false);
                      }}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-all",
                        active
                          ? "border-transparent font-medium shadow-sm"
                          : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
                      )}
                      style={
                        active
                          ? {
                              backgroundColor: hexToRgba(color, 0.22),
                              color: "var(--foreground)",
                            }
                          : undefined
                      }
                    >
                      <span className="text-xs">{categoryEmoji(cat)}</span>
                      {c}
                    </button>
                  );
                })}
                {!addingCategory && (
                  <button
                    type="button"
                    onClick={() => {
                      setAddingCategory(true);
                      setCategory("");
                    }}
                    className="flex items-center gap-1 rounded-full border border-dashed border-[var(--input)] px-3 py-1 text-sm text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
                  >
                    <Plus className="h-3.5 w-3.5" /> Neu
                  </button>
                )}
              </div>
              {addingCategory && (
                <div className="flex gap-2">
                  <Input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Neue Kategorie"
                    autoFocus
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setAddingCategory(false)}
                    title="Abbrechen"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              {addingCategory && category.trim() && !catByName.has(category.trim()) && (
                <p className="text-xs text-[var(--muted-foreground)]">
                  Erscheint in der Rezepte-App ohne Icon/Farbe.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dish-note">Bemerkung</Label>
              <textarea
                id="dish-note"
                value={bemerkung}
                onChange={(e) => setBemerkung(e.target.value)}
                placeholder="Optional, z.B. „alle lieben es“"
                rows={2}
                className="w-full resize-none rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
              />
            </div>

            {/* Zutaten */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <ListChecks className="h-4 w-4 text-[var(--muted-foreground)]" />
                  Zutaten
                  {rows.length > 0 && (
                    <span className="tabular text-xs font-normal text-[var(--muted-foreground)]">
                      ({rows.length})
                    </span>
                  )}
                </Label>
                {!ingredientsLoading && !ingredientsError && (
                  <Button variant="ghost" size="sm" onClick={() => addRow()} className="gap-1">
                    <Plus className="h-3.5 w-3.5" /> Zutat
                  </Button>
                )}
              </div>

              {ingredientsLoading ? (
                <div className="space-y-1.5">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-9 animate-pulse rounded-lg bg-[var(--accent)]" />
                  ))}
                </div>
              ) : ingredientsError ? (
                <p className="text-sm text-[var(--destructive)]">{ingredientsError}</p>
              ) : rows.length === 0 ? (
                <button
                  type="button"
                  onClick={() => addRow()}
                  className="w-full rounded-xl border border-dashed border-[var(--input)] py-4 text-sm text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
                >
                  Noch keine Zutaten – erste hinzufügen
                </button>
              ) : (
                <div className="space-y-1.5">
                  {rows.map((row, i) => (
                    <div
                      key={row.key}
                      className="group grid grid-cols-[4.5rem_1fr_auto] gap-1.5 rounded-xl bg-[var(--background)] p-1.5 sm:grid-cols-[5.5rem_1fr_1fr_auto]"
                    >
                      <Input
                        value={row.menge}
                        onChange={(e) => updateRow(row.key, { menge: e.target.value })}
                        placeholder="Menge"
                        className="h-8 border-transparent bg-[var(--card)] px-2 text-xs shadow-none"
                      />
                      <Input
                        ref={(el) => {
                          if (el) inputRefs.current.set(row.key, el);
                          else inputRefs.current.delete(row.key);
                        }}
                        value={row.zutat}
                        onChange={(e) => updateRow(row.key, { zutat: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addRow(row.key);
                          }
                        }}
                        placeholder="Zutat"
                        className="h-8 border-transparent bg-[var(--card)] px-2 font-medium shadow-none"
                      />
                      <Input
                        value={row.taetigkeit}
                        onChange={(e) => updateRow(row.key, { taetigkeit: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addRow(row.key);
                          }
                        }}
                        placeholder="Tätigkeit (optional)"
                        className="col-span-2 col-start-1 row-start-2 h-8 border-transparent bg-[var(--card)] px-2 text-xs shadow-none sm:col-span-1 sm:col-start-auto sm:row-start-auto"
                      />
                      <div className="row-span-2 flex items-center sm:row-span-1">
                        <div className="flex flex-col sm:flex-row">
                          <button
                            type="button"
                            onClick={() => moveRow(row.key, -1)}
                            disabled={i === 0}
                            title="Nach oben"
                            className="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--accent)] disabled:opacity-25"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveRow(row.key, 1)}
                            disabled={i === rows.length - 1}
                            title="Nach unten"
                            className="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--accent)] disabled:opacity-25"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
                          title="Zutat entfernen"
                          className="rounded p-1 text-[var(--destructive)] opacity-70 hover:bg-[var(--destructive)]/10 hover:opacity-100"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <p className="text-[11px] text-[var(--muted-foreground)]">Enter → nächste Zutat</p>
                </div>
              )}
            </section>

            {/* Verlauf */}
            {current && stats.entries.length > 0 && (
              <section className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <History className="h-4 w-4 text-[var(--muted-foreground)]" />
                  Im Essensplan
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {stats.entries.slice(0, 12).map((e) => {
                    const upcoming = e.date >= todayStr;
                    const d = new Date(`${e.date}T12:00:00`);
                    return (
                      <span
                        key={`${e.date}-${e.type}`}
                        className={cn(
                          "tabular rounded-full px-2.5 py-0.5 text-xs",
                          upcoming
                            ? "bg-[var(--primary)]/15 font-medium text-[var(--primary)]"
                            : "bg-[var(--accent)] text-[var(--muted-foreground)]",
                        )}
                      >
                        {e.type === "lunch" ? "🍽" : "🌙"}{" "}
                        {d.toLocaleDateString("de-DE", {
                          weekday: "short",
                          day: "2-digit",
                          month: "2-digit",
                        })}
                      </span>
                    );
                  })}
                  {stats.entries.length > 12 && (
                    <span className="px-1 text-xs text-[var(--muted-foreground)]">
                      +{stats.entries.length - 12} weitere
                    </span>
                  )}
                </div>
              </section>
            )}

            {error && (
              <p className="rounded-md bg-[var(--destructive)]/10 px-3 py-2 text-sm text-[var(--destructive)]">
                {error}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              {current && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setConfirmDelete(true)}
                  disabled={saving}
                  title="Gericht löschen"
                  className="shrink-0 text-[var(--destructive)] hover:bg-[var(--destructive)]/10 hover:text-[var(--destructive)]"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <Button variant="outline" className="flex-1" onClick={cancelEdit} disabled={saving}>
                Abbrechen
              </Button>
              <Button
                className="flex-1"
                onClick={handleSave}
                disabled={saving || !name.trim() || !category.trim()}
              >
                {saving ? "Speichern…" : current ? "Speichern" : "Anlegen"}
              </Button>
            </div>
          </div>
        )}

        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`„${current?.name}“ löschen?`}
          description="Das Gericht wird auch in der Rezepte-App inkl. Zutaten gelöscht. Einträge im Essensplan bleiben als Text stehen."
          onConfirm={handleDelete}
        />
      </DialogContent>
    </Dialog>
  );
}
