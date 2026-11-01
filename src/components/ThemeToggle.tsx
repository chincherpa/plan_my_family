"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Mode = "light" | "dark";

function currentMode(): Mode {
  const t = document.documentElement.dataset.theme;
  if (t === "light" || t === "dark") return t;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export default function ThemeToggle() {
  const [mode, setMode] = useState<Mode | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read effective theme after mount
    setMode(currentMode());
  }, []);

  function toggle() {
    const next: Mode = currentMode() === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // storage unavailable — choice lasts for this session only
    }
    setMode(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={mode === "light" ? "Dunkel" : "Hell"}
      aria-label="Farbschema wechseln"
      className="fixed right-5 top-5 z-40 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] shadow-sm transition-colors hover:text-[var(--foreground)]"
    >
      {mode === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
    </button>
  );
}
