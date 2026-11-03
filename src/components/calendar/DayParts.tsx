"use client";
import { AlertTriangle, ChevronRight, Plus, UtensilsCrossed } from "lucide-react";
import { useDataStore } from "@/lib/store/dataStore";
import { formatTime, hexToRgba, readableTextColor } from "@/lib/utils";
import type { AppointmentOccurrence } from "@/lib/utils/recurrence";
import type { Meal } from "@/lib/supabase/types";
import { TIME_GUTTER } from "./DayTimeline";
import { ALL_COLUMN_COLOR, EVENT_COLOR, placementsFor, type Column, type DayData } from "./model";

function useOccurrenceColor() {
  const members = useDataStore((s) => s.members);
  return (occ: AppointmentOccurrence) => {
    const appt = occ.appointment;
    if (appt.is_event) return EVENT_COLOR;
    if (appt.is_all_family) return ALL_COLUMN_COLOR;
    return members.find((m) => m.id === appt.owner_id)?.color ?? ALL_COLUMN_COLOR;
  };
}

/** All-day appointments and Ereignisse (birthdays, holidays) for one day. */
export function DayBanner({
  data,
  onOpen,
  onAddEvent,
  compact = false,
}: {
  data: DayData;
  onOpen: (occ: AppointmentOccurrence) => void;
  onAddEvent?: () => void;
  compact?: boolean;
}) {
  const colorOf = useOccurrenceColor();
  if (data.banner.length === 0 && !onAddEvent) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {data.banner.map((occ) => {
        const color = colorOf(occ);
        const appt = occ.appointment;
        return (
          <button
            key={occ.key}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(occ);
            }}
            className={`flex items-center gap-1 rounded-full font-medium ${
              compact ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs"
            }`}
            style={{ backgroundColor: hexToRgba(color, 0.2), color, boxShadow: `inset 0 0 0 1px ${hexToRgba(color, 0.4)}` }}
          >
            {appt.is_event && <span>{eventEmoji(appt.title)}</span>}
            {!appt.is_all_day && <span className="tabular opacity-80">{formatTime(occ.occurrenceStart)}</span>}
            <span className="truncate max-w-[14rem]">{appt.title}</span>
          </button>
        );
      })}
      {onAddEvent && (
        <button
          type="button"
          onClick={onAddEvent}
          className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
        >
          <Plus className="w-3.5 h-3.5" />
          Ereignis
        </button>
      )}
    </div>
  );
}

function eventEmoji(title: string): string {
  return /geburtstag|bday|birthday/i.test(title) ? "🎂" : "🎉";
}

/** Lunch + dinner for a day; tapping opens the meal editor. */
export function MealsStrip({
  meal,
  onEdit,
  compact = false,
}: {
  meal: Meal | undefined;
  onEdit: () => void;
  compact?: boolean;
}) {
  const hasAny = !!(meal?.lunch || meal?.dinner);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onEdit();
      }}
      className={`flex min-w-0 items-center gap-2 rounded-lg text-left transition-colors hover:bg-[var(--accent)] ${
        compact ? "px-1.5 py-0.5 text-xs" : "w-full bg-[var(--card)] px-3 py-2.5 text-sm"
      }`}
    >
      <UtensilsCrossed className={`${compact ? "w-3 h-3" : "w-4 h-4"} shrink-0 text-[var(--muted-foreground)]`} />
      {hasAny ? (
        <span className="flex min-w-0 flex-wrap gap-x-4 gap-y-0.5">
          {meal?.lunch && (
            <span className="truncate">
              <span className="text-[var(--muted-foreground)]">Mittag</span>{" "}
              <span className="font-medium">{meal.lunch}</span>
            </span>
          )}
          {meal?.dinner && (
            <span className="truncate">
              <span className="text-[var(--muted-foreground)]">Abend</span>{" "}
              <span className="font-medium">{meal.dinner}</span>
            </span>
          )}
        </span>
      ) : (
        <span className="text-[var(--muted-foreground)]/70">{compact ? "Essen …" : "Essensplan hinzufügen …"}</span>
      )}
    </button>
  );
}

/** One coming day: header line plus compact chips in the member columns. */
export function UpcomingDay({
  data,
  columns,
  meal,
  conflictKeys,
  expanded,
  timeline,
  onToggle,
  onOpen,
  onCellClick,
  onEditMeal,
}: {
  data: DayData;
  columns: Column[];
  meal: Meal | undefined;
  conflictKeys: Set<string>;
  expanded: boolean;
  /** Full timeline, rendered instead of the compact cells while expanded */
  timeline: React.ReactNode;
  onToggle: () => void;
  onOpen: (occ: AppointmentOccurrence) => void;
  onCellClick: (columnId: string) => void;
  onEditMeal: () => void;
}) {
  const colorOf = useOccurrenceColor();
  const { day } = data;
  const isWeekend = day.getDay() === 0 || day.getDay() === 6;

  const cells = new Map<string, { occ: AppointmentOccurrence; isOwner: boolean }[]>();
  for (const occ of data.timed) {
    for (const p of placementsFor(occ, columns)) {
      const list = cells.get(p.columnId) ?? [];
      list.push({ occ, isOwner: p.isOwner });
      cells.set(p.columnId, list);
    }
  }

  return (
    <section
      className={`border-t py-2.5 transition-colors ${
        expanded
          ? "my-2 rounded-2xl border border-[var(--primary)]/60 bg-[var(--primary)]/[0.04] px-1"
          : "border-[var(--border)]"
      }`}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className="mb-2 flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl px-2 py-1 hover:bg-[var(--accent)]"
      >
        <ChevronRight
          className={`w-4 h-4 shrink-0 text-[var(--muted-foreground)] transition-transform ${expanded ? "rotate-90" : ""}`}
        />
        <span className="flex items-baseline gap-2">
          <span className={`text-sm font-semibold ${isWeekend ? "text-[var(--primary)]" : ""}`}>
            {day.toLocaleDateString("de-DE", { weekday: "short" })}
          </span>
          <span className="text-xl font-bold tabular">{day.getDate()}.</span>
          <span className="text-xs text-[var(--muted-foreground)]">
            {day.toLocaleDateString("de-DE", { month: "short" })}
          </span>
        </span>
        <DayBanner data={data} onOpen={onOpen} compact />
        <div className="ml-auto min-w-0">
          <MealsStrip meal={meal} onEdit={onEditMeal} compact />
        </div>
      </div>

      {expanded ? (
        <div className="pt-2">{timeline}</div>
      ) : (
      <div className="flex">
        <div className={`${TIME_GUTTER} shrink-0`} />
        <div className="flex flex-1 gap-1 min-w-0">
          {columns.map((col) => {
            const items = cells.get(col.id) ?? [];
            const warnings = data.warnings.filter((w) => w.memberId === col.id);
            return (
              <div
                key={col.id}
                onClick={() => onCellClick(col.id)}
                className="flex min-h-9 flex-1 min-w-0 cursor-pointer flex-col gap-1 rounded-lg bg-[var(--lane)]/60 p-0.5 hover:bg-[var(--lane-alt)]"
              >
                {warnings.map((w) => (
                  <div
                    key={`gw-${w.startTime.getTime()}`}
                    className="flex items-center gap-1 rounded-md bg-[var(--destructive)]/15 px-1 py-0.5 text-[10px] font-semibold text-[var(--destructive)]"
                    title={`${w.memberName} ohne Aufsicht`}
                  >
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    <span className="truncate tabular">
                      {formatTime(w.startTime)}–{formatTime(w.endTime)}
                    </span>
                  </div>
                ))}
                {items.map(({ occ, isOwner }) => {
                  const color = colorOf(occ);
                  const conflict = conflictKeys.has(occ.key);
                  return (
                    <button
                      key={`${occ.key}-${col.id}`}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(occ);
                      }}
                      className={`flex flex-col rounded-md px-1.5 py-0.5 text-left text-[11px] leading-tight ${
                        conflict ? "ring-2 ring-[var(--warning)]" : ""
                      }`}
                      style={
                        isOwner
                          ? { backgroundColor: color, color: readableTextColor(color) }
                          : { backgroundColor: hexToRgba(color, 0.14), border: `1.5px dashed ${color}` }
                      }
                    >
                      <span className="tabular opacity-80">{formatTime(occ.occurrenceStart)}</span>
                      <span className="truncate font-semibold">{occ.appointment.title}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      )}
    </section>
  );
}
