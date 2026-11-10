"use client";
import { useEffect, useMemo, useRef } from "react";
import { useDataStore } from "@/lib/store/dataStore";
import { useShortcutStore, registerShortcut, runShortcut } from "@/lib/store/shortcutStore";
import { useTodoStore } from "@/lib/store/todoStore";
import {
  eventToCombo,
  invertKeymap,
  parseShortcutOverrides,
  resolveKeymap,
  type Keymap,
  type ShortcutActionId,
} from "./keymap";

/** Wirksame Belegung der Familie (Standard + gespeicherte Abweichungen). */
export function useKeymap(): Keymap {
  const raw = useDataStore((s) => s.family?.keyboard_shortcuts);
  return useMemo(() => resolveKeymap(parseShortcutOverrides(raw)), [raw]);
}

/**
 * Registriert einen Handler für eine Aktion, solange die Komponente gemountet
 * ist. Der Handler darf sich bei jedem Rendern ändern — es zählt der neueste.
 */
export function useShortcut(id: ShortcutActionId, handler: () => void): void {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => registerShortcut(id, () => latest.current()), [id]);
}

/** Aktionen, die auch bei gedrückt gehaltener Taste wiederholt werden. */
const REPEATABLE = new Set<ShortcutActionId>(["prevDay", "nextDay"]);

/** Offene Dialoge, Popover und Menüs fangen Tasten selbst ab (Typeahead, Esc, …). */
const OVERLAY_SELECTOR = [
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
  '[role="menu"][data-state="open"]',
  '[role="listbox"][data-state="open"]',
].join(",");

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.closest("input, textarea, select, [contenteditable='true']") !== null;
}

/** Ein globaler keydown-Listener für alle Shortcuts — einmal in der AppShell. */
export function useShortcutListener(): void {
  const keymap = useKeymap();
  const byCombo = useMemo(() => invertKeymap(keymap), [keymap]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.isComposing) return;
      const combo = eventToCombo(e);
      const id = combo ? byCombo.get(combo) : undefined;
      if (!id) return;
      if (e.repeat && !REPEATABLE.has(id)) return;
      if (isTypingTarget(e.target)) return;

      const helpOpen = useShortcutStore.getState().isHelpOpen;
      const todosOpen = useTodoStore.getState().isSidebarOpen;
      const overlayOpen = document.querySelector(OVERLAY_SELECTOR) !== null;
      // Über offenen Ebenen nur die Taste, die genau diese Ebene wieder schließt.
      if (helpOpen) {
        if (id !== "showHelp") return;
      } else if (overlayOpen) {
        return;
      } else if (todosOpen && id !== "toggleTodos" && id !== "showHelp") {
        return;
      }

      if (runShortcut(id)) e.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [byCombo]);
}
