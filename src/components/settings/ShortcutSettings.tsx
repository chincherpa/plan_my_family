"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, RotateCcw } from "lucide-react";
import { useDataStore } from "@/lib/store/dataStore";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import Kbd from "@/components/shortcuts/Kbd";
import {
  SHORTCUT_ACTIONS,
  SHORTCUT_GROUPS,
  actionLabel,
  assignCombo,
  eventToCombo,
  isReservedCombo,
  parseShortcutOverrides,
  resolveKeymap,
  type ShortcutActionId,
  type ShortcutOverrides,
} from "@/lib/shortcuts/keymap";

/** Tastatur-Shortcuts der Familie anpassen: Taste aufnehmen, tauschen, zurücksetzen. */
export default function ShortcutSettings() {
  const { family, setFamily } = useDataStore();
  const [recording, setRecording] = useState<ShortcutActionId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Wie in MealWeekdaySettings: auf den zuletzt von der DB bestätigten Stand
  // zurückrollen, und nur die Antwort der neuesten Anfrage auswerten.
  const confirmed = useRef<ShortcutOverrides | null>(null);
  const latestRequest = useRef(0);

  const overrides = parseShortcutOverrides(family?.keyboard_shortcuts);
  const keymap = resolveKeymap(overrides);
  const hasOverrides = Object.keys(overrides).length > 0;

  async function save(next: ShortcutOverrides) {
    if (!family) return;
    const fallback = confirmed.current ?? overrides;
    const request = ++latestRequest.current;
    setFamily({ ...family, keyboard_shortcuts: next });
    setError(null);
    const { data: updated, error: updateError } = await createClient()
      .from("families")
      .update({ keyboard_shortcuts: next })
      .eq("id", family.id)
      .select("id");
    if (request !== latestRequest.current) return;
    const latest = useDataStore.getState().family;
    // Keine Zeile zurück → RLS hat das Update still verworfen
    if (updateError || !updated?.length) {
      if (latest) setFamily({ ...latest, keyboard_shortcuts: fallback });
      setNotice(null);
      setError("Shortcuts konnten nicht gespeichert werden.");
      return;
    }
    confirmed.current = next;
  }

  // Aufnahme: der nächste Tastendruck wird die neue Taste. Capture-Phase und
  // preventDefault, damit der globale Shortcut-Listener ihn nicht ausführt.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    if (!recording) return;
    const id = recording;
    function onKeyDown(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(null);
        return;
      }
      const current = parseShortcutOverrides(useDataStore.getState().family?.keyboard_shortcuts);
      if (e.key === "Backspace" || e.key === "Delete") {
        setRecording(null);
        setNotice(`„${actionLabel(id)}“ deaktiviert.`);
        void saveRef.current(assignCombo(current, id, null));
        return;
      }
      const combo = eventToCombo(e);
      if (!combo) return; // nur Modifier gedrückt — auf die eigentliche Taste warten
      if (isReservedCombo(combo)) {
        setError("Diese Taste braucht der Browser oder die Bedienung – bitte eine andere wählen.");
        return;
      }
      const before = resolveKeymap(current);
      const swapped = SHORTCUT_ACTIONS.find((a) => a.id !== id && before[a.id] === combo);
      setRecording(null);
      setError(null);
      setNotice(
        swapped
          ? `Getauscht: „${swapped.label}“ hat jetzt ${before[id] ? "die bisherige Taste" : "keine Taste"}.`
          : null
      );
      void saveRef.current(assignCombo(current, id, combo));
    }
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [recording]);

  function reset(id: ShortcutActionId) {
    const def = SHORTCUT_ACTIONS.find((a) => a.id === id)?.defaultKey ?? null;
    setNotice(null);
    void save(assignCombo(overrides, id, def));
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
        <h1 className="text-3xl font-bold tracking-tight">Tastatur-Shortcuts</h1>
        {hasOverrides && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            disabled={!family}
            onClick={() => {
              setNotice(null);
              void save({});
            }}
          >
            Alle zurücksetzen
          </Button>
        )}
      </div>

      <p className="text-sm text-[var(--muted-foreground)]">
        Gilt für alle Familienmitglieder · <Kbd combo={keymap.showHelp ?? "?"} className="align-middle" /> zeigt die
        Übersicht
      </p>

      {SHORTCUT_GROUPS.map((group) => (
        <section key={group}>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            {group}
          </h3>
          <ul className="divide-y divide-[var(--border)]">
            {SHORTCUT_ACTIONS.filter((a) => a.group === group).map((action) => {
              const combo = keymap[action.id];
              const isRecording = recording === action.id;
              const isCustom = action.id in overrides;
              return (
                <li key={action.id} className="flex items-center gap-2 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{action.label}</span>
                  {isCustom && !isRecording && (
                    <button
                      type="button"
                      onClick={() => reset(action.id)}
                      disabled={!family}
                      title="Auf Standard zurücksetzen"
                      aria-label={`${action.label} auf Standard zurücksetzen`}
                      className="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={!family}
                    onClick={() => {
                      setError(null);
                      setNotice(null);
                      setRecording(isRecording ? null : action.id);
                    }}
                    aria-pressed={isRecording}
                    title={isRecording ? undefined : "Klicken und neue Taste drücken"}
                    className={`flex min-h-8 min-w-24 items-center justify-center rounded-lg border px-2 py-1 transition-colors ${
                      isRecording
                        ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                        : "border-[var(--border)] hover:bg-[var(--accent)]"
                    }`}
                  >
                    {isRecording ? (
                      <span className="text-xs">Taste drücken…</span>
                    ) : combo ? (
                      <Kbd combo={combo} />
                    ) : (
                      <span className="text-xs text-[var(--muted-foreground)]">aus</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {recording && (
        <p className="text-xs text-[var(--muted-foreground)]">
          <Kbd combo="Escape" className="align-middle" /> bricht ab ·{" "}
          <Kbd combo="Backspace" className="align-middle" /> deaktiviert den Shortcut
        </p>
      )}
      {notice && <p className="text-sm text-[var(--muted-foreground)]">{notice}</p>}
      {error && <p className="text-sm text-[var(--destructive)]">{error}</p>}
    </div>
    </div>
  );
}
