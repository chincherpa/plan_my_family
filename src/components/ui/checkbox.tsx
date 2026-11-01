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
        "shrink-0 h-4 w-4 rounded border border-[var(--input)] flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50",
        checked
          ? "bg-[var(--primary)] border-[var(--primary)] text-[var(--primary-foreground)]"
          : "bg-transparent",
        className
      )}
      {...props}
    >
      {checked && <Check className="h-3 w-3" strokeWidth={3} />}
    </button>
  )
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
