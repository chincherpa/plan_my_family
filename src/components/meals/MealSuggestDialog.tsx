"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, Loader2, RefreshCw, Sparkles, Undo2, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDataStore } from "@/lib/store/dataStore";
import { saveMealSlot } from "@/lib/meals/saveMealSlot";
import { categoryForDate, parseWeekdayCategories } from "@/lib/meals/weekdayCategories";
import { pickLocalOption, type SlotSuggestion, type SuggestionOption } from "@/lib/meals/mealSuggestions";
import { computeDishStats, dishKey, type MealType } from "@/lib/recipes/stats";
import { cn, localDateStr } from "@/lib/utils";

type Decision = "open" | "accepted" | "rejected";
type Row = SlotSuggestion & { index: number; decision: Decision };

const SLOT_INFO: Record<MealType, { label: string; emoji: string }> = {
  lunch: { label: "Mittag", emoji: "🍽" },
  dinner: { label: "Abend", emoji: "🌙" },
};
const PREF_KEY = "meal-suggest-slots";

function readSlotPref(): Record<MealType, boolean> {
  try {
    const raw = JSON.parse(localStorage.getItem(PREF_KEY) ?? "null");
    if (raw && typeof raw.lunch === "boolean" && typeof raw.dinner === "boolean") return raw;
  } catch {
    // ohne gespeicherte Auswahl: beide
  }
  return { lunch: true, dinner: true };
}

type FetchResult = { rows?: Row[]; error?: string; notice?: string };

async function fetchSuggestions(slots: { date: string; type: MealType }[]): Promise<FetchResult> {
  if (slots.length === 0) return { rows: [] };
  try {
    const res = await fetch("/api/meals/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slots }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.message ?? "Vorschläge konnten nicht geladen werden." };
    return {
      notice: data.notice,
      rows: (data.suggestions as SlotSuggestion[])
        .filter((s) => s.options.length > 0)
        .map((s) => ({ ...s, index: 0, decision: "open" })),
    };
  } catch {
    return { error: "Keine Verbindung. Bitte nochmal versuchen." };
  }
}

/** KI-Vorschläge für die freien Plätze einer Woche: annehmen, ersetzen oder ablehnen. */
export default function MealSuggestDialog({
  title,
  dates,
  onClose,
}: {
  title: string;
  /** Tage der Woche (YYYY-MM-DD), vergangene schon herausgefiltert */
  dates: string[];
  onClose: () => void;
}) {
  const { family, meals, recipes, upsertMeal } = useDataStore();
  const [slotPref, setSlotPref] = useState<Record<MealType, boolean>>(() => readSlotPref());
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Für welche Plätze die angezeigten Vorschläge erstellt wurden */
  const [requestedKey, setRequestedKey] = useState<string | null>(null);
  const requestId = useRef(0);

  const todayStr = localDateStr(new Date());
  const weekdayCats = useMemo(
    () => parseWeekdayCategories(family?.meal_weekday_categories),
    [family?.meal_weekday_categories]
  );
  const mealsByDate = useMemo(() => new Map(meals.map((m) => [m.date, m])), [meals]);

  /** Freie Plätze nach aktueller Auswahl Mittag/Abend */
  const freeSlots = useMemo(
    () =>
      dates
        .filter((d) => d >= todayStr)
        .flatMap((date) =>
          (["lunch", "dinner"] as const)
            .filter((type) => slotPref[type] && !mealsByDate.get(date)?.[type]?.trim())
            .map((type) => ({ date, type }))
        ),
    // mealsByDate absichtlich nicht: Übernommene Gerichte sollen die Liste nicht neu laden
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dates, slotPref, todayStr]
  );
  const slotsKey = freeSlots.map((s) => `${s.date}-${s.type}`).join(",");

  /** Ergebnis einer Anfrage übernehmen – nur, wenn inzwischen keine neuere gestartet wurde. */
  const apply = useCallback((id: number, key: string, result: FetchResult) => {
    if (id !== requestId.current) return;
    setRequestedKey(key);
    setLoading(false);
    setError(result.error ?? null);
    setNotice(result.notice ?? null);
    setRows(result.rows ?? null);
  }, []);

  const load = useCallback(() => {
    const id = ++requestId.current;
    setError(null);
    setNotice(null);
    setLoading(true);
    fetchSuggestions(freeSlots).then((r) => apply(id, slotsKey, r));
  }, [freeSlots, slotsKey, apply]);

  // Beim Öffnen direkt Vorschläge holen (loading ist anfangs schon true)
  useEffect(() => {
    const id = ++requestId.current;
    fetchSuggestions(freeSlots).then((r) => apply(id, slotsKey, r));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSlot(type: MealType) {
    const next = { ...slotPref, [type]: !slotPref[type] };
    if (!next.lunch && !next.dinner) return;
    setSlotPref(next);
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(next));
    } catch {
      // nur Komfort
    }
  }

  function update(i: number, change: Partial<Row>) {
    setRows((rs) => rs && rs.map((r, j) => (j === i ? { ...r, ...change } : r)));
  }

  /** Nächste Alternative; sind Claudes Vorschläge durch, wählt die App selbst ein weiteres Gericht. */
  function replace(i: number) {
    if (!rows) return;
    const row = rows[i];
    if (row.index + 1 < row.options.length) {
      update(i, { index: row.index + 1, decision: "open" });
      return;
    }
    const exclude = new Set(row.options.map((o) => dishKey(o.name)));
    for (const [j, r] of rows.entries()) if (j !== i && r.decision !== "rejected") exclude.add(dishKey(r.options[r.index].name));
    const extra: SuggestionOption | null = pickLocalOption({
      recipes,
      stats: computeDishStats(meals, todayStr),
      todayStr,
      category: categoryForDate(weekdayCats, row.date),
      exclude,
    });
    if (extra) update(i, { options: [...row.options, extra], index: row.options.length, decision: "open" });
    else update(i, { index: 0, decision: "open" }); // nichts Neues mehr: von vorn
  }

  const accepted = rows?.filter((r) => r.decision === "accepted") ?? [];
  const openCount = rows?.filter((r) => r.decision === "open").length ?? 0;

  async function save() {
    if (!family || accepted.length === 0) return;
    setSaving(true);
    setError(null);
    let failed = 0;
    let skipped = 0;
    for (const r of accepted) {
      // Inzwischen anderweitig belegt (anderes Fenster)? Nicht überschreiben.
      if (useDataStore.getState().meals.find((m) => m.date === r.date)?.[r.type]?.trim()) {
        skipped++;
        continue;
      }
      const saved = await saveMealSlot(family.id, r.date, r.type, r.options[r.index].name);
      if (saved) upsertMeal(saved);
      else failed++;
    }
    setSaving(false);
    if (failed > 0) {
      setError(`${failed} Gericht${failed === 1 ? "" : "e"} konnte${failed === 1 ? "" : "n"} nicht gespeichert werden.`);
      return;
    }
    if (skipped > 0) {
      setNotice(`${skipped} Platz${skipped === 1 ? " war" : "e waren"} inzwischen schon belegt und wurde${skipped === 1 ? "" : "n"} übersprungen.`);
      setRows((rs) => rs && rs.filter((r) => r.decision !== "accepted"));
      return;
    }
    onClose();
  }

  const stale = requestedKey !== null && requestedKey !== slotsKey;

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            <Sparkles className="h-4 w-4 shrink-0 text-[var(--primary)]" />
            {title}
          </DialogTitle>
          <DialogPrimitive.Description className="text-sm text-[var(--muted-foreground)]">
            Der Assistent schlägt Gerichte für die freien Plätze vor. Annehmen, ersetzen oder ablehnen –
            gespeichert wird erst mit „Übernehmen“.
          </DialogPrimitive.Description>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          {(["lunch", "dinner"] as const).map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={slotPref[type]}
              onClick={() => toggleSlot(type)}
              disabled={loading || saving}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                slotPref[type]
                  ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                  : "border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
              )}
            >
              {SLOT_INFO[type].emoji} {SLOT_INFO[type].label}
            </button>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={load}
            disabled={loading || saving}
            title="Alle Vorschläge neu erstellen"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            {stale ? "Neu erstellen" : "Neue Vorschläge"}
          </Button>
        </div>

        {error && (
          <p className="rounded-md bg-[var(--destructive)]/10 px-3 py-2 text-sm text-[var(--destructive)]">{error}</p>
        )}
        {notice && (
          <p className="rounded-md bg-[var(--warning)]/10 px-3 py-2 text-sm text-[var(--foreground)]">{notice}</p>
        )}

        <div className="-mx-1 max-h-[50dvh] min-h-24 space-y-1.5 overflow-y-auto px-1">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--muted-foreground)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Der Assistent plant …
            </div>
          )}
          {!loading && rows?.length === 0 && (
            <p className="py-10 text-center text-sm text-[var(--muted-foreground)]">
              In dieser Woche ist nichts mehr frei.
            </p>
          )}
          {!loading &&
            rows?.map((row, i) => {
              const option = row.options[row.index];
              const day = new Date(`${row.date}T12:00:00`);
              return (
                <div
                  key={`${row.date}-${row.type}`}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-2.5 py-2 transition-colors",
                    row.decision === "accepted"
                      ? "border-[var(--primary)]/50 bg-[var(--primary)]/10"
                      : row.decision === "rejected"
                      ? "border-dashed border-[var(--border)] opacity-60"
                      : "border-[var(--border)] bg-[var(--card)]"
                  )}
                >
                  <div className="w-16 shrink-0 leading-tight">
                    <p className="text-sm font-semibold">
                      {day.toLocaleDateString("de-DE", { weekday: "short" })}{" "}
                      <span className="tabular text-xs font-normal text-[var(--muted-foreground)]">
                        {day.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
                      </span>
                    </p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {SLOT_INFO[row.type].emoji} {SLOT_INFO[row.type].label}
                    </p>
                    {weekdayCats && categoryForDate(weekdayCats, row.date) && (
                      <p className="truncate text-[11px] font-medium text-[var(--primary)]">
                        {categoryForDate(weekdayCats, row.date)}
                      </p>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-sm font-medium", row.decision === "rejected" && "line-through")}>
                      {option.name}
                    </p>
                    <p className="truncate text-xs text-[var(--muted-foreground)]">
                      {row.decision === "rejected" ? "abgelehnt – bleibt frei" : `${option.category} · ${option.reason}`}
                      {row.options.length > 1 && row.decision !== "rejected" && (
                        <span className="tabular"> · {row.index + 1}/{row.options.length}</span>
                      )}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-0.5">
                    {row.decision === "open" ? (
                      <>
                        <IconButton title="Annehmen" onClick={() => update(i, { decision: "accepted" })} tone="primary">
                          <Check className="h-4 w-4" />
                        </IconButton>
                        <IconButton title="Ersetzen" onClick={() => replace(i)}>
                          <RefreshCw className="h-4 w-4" />
                        </IconButton>
                        <IconButton title="Ablehnen" onClick={() => update(i, { decision: "rejected" })} tone="destructive">
                          <X className="h-4 w-4" />
                        </IconButton>
                      </>
                    ) : (
                      <>
                        {row.decision === "accepted" && (
                          <IconButton title="Ersetzen" onClick={() => replace(i)}>
                            <RefreshCw className="h-4 w-4" />
                          </IconButton>
                        )}
                        <IconButton title="Rückgängig" onClick={() => update(i, { decision: "open" })}>
                          <Undo2 className="h-4 w-4" />
                        </IconButton>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
        </div>

        {!loading && rows && rows.length > 0 && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={openCount === 0 || saving}
              onClick={() => setRows((rs) => rs && rs.map((r) => (r.decision === "open" ? { ...r, decision: "accepted" } : r)))}
            >
              Alle offenen annehmen
            </Button>
            <Button onClick={save} disabled={accepted.length === 0 || saving || !family}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {accepted.length > 0 ? `${accepted.length} übernehmen` : "Übernehmen"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function IconButton({
  title,
  onClick,
  tone,
  children,
}: {
  title: string;
  onClick: () => void;
  tone?: "primary" | "destructive";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        "rounded-lg p-1.5 transition-colors",
        tone === "primary"
          ? "text-[var(--primary)] hover:bg-[var(--primary)]/15"
          : tone === "destructive"
          ? "text-[var(--destructive)] hover:bg-[var(--destructive)]/10"
          : "text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
      )}
    >
      {children}
    </button>
  );
}
