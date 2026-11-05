"use client";
import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, ...props }, ref) => (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      ref={ref}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "group shrink-0 h-5 w-5 rounded-md border-2 flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50",
        checked
          ? "border-[var(--muted-foreground)] bg-[var(--muted-foreground)]/20 text-[var(--muted-foreground)]"
          : "border-[var(--muted-foreground)]/60 bg-transparent hover:border-[var(--muted-foreground)] hover:bg-[var(--muted-foreground)]/10",
        className
      )}
      {...props}
    >
      {checked ? (
        <Check className="h-3.5 w-3.5" strokeWidth={3.5} />
      ) : (
        <Check className="h-3.5 w-3.5 text-[var(--muted-foreground)] opacity-0 transition-opacity group-hover:opacity-40" strokeWidth={3.5} />
      )}
    </button>
  )
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
