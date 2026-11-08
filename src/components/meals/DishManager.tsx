"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarPlus,
  Dices,
  Plus,
  Search,
  X,
  ArrowDownAZ,
  Flame,
  Clock,
  Hourglass,
  Sparkles,
  ChefHat,
  Check,
  CircleAlert,
  FileDown,
  ListChecks,
  Tags,
  SquareCheckBig,
  Square,
  ChevronRight,
} from "lucide-react";
import { useDataStore } from "@/lib/store/dataStore";
import { useRecipeSelection } from "@/lib/store/recipeSelectionStore";
import { listIngredientsFor } from "@/lib/recipes/actions";
import { categoryLabel } from "@/lib/recipes/logic";
import { createRecipeCardsPdf, PDF_FILE_NAME } from "@/lib/recipes/pdf";
import { Button } from "@/components/ui/button";
import {
  categoryEmoji,
  computeDishStats,
  daysBetween,
  dishKey,
  FALLBACK_CATEGORY_COLOR,
  findUnlistedDishes,
  pickSuggestion,
  relativeDay,
  sortRecipes,
  statsFor,
  type SortMode,
} from "@/lib/recipes/stats";
import type { Recipe, RecipeCategory } from "@/lib/recipes/types";
import { cn, hexToRgba, localDateStr } from "@/lib/utils";
import DishEditor from "./DishEditor";
import PlanDishDialog from "./PlanDishDialog";
import CategoryManager from "./CategoryManager";
import SelectionDialog from "./SelectionDialog";

const SORTS: { mode: SortMode; label: string; icon: typeof Flame }[] = [
  { mode: "name", label: "A–Z", icon: ArrowDownAZ },
  { mode: "popular", label: "Beliebt", icon: Flame },
  { mode: "recent", label: "Zuletzt", icon: Clock },
  { mode: "forgotten", label: "Lange her", icon: Hourglass },
];

/** Deterministischer Zufall: gleicher Tag + gleicher Wurf → gleicher Vorschlag (kein Hydration-Flackern). */
function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type EditorState = { recipe: Recipe | null; prefillName?: string } | null;
type Toast = { message: string; tone: "success" | "error" };

export default function DishManager() {
  const { meals, recipes, recipeCategories, recipesError, recipesLoaded } = useDataStore();
  const todayStr = localDateStr(new Date());

  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>("name");
  const [editor, setEditor] = useState<EditorState>(null);
  const [planDish, setPlanDish] = useState<string | null>(null);
  const [roll, setRoll] = useState(0);
  const [prevSuggestionId, setPrevSuggestionId] = useState<number | undefined>();
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Aufgeklappte Kategorien (Default: alle eingeklappt)
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  function toggleGroup(name: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (!next.delete(name)) next.add(name);
      return next;
    });
  }
  const selection = useRecipeSelection();

  useEffect(() => () => clearTimeout(toastTimer.current), []);
  function showToast(message: string, tone: Toast["tone"] = "success") {
    clearTimeout(toastTimer.current);
    setToast({ message, tone });
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }

  // Nur noch existierende Gerichte (gelöschte fallen automatisch heraus), in Listenreihenfolge
  const selectedRecipes = useMemo(
    () => recipes.filter((r) => selection.selected.has(r.id)),
    [recipes, selection.selected]
  );
  const addedThisSession = useMemo(
    () => recipes.filter((r) => selection.addedThisSession.has(r.id)).map((r) => r.id),
    [recipes, selection.addedThisSession]
  );

  async function exportPdf() {
    if (selectedRecipes.length === 0 || exporting) return;
    setExporting(true);
    try {
      const res = await listIngredientsFor(selectedRecipes.map((r) => r.id));
      if ("error" in res) {
        showToast(res.error, "error");
        return;
      }
      const doc = await createRecipeCardsPdf(
        selectedRecipes.map((r) => ({ ...r, ingredients: res.data[r.id] ?? [] }))
      );
      doc.save(PDF_FILE_NAME);
      showToast(`PDF mit ${selectedRecipes.length} Kärtchen erstellt`);
    } catch (error) {
      console.error("PDF export failed", error);
      showToast("PDF konnte nicht erstellt werden.", "error");
    } finally {
      setExporting(false);
    }
  }

  const stats = useMemo(() => computeDishStats(meals, todayStr), [meals, todayStr]);
  const unlisted = useMemo(() => findUnlistedDishes(meals, recipes), [meals, recipes]);
  const catByName = useMemo(
    () => new Map(recipeCategories.map((c) => [c.name, c])),
    [recipeCategories]
  );

  const categoryChips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of recipes) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
    return [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "de"))
      .map(([name, count]) => ({ name, count, cat: catByName.get(name) }));
  }, [recipes, catByName]);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("de");
    const filtered = recipes.filter(
      (r) =>
        (activeCategory === null || r.category === activeCategory) &&
        (!q ||
          r.name.toLocaleLowerCase("de").includes(q) ||
          r.bemerkung.toLocaleLowerCase("de").includes(q) ||
          r.category.toLocaleLowerCase("de").includes(q))
    );
    return sortRecipes(filtered, stats, sort);
  }, [recipes, activeCategory, query, sort, stats]);

  // A–Z ohne Filter: nach Kategorie gruppiert, sonst flache Liste
  const grouped = sort === "name" && activeCategory === null && !query.trim();
  const sections = useMemo(() => {
    if (!grouped) return [{ name: null as string | null, items: visible }];
    const map = new Map<string, Recipe[]>();
    for (const r of visible) {
      if (!map.has(r.category)) map.set(r.category, []);
      map.get(r.category)!.push(r);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "de"))
      .map(([name, items]) => ({ name: name as string | null, items }));
  }, [grouped, visible]);

  const allGroupsOpen = sections.every((sec) => sec.name === null || openGroups.has(sec.name));

  const dayNumber = Math.floor(Date.parse(`${todayStr}T00:00:00Z`) / 86_400_000);
  const suggestion = useMemo(
    () => pickSuggestion(recipes, stats, todayStr, seededRandom(dayNumber * 1000 + roll), prevSuggestionId),
    [recipes, stats, todayStr, dayNumber, roll, prevSuggestionId]
  );

  const tiles = useMemo(() => {
    let plannedSlots = 0;
    for (const m of meals) {
      const d = daysBetween(todayStr, m.date);
      if (d < 0 || d > 6) continue;
      if (m.lunch?.trim()) plannedSlots++;
      if (m.dinner?.trim()) plannedSlots++;
    }
    const neverCooked = recipes.filter((r) => {
      const s = statsFor(stats, r.name);
      return s.count === 0 && !s.nextDate;
    }).length;
    const favorite = sortRecipes(recipes, stats, "popular")[0];
    const favoriteCount = favorite ? statsFor(stats, favorite.name).count : 0;
    return { plannedSlots, neverCooked, favorite: favoriteCount > 0 ? favorite : null, favoriteCount };
  }, [meals, recipes, stats, todayStr]);

  const editorStats = editor?.recipe
    ? statsFor(stats, editor.recipe.name)
    : statsFor(stats, editor?.prefillName ?? "");

  if (recipesError) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-[var(--destructive)]/30 bg-[var(--destructive)]/5 p-6 text-center">
        <p className="text-3xl">🍳</p>
        <p className="mt-2 font-medium">Rezeptliste nicht erreichbar</p>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">{recipesError}</p>
      </div>
    );
  }

  if (!recipesLoaded) {
    return (
      <div className="space-y-4">
        <div className="h-36 animate-pulse rounded-2xl bg-[var(--card)]" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-[var(--card)]" />
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-[var(--card)]" />
          ))}
        </div>
      </div>
    );
  }

  const suggestionCat = suggestion ? catByName.get(suggestion.category) : undefined;
  const suggestionColor = suggestionCat?.color ?? FALLBACK_CATEGORY_COLOR;
  const suggestionStats = suggestion ? statsFor(stats, suggestion.name) : null;

  return (
    <div className="space-y-5">
      {/* Was essen wir? */}
      {suggestion && suggestionStats && (
        <section
          className="relative overflow-hidden rounded-2xl border border-[var(--border)] p-4 sm:p-5"
          style={{
            background: `radial-gradient(120% 140% at 0% 0%, ${hexToRgba(suggestionColor, 0.28)}, transparent 60%), var(--card)`,
          }}
        >
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            <Sparkles className="h-3.5 w-3.5" /> Was essen wir?
          </p>
          <div key={`${suggestion.id}-${roll}`} className="dish-pop mt-3 flex items-center gap-4">
            <span
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-4xl shadow-sm"
              style={{ backgroundColor: hexToRgba(suggestionColor, 0.3) }}
            >
              {categoryEmoji(suggestionCat)}
            </span>
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setEditor({ recipe: suggestion })}
                className="block max-w-full truncate text-left text-2xl font-bold tracking-tight hover:underline"
              >
                {suggestion.name}
              </button>
              <p className="text-sm text-[var(--muted-foreground)]">
                {suggestionStats.lastDate
                  ? `Zuletzt ${relativeDay(suggestionStats.lastDate, todayStr)} · ${suggestionStats.count}× gegessen`
                  : "Noch nie gekocht – Zeit, es auszuprobieren!"}
              </p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => setPlanDish(suggestion.name)} className="flex-1 gap-2 sm:flex-none">
              <CalendarPlus className="h-4 w-4" /> Einplanen
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setPrevSuggestionId(suggestion.id);
                setRoll((r) => r + 1);
              }}
              className="flex-1 gap-2 bg-[var(--card)]/60 sm:flex-none"
              disabled={recipes.length < 2}
            >
              <Dices key={roll} className="dice-spin h-4 w-4" /> Neu würfeln
            </Button>
          </div>
        </section>
      )}

      {/* Kennzahlen */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Gerichte" value={recipes.length} sub={`${categoryChips.length} Kategorien`} />
        <StatTile
          label="Nächste 7 Tage"
          value={`${tiles.plannedSlots}/14`}
          sub="Mahlzeiten geplant"
          progress={tiles.plannedSlots / 14}
        />
        <StatTile
          label="Nie gekocht"
          value={tiles.neverCooked}
          sub={tiles.neverCooked > 0 ? "warten aufs erste Mal" : "alles probiert 🎉"}
          onClick={tiles.neverCooked > 0 ? () => setSort("forgotten") : undefined}
        />
        <StatTile
          label="Liebling"
          value={tiles.favorite ? `${tiles.favoriteCount}×` : "–"}
          sub={tiles.favorite?.name ?? "noch keine Daten"}
          onClick={tiles.favorite ? () => setEditor({ recipe: tiles.favorite }) : undefined}
        />
      </section>

      {/* Werkzeugleiste */}
      <section className="sticky top-0 z-10 -mx-3 space-y-2 bg-[var(--background)]/85 px-3 py-2 backdrop-blur-md sm:-mx-6 sm:px-6">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Gericht suchen…"
              className="h-10 w-full rounded-xl border border-[var(--input)] bg-[var(--card)] pl-9 pr-9 text-sm placeholder:text-[var(--muted-foreground)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                title="Suche leeren"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button
            variant="outline"
            onClick={() => setCategoryManagerOpen(true)}
            title="Kategorien verwalten"
            className="h-10 gap-1.5 rounded-xl bg-[var(--card)]"
          >
            <Tags className="h-4 w-4" />
            <span className="hidden lg:inline">Kategorien</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => setSelectMode((m) => !m)}
            title="Gerichte für PDF-Kärtchen auswählen"
            aria-pressed={selectMode}
            className={cn(
              "h-10 gap-1.5 rounded-xl bg-[var(--card)]",
              selectMode && "border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary)]"
            )}
          >
            <ListChecks className="h-4 w-4" />
            <span className="hidden lg:inline">Auswählen</span>
          </Button>
          <Button onClick={() => setEditor({ recipe: null })} className="h-10 gap-1.5 rounded-xl">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Neues Gericht</span>
          </Button>
        </div>

        {(selectMode || selectedRecipes.length > 0) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/10 px-3 py-1.5 text-sm">
            <button
              type="button"
              onClick={() => setSelectionOpen(true)}
              className="tabular font-medium hover:underline"
            >
              {selectedRecipes.length} ausgewählt
            </button>
            {selectMode && visible.length > 0 && (
              <button
                type="button"
                onClick={() => selection.toggleAll(visible.map((r) => r.id))}
                className="text-[var(--primary)] hover:underline"
              >
                {visible.every((r) => selection.selected.has(r.id))
                  ? query.trim() || activeCategory !== null
                    ? "Gefilterte abwählen"
                    : "Alle abwählen"
                  : query.trim() || activeCategory !== null
                  ? `Gefilterte auswählen (${visible.length})`
                  : "Alle auswählen"}
              </button>
            )}
            {selectMode && addedThisSession.length > 0 && (
              <button
                type="button"
                onClick={() => selection.selectMany(addedThisSession)}
                title="In dieser Sitzung neu angelegte Gerichte auswählen"
                className="text-emerald-600 hover:underline dark:text-emerald-400"
              >
                Neue auswählen ({addedThisSession.length})
              </button>
            )}
            <span className="flex-1" />
            {!selectMode && (
              <button
                type="button"
                onClick={() => selection.clear()}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                Leeren
              </button>
            )}
            <Button
              size="sm"
              onClick={exportPdf}
              disabled={selectedRecipes.length === 0 || exporting}
              className="h-7 gap-1.5"
            >
              <FileDown className="h-3.5 w-3.5" />
              {exporting ? "Erstellt…" : "PDF"}
            </Button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="no-scrollbar -my-1 flex flex-1 gap-1.5 overflow-x-auto py-1">
            <Chip active={activeCategory === null} onClick={() => setActiveCategory(null)}>
              Alle <span className="tabular opacity-60">{recipes.length}</span>
            </Chip>
            {categoryChips.map(({ name, count, cat }) => (
              <Chip
                key={name}
                active={activeCategory === name}
                color={cat?.color ?? FALLBACK_CATEGORY_COLOR}
                onClick={() => setActiveCategory(activeCategory === name ? null : name)}
              >
                <span className="text-xs">{categoryEmoji(cat)}</span>
                {categoryLabel(name)}
                <span className="tabular opacity-60">{count}</span>
              </Chip>
            ))}
          </div>
        </div>

        <div className="flex rounded-xl bg-[var(--card)] p-0.5">
          {SORTS.map(({ mode, label, icon: Icon }) => (
            <button
              key={mode}
              type="button"
              onClick={() => setSort(mode)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-[10px] py-1.5 text-xs font-medium transition-all",
                sort === mode
                  ? "bg-[var(--accent)] text-[var(--foreground)] shadow-sm"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* Gerichte */}
      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--input)] px-6 py-10 text-center">
          <ChefHat className="mx-auto h-8 w-8 text-[var(--muted-foreground)]" />
          {recipes.length === 0 ? (
            <>
              <p className="mt-2 font-medium">Noch keine Gerichte</p>
              <p className="text-sm text-[var(--muted-foreground)]">Leg das erste Lieblingsessen an.</p>
            </>
          ) : (
            <>
              <p className="mt-2 font-medium">Nichts gefunden</p>
              {query.trim() && (
                <Button
                  variant="link"
                  onClick={() => setEditor({ recipe: null, prefillName: query.trim() })}
                  className="mt-1"
                >
                  „{query.trim()}“ als neues Gericht anlegen
                </Button>
              )}
            </>
          )}
        </div>
      ) : (
        <div className={grouped ? "space-y-2" : "space-y-5"}>
          {grouped && sections.length > 1 && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() =>
                  setOpenGroups(allGroupsOpen ? new Set() : new Set(sections.map((sec) => sec.name ?? "")))
                }
                className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                {allGroupsOpen ? "Alle zuklappen" : "Alle aufklappen"}
              </button>
            </div>
          )}
          {sections.map(({ name, items }) => {
            const cat = name !== null ? catByName.get(name) : undefined;
            const isOpen = name === null || openGroups.has(name);
            const selectedCount = items.filter((r) => selection.selected.has(r.id)).length;
            return (
              <section key={name ?? "_all"} className="space-y-2">
                {name !== null && (
                  <h2>
                    <button
                      type="button"
                      onClick={() => toggleGroup(name)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-left text-sm font-semibold transition-colors hover:bg-[var(--accent)]"
                    >
                      <ChevronRight
                        className={cn(
                          "h-4 w-4 shrink-0 text-[var(--muted-foreground)] transition-transform",
                          isOpen && "rotate-90"
                        )}
                      />
                      <span className="text-base leading-none">{categoryEmoji(cat)}</span>
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: cat?.color ?? FALLBACK_CATEGORY_COLOR }}
                      />
                      <span className="min-w-0 flex-1 truncate">{categoryLabel(name)}</span>
                      {selectedCount > 0 && (
                        <span className="tabular text-xs font-medium text-[var(--primary)]">
                          {selectedCount} ausgewählt
                        </span>
                      )}
                      <span className="tabular text-xs font-normal text-[var(--muted-foreground)]">
                        {items.length}
                      </span>
                    </button>
                  </h2>
                )}
                {isOpen && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {items.map((r) => (
                      <DishCard
                        key={r.id}
                        recipe={r}
                        cat={catByName.get(r.category)}
                        todayStr={todayStr}
                        stats={statsFor(stats, r.name)}
                        showCategory={!grouped}
                        selectMode={selectMode}
                        selected={selection.selected.has(r.id)}
                        onToggleSelect={() => selection.toggle(r.id)}
                        onOpen={() => (selectMode ? selection.toggle(r.id) : setEditor({ recipe: r }))}
                        onPlan={() => setPlanDish(r.name)}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* Im Plan, aber nicht in der Liste */}
      {unlisted.length > 0 && (
        <section className="space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div>
            <h2 className="text-sm font-semibold">Im Plan, aber nicht in der Liste</h2>
            <p className="text-xs text-[var(--muted-foreground)]">
              Frei eingetippte Gerichte – mit einem Tipp übernehmen.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {unlisted.map(({ name, count }) => (
              <button
                key={dishKey(name)}
                type="button"
                onClick={() => setEditor({ recipe: null, prefillName: name })}
                className="group flex items-center gap-1.5 rounded-full border border-dashed border-[var(--input)] px-3 py-1 text-sm transition-colors hover:border-[var(--primary)] hover:bg-[var(--primary)]/10"
              >
                <Plus className="h-3.5 w-3.5 text-[var(--muted-foreground)] group-hover:text-[var(--primary)]" />
                {name}
                <span className="tabular text-xs text-[var(--muted-foreground)]">{count}×</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {editor && (
        <DishEditor
          recipe={editor.recipe}
          prefillName={editor.prefillName}
          stats={editorStats}
          onClose={() => setEditor(null)}
          onToast={showToast}
          onCreated={(r) => selection.markAdded(r.id)}
        />
      )}
      {categoryManagerOpen && (
        <CategoryManager
          onClose={() => setCategoryManagerOpen(false)}
          onToast={showToast}
          onDeleted={(name) => setActiveCategory((cur) => (cur === name ? null : cur))}
        />
      )}
      {selectionOpen && (
        <SelectionDialog
          recipes={selectedRecipes}
          catByName={catByName}
          exporting={exporting}
          onRemove={selection.toggle}
          onClearAll={selection.clear}
          onExport={exportPdf}
          onClose={() => setSelectionOpen(false)}
        />
      )}
      {planDish && (
        <PlanDishDialog dish={planDish} onClose={() => setPlanDish(null)} onPlanned={showToast} />
      )}

      {toast && (
        <div
          role="status"
          className="dish-pop fixed bottom-24 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--popover)] px-4 py-2.5 text-sm shadow-2xl md:bottom-8"
        >
          {toast.tone === "error" ? (
            <CircleAlert className="h-4 w-4 shrink-0 text-[var(--destructive)]" />
          ) : (
            <Check className="h-4 w-4 shrink-0 text-emerald-500" />
          )}
          <span className="truncate">{toast.message}</span>
        </div>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  progress,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
  progress?: number;
  onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-left",
        onClick && "transition-colors hover:bg-[var(--accent)]"
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">{label}</p>
      <p className="tabular mt-0.5 text-2xl font-bold tracking-tight">{value}</p>
      <p className="truncate text-xs text-[var(--muted-foreground)]">{sub}</p>
      {progress !== undefined && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-[var(--accent)]">
          <div
            className="h-full bg-[var(--primary)] transition-all"
            style={{ width: `${Math.min(progress, 1) * 100}%` }}
          />
        </div>
      )}
    </Comp>
  );
}

function Chip({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-sm transition-all",
        active
          ? "border-transparent font-medium text-[var(--foreground)] shadow-sm"
          : "border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      )}
      style={
        active
          ? { backgroundColor: color ? hexToRgba(color, 0.25) : "var(--accent)" }
          : undefined
      }
    >
      {children}
    </button>
  );
}

function DishCard({
  recipe,
  cat,
  stats,
  todayStr,
  showCategory,
  selectMode,
  selected,
  onToggleSelect,
  onOpen,
  onPlan,
}: {
  recipe: Recipe;
  cat: RecipeCategory | undefined;
  stats: ReturnType<typeof statsFor>;
  todayStr: string;
  showCategory: boolean;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onPlan: () => void;
}) {
  const color = cat?.color ?? FALLBACK_CATEGORY_COLOR;
  const next = stats.nextDate;
  return (
    <div
      className={cn(
        "group relative flex items-stretch overflow-hidden rounded-xl border bg-[var(--card)] transition-all hover:-translate-y-px hover:shadow-lg",
        selected
          ? "border-[var(--primary)] ring-1 ring-[var(--primary)]"
          : "border-[var(--border)] hover:border-[var(--input)]"
      )}
    >
      <span className="w-1 shrink-0" style={{ backgroundColor: color }} />
      {(selectMode || selected) && (
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={`„${recipe.name}“ für PDF auswählen`}
          onClick={onToggleSelect}
          className="flex w-10 shrink-0 items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--primary)]"
        >
          {selected ? (
            <SquareCheckBig className="h-5 w-5 text-[var(--primary)]" />
          ) : (
            <Square className="h-5 w-5" />
          )}
        </button>
      )}
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl"
          style={{ backgroundColor: hexToRgba(color, 0.18) }}
        >
          {categoryEmoji(cat)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{recipe.name}</span>
          {recipe.bemerkung ? (
            <span className="block truncate text-xs text-[var(--muted-foreground)]">{recipe.bemerkung}</span>
          ) : showCategory ? (
            <span className="block truncate text-xs text-[var(--muted-foreground)]">{categoryLabel(recipe.category)}</span>
          ) : null}
          <span className="mt-1.5 flex flex-wrap items-center gap-1">
            {next && (
              <Badge tone="primary">
                {next === todayStr ? "heute geplant" : `geplant ${relativeDay(next, todayStr)}`}
              </Badge>
            )}
            {stats.count > 0 ? (
              <>
                <Badge>{stats.count}×</Badge>
                <Badge>zuletzt {relativeDay(stats.lastDate!, todayStr)}</Badge>
              </>
            ) : (
              !next && <Badge tone="warm">✨ noch nie gekocht</Badge>
            )}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={onPlan}
        title={`„${recipe.name}“ einplanen`}
        className="flex w-12 shrink-0 items-center justify-center border-l border-[var(--border)] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--primary)]/10 hover:text-[var(--primary)]"
      >
        <CalendarPlus className="h-4 w-4" />
      </button>
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: "primary" | "warm" }) {
  return (
    <span
      className={cn(
        "tabular rounded-full px-2 py-px text-[11px] font-medium",
        tone === "primary"
          ? "bg-[var(--primary)]/15 text-[var(--primary)]"
          : tone === "warm"
          ? "bg-[var(--warning)]/15 text-[var(--warning)]"
          : "bg-[var(--accent)] text-[var(--muted-foreground)]"
      )}
    >
      {children}
    </span>
  );
}
