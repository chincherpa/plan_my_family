import { comboParts } from "@/lib/shortcuts/keymap";
import { cn } from "@/lib/utils";

/** Tastenkombination als Tastenkappen, z. B. "Shift+D" → [⇧] [D]. */
export default function Kbd({ combo, className }: { combo: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {comboParts(combo).map((part, i) => (
        <kbd
          key={i}
          className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-[var(--border)] border-b-2 bg-[var(--background)] px-1.5 font-mono text-xs font-medium text-[var(--foreground)]"
        >
          {part}
        </kbd>
      ))}
    </span>
  );
}
