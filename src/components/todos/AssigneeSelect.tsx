"use client";
import { useDataStore } from "@/lib/store/dataStore";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const UNASSIGNED = "none";

export default function AssigneeSelect({
  value,
  onChange,
  compact = false,
}: {
  value: string | null;
  onChange: (memberId: string | null) => void;
  compact?: boolean;
}) {
  const members = useDataStore((s) => s.members);
  const selected = members.find((m) => m.id === value);

  return (
    <Select
      value={value ?? UNASSIGNED}
      onValueChange={(v) => onChange(v === UNASSIGNED ? null : v)}
    >
      <SelectTrigger
        className={cn(
          compact
            ? "h-6 w-6 shrink-0 justify-center gap-0 border-none bg-transparent px-0 py-0 shadow-none [&>svg]:hidden"
            : "h-8 text-xs"
        )}
        title={selected ? selected.name : "Niemand zugewiesen"}
      >
        {compact ? (
          <span
            className="inline-block h-3.5 w-3.5 rounded-full border border-[var(--border)]"
            style={{ backgroundColor: selected?.color ?? "transparent" }}
          />
        ) : (
          <SelectValue placeholder="Bearbeiter" />
        )}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNASSIGNED}>
          <span className="flex items-center gap-2 text-[var(--muted-foreground)]">
            <span className="inline-block w-3 h-3 rounded-full border border-[var(--border)]" />
            Niemand
          </span>
        </SelectItem>
        {members.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            <span className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: m.color }} />
              {m.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
