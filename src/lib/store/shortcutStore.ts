import { create } from "zustand";
import type { ShortcutActionId } from "@/lib/shortcuts/keymap";

type Handler = () => void;

/**
 * Handler je Aktion als Stapel: Eine Seite (z. B. der Kalender) kann eine
 * globale Aktion überlagern; beim Verlassen der Seite gilt wieder die globale.
 * Bewusst außerhalb des React-States — Registrieren löst kein Rendern aus.
 */
const handlers = new Map<ShortcutActionId, Handler[]>();

export function registerShortcut(id: ShortcutActionId, handler: Handler): () => void {
  handlers.set(id, [...(handlers.get(id) ?? []), handler]);
  return () => {
    const rest = (handlers.get(id) ?? []).filter((h) => h !== handler);
    if (rest.length > 0) handlers.set(id, rest);
    else handlers.delete(id);
  };
}

/** Führt den zuletzt registrierten Handler aus; false wenn es keinen gibt. */
export function runShortcut(id: ShortcutActionId): boolean {
  const stack = handlers.get(id);
  const handler = stack?.[stack.length - 1];
  if (!handler) return false;
  handler();
  return true;
}

interface ShortcutUiState {
  isHelpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
}

export const useShortcutStore = create<ShortcutUiState>((set) => ({
  isHelpOpen: false,
  setHelpOpen: (isHelpOpen) => set({ isHelpOpen }),
}));
