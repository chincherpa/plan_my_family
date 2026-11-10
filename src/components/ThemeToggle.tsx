"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useKeymap } from "@/lib/shortcuts/useShortcuts";
import { withShortcutHint } from "@/lib/shortcuts/keymap";

type Mode = "light" | "dark";

const THEME_EVENT = "themechange";

function currentMode(): Mode {
  const t = document.documentElement.dataset.theme;
  if (t === "light" || t === "dark") return t;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Wechselt Hell/Dunkel — auch per Tastatur-Shortcut aufrufbar. */
export function toggleTheme() {
  const next: Mode = currentMode() === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("theme", next);
  } catch {
    // storage unavailable — choice lasts for this session only
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

export default function ThemeToggle() {
  const [mode, setMode] = useState<Mode | null>(null);
  const keymap = useKeymap();

  useEffect(() => {
    const sync = () => setMode(currentMode());
    sync(); // read effective theme after mount
    window.addEventListener(THEME_EVENT, sync);
    return () => window.removeEventListener(THEME_EVENT, sync);
  }, []);

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={withShortcutHint(mode === "light" ? "Dunkel" : "Hell", keymap.toggleTheme)}
      aria-label="Farbschema wechseln"
      className="fixed right-5 top-5 z-40 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] shadow-sm transition-colors hover:text-[var(--foreground)]"
    >
      {mode === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
    </button>
  );
}
