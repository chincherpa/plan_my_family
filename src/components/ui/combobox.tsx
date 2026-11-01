"use client";
import * as React from "react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

export interface ComboboxOption {
  value: string;
  /** Optional group heading, e.g. a category name */
  group?: string;
}

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
}

/**
 * Text input with a filtered, grouped suggestion dropdown. Typing a value
 * that matches nothing is still a valid value — this is catalog *and* free
 * text, not a constrained select.
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  className,
  autoFocus,
  onKeyDown,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const query = value.trim().toLowerCase();
  const filtered = query ? options.filter((o) => o.value.toLowerCase().includes(query)) : options;

  const groups = new Map<string, ComboboxOption[]>();
  for (const opt of filtered) {
    const key = opt.group ?? "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(opt);
  }
  const groupNames = [...groups.keys()].sort((a, b) => a.localeCompare(b, "de"));

  function selectOption(v: string) {
    onChange(v);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className={className}
          autoFocus={autoFocus}
          onKeyDown={onKeyDown}
        />
      </PopoverAnchor>
      {options.length > 0 && (
        <PopoverContent
          onOpenAutoFocus={(e) => e.preventDefault()}
          // The anchor is a plain Input, not a PopoverTrigger, so Radix's
          // DismissableLayer doesn't know it's "inside" the popover — every
          // focus event on it (including the one that just opened this
          // popover) reads as an outside focus and closes it right away.
          onFocusOutside={(e) => {
            if (e.target === inputRef.current) e.preventDefault();
          }}
          className="max-h-64 overflow-y-auto p-1"
          style={{ width: "var(--radix-popper-anchor-width)" }}
        >
          {filtered.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-[var(--muted-foreground)]">
              Kein Treffer — wird als neuer Eintrag übernommen.
            </p>
          )}
          {groupNames.map((groupName) => (
            <div key={groupName || "_"}>
              {groupName && (
                <p className="px-2 pt-1.5 pb-1 text-xs font-medium text-[var(--muted-foreground)]">
                  {groupName}
                </p>
              )}
              {groups
                .get(groupName)!
                .sort((a, b) => a.value.localeCompare(b.value, "de"))
                .map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => selectOption(opt.value)}
                    className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]"
                  >
                    {opt.value}
                  </button>
                ))}
            </div>
          ))}
        </PopoverContent>
      )}
    </Popover>
  );
}
