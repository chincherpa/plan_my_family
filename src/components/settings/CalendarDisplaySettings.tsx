"use client";
import { Clock } from "lucide-react";
import { useCalendarStore } from "@/lib/store/calendarStore";
import { useDataStore } from "@/lib/store/dataStore";
import { createClient } from "@/lib/supabase/client";

export default function CalendarDisplaySettings() {
  const { startHour, endHour, setTimeRange } = useCalendarStore();
  const { family } = useDataStore();

  async function handleChange(newStart: number, newEnd: number) {
    if (!family) return;
    setTimeRange(newStart, newEnd);
    const supabase = createClient();
    await supabase
      .from("families")
      .update({ calendar_start_hour: newStart, calendar_end_hour: newEnd })
      .eq("id", family.id);
  }

  return (
    <div className="p-4 rounded-lg border border-[var(--border)] bg-[var(--card)] space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
          <Clock className="w-5 h-5 text-[var(--primary)]" />
        </div>
        <div>
          <p className="font-medium">Kalenderansicht</p>
          <p className="text-sm text-[var(--muted-foreground)]">Anzeigezeit des Tageskalenders</p>
        </div>
      </div>
      <div className="flex items-center gap-4 text-sm pl-13">
        <label className="flex items-center gap-2 text-[var(--muted-foreground)]">
          Von
          <select
            className="border border-[var(--border)] rounded px-2 py-1 bg-[var(--card)] text-[var(--foreground)] text-sm"
            value={startHour}
            onChange={(e) => handleChange(Number(e.target.value), endHour)}
          >
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[var(--muted-foreground)]">
          Bis
          <select
            className="border border-[var(--border)] rounded px-2 py-1 bg-[var(--card)] text-[var(--foreground)] text-sm"
            value={endHour}
            onChange={(e) => handleChange(startHour, Number(e.target.value))}
          >
            {Array.from({ length: 24 }, (_, i) => i + 1).map((i) => (
              <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
