"use client";
import { useRef, useEffect, useMemo, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronLeft, ChevronRight, Plus, Calendar } from "lucide-react";
import { DndContext, DragEndEvent, DragOverlay, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useCalendarStore } from "@/lib/store/calendarStore";
import { useDataStore } from "@/lib/store/dataStore";
import { expandAppointments, type AppointmentOccurrence } from "@/lib/utils/recurrence";
import { checkGuardianWarnings } from "@/lib/utils/guardianCheck";
import { startOfDay, formatDate, SLOTS_PER_DAY, SLOT_HEIGHT, addMinutes } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import AppointmentBlock from "./AppointmentBlock";
import TravelBlock from "./TravelBlock";
import GuardianWarning from "./GuardianWarning";
import AppointmentForm from "@/components/appointments/AppointmentForm";
import { createClient } from "@/lib/supabase/client";
import { useDataStore as useStore } from "@/lib/store/dataStore";

// Number of days shown in week view
const WEEK_DAYS = 7;
// Total slots in the virtual list (days * slots per day)
const DAYS_RANGE = 365; // ±182 days from today

function getDaysArray(centerDate: Date, count: number): Date[] {
  const days: Date[] = [];
  const start = new Date(centerDate);
  start.setDate(start.getDate() - Math.floor(count / 2));
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push(startOfDay(d));
  }
  return days;
}

export default function CalendarView() {
  const { view, focusedDate, goToPrev, goToNext, goToToday, isFormOpen, openForm, closeForm } =
    useCalendarStore();
  const { members, appointments, isLoading, updateAppointment } = useDataStore();

  const scrollRef = useRef<HTMLDivElement>(null);
  const totalSlots = SLOTS_PER_DAY; // Virtual list rows = time slots

  // Days to show based on view
  const visibleDays = useMemo(() => {
    if (view === "week") {
      const monday = new Date(focusedDate);
      const day = monday.getDay();
      monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));
      return getDaysArray(monday, WEEK_DAYS);
    }
    return [startOfDay(focusedDate)];
  }, [focusedDate, view]);

  // Expand appointments for visible days + buffer
  const rangeStart = useMemo(() => {
    const d = new Date(visibleDays[0]);
    d.setDate(d.getDate() - 1);
    return d;
  }, [visibleDays]);

  const rangeEnd = useMemo(() => {
    const last = visibleDays[visibleDays.length - 1];
    const d = new Date(last);
    d.setDate(d.getDate() + 2);
    d.setHours(23, 59, 59);
    return d;
  }, [visibleDays]);

  const occurrences = useMemo(
    () => expandAppointments(appointments, rangeStart, rangeEnd),
    [appointments, rangeStart, rangeEnd]
  );

  const guardianWarnings = useMemo(
    () => checkGuardianWarnings(members, appointments, rangeStart, rangeEnd),
    [members, appointments, rangeStart, rangeEnd]
  );

  // Virtual list for time slots
  const rowVirtualizer = useVirtualizer({
    count: totalSlots,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => SLOT_HEIGHT,
    overscan: 8,
  });

  // Scroll to current time on mount
  useEffect(() => {
    const now = new Date();
    const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();
    const slotIndex = Math.floor(minutesSinceMidnight / 15);
    const offset = Math.max(0, slotIndex * SLOT_HEIGHT - 200);
    scrollRef.current?.scrollTo({ top: offset, behavior: "instant" });
  }, []);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || !active.data.current) return;

    const occ = active.data.current as AppointmentOccurrence;
    const dropData = over.data.current as { slotIndex: number; dayDate: Date; memberId: string };
    if (!dropData) return;

    const originalDuration =
      occ.occurrenceEnd.getTime() - occ.occurrenceStart.getTime();
    const newStart = new Date(dropData.dayDate);
    newStart.setHours(0, dropData.slotIndex * 15, 0, 0);
    const newEnd = new Date(newStart.getTime() + originalDuration);

    const supabase = createClient();
    const { data } = await supabase
      .from("appointments")
      .update({
        start_time: newStart.toISOString(),
        end_time: newEnd.toISOString(),
        owner_id: dropData.memberId === "all" ? occ.appointment.owner_id : dropData.memberId,
      })
      .eq("id", occ.appointment.id)
      .select("*, participants:appointment_participants(*)")
      .single();

    if (data) {
      updateAppointment(occ.appointment.id, data);
    }
  }

  // Columns: "Alle" + one per member
  const columns = useMemo(
    () => [{ id: "all", name: "Alle", color: "#6366f1" }, ...members],
    [members]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--muted-foreground)]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]" />
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Calendar Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--card)] shrink-0">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={goToPrev}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={goToToday}>
              Heute
            </Button>
            <Button variant="ghost" size="icon" onClick={goToNext}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium hidden sm:block">
              {view === "week"
                ? `${formatDate(visibleDays[0])} – ${formatDate(visibleDays[6])}`
                : formatDate(focusedDate)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={view === "week" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => useCalendarStore.getState().setView("week")}
            >
              Woche
            </Button>
            <Button
              variant={view === "day" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => useCalendarStore.getState().setView("day")}
            >
              Tag
            </Button>
            <Button size="sm" className="gap-1" onClick={() => openForm()}>
              <Plus className="w-4 h-4" />
              Termin
            </Button>
          </div>
        </div>

        {/* Grid */}
        <div className="flex flex-1 overflow-hidden">
          {/* Time axis + scrollable content */}
          <div className="flex flex-1 overflow-hidden">
            {/* Column headers */}
            <div className="flex flex-col overflow-hidden flex-1">
              {/* Header row with day dates + member names */}
              <div className="flex border-b border-[var(--border)] shrink-0">
                {/* Time gutter */}
                <div className="w-14 shrink-0" />
                {/* Day columns */}
                {visibleDays.map((day) => (
                  <div
                    key={day.toISOString()}
                    className="flex-1 min-w-0 border-l border-[var(--border)] px-1 py-1 text-center"
                  >
                    <div className="text-xs text-[var(--muted-foreground)]">
                      {day.toLocaleDateString("de-DE", { weekday: "short" })}
                    </div>
                    <div
                      className={`text-sm font-semibold mx-auto w-7 h-7 flex items-center justify-center rounded-full ${
                        startOfDay(new Date()).getTime() === day.getTime()
                          ? "bg-[var(--primary)] text-white"
                          : ""
                      }`}
                    >
                      {day.getDate()}
                    </div>
                  </div>
                ))}
              </div>

              {/* Member name sub-header */}
              <div className="flex border-b border-[var(--border)] bg-[var(--muted)]/30 shrink-0">
                <div className="w-14 shrink-0" />
                {visibleDays.map((day) => (
                  <div key={day.toISOString()} className="flex-1 border-l border-[var(--border)] flex">
                    {columns.map((col) => (
                      <div
                        key={col.id}
                        className="flex-1 px-1 py-0.5 text-center text-xs truncate"
                        style={{ color: col.color }}
                      >
                        {col.name}
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Scrollable time grid */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
                <div
                  style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}
                >
                  {rowVirtualizer.getVirtualItems().map((vRow) => {
                    const slotIdx = vRow.index;
                    const hours = Math.floor((slotIdx * 15) / 60);
                    const mins = (slotIdx * 15) % 60;
                    const showLabel = mins === 0;

                    return (
                      <div
                        key={vRow.key}
                        style={{
                          position: "absolute",
                          top: `${vRow.start}px`,
                          left: 0,
                          right: 0,
                          height: `${SLOT_HEIGHT}px`,
                        }}
                        className="flex"
                      >
                        {/* Time label */}
                        <div className="w-14 shrink-0 flex items-start justify-end pr-2">
                          {showLabel && (
                            <span className="text-[10px] text-[var(--muted-foreground)] -translate-y-1/2">
                              {String(hours).padStart(2, "0")}:00
                            </span>
                          )}
                        </div>

                        {/* Day columns */}
                        {visibleDays.map((day) => (
                          <DaySlotRow
                            key={day.toISOString()}
                            day={day}
                            slotIndex={slotIdx}
                            columns={columns}
                            occurrences={occurrences}
                            guardianWarnings={guardianWarnings.filter(
                              (w) =>
                                new Date(w.startTime) <= addMinutes(day, slotIdx * 15 + 15) &&
                                new Date(w.endTime) > addMinutes(day, slotIdx * 15)
                            )}
                            onSlotClick={(memberId) =>
                              openForm({
                                date: (() => {
                                  const d = new Date(day);
                                  d.setHours(hours, mins, 0, 0);
                                  return d;
                                })(),
                                memberId,
                              })
                            }
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isFormOpen && <AppointmentForm onClose={closeForm} />}
      <DragOverlay />
    </DndContext>
  );
}

// ─── DaySlotRow ─────────────────────────────────────────────────────────────

interface DaySlotRowProps {
  day: Date;
  slotIndex: number;
  columns: Array<{ id: string; name: string; color: string }>;
  occurrences: AppointmentOccurrence[];
  guardianWarnings: import("@/lib/utils/guardianCheck").GuardianWarning[];
  onSlotClick: (memberId: string) => void;
}

function DaySlotRow({ day, slotIndex, columns, occurrences, guardianWarnings, onSlotClick }: DaySlotRowProps) {
  const slotStart = useMemo(() => {
    const d = new Date(day);
    d.setHours(0, slotIndex * 15, 0, 0);
    return d;
  }, [day, slotIndex]);

  const slotEnd = useMemo(() => addMinutes(slotStart, 15), [slotStart]);
  const showHourLine = slotIndex % 4 === 0;

  return (
    <div className={`flex-1 flex border-l border-[var(--border)] ${showHourLine ? "border-t border-[var(--border)]" : ""}`}>
      {columns.map((col) => {
        // Occurrences that START in this slot for this column
        const colOccurrences = occurrences.filter((occ) => {
          if (occ.appointment.is_all_family && col.id !== "all") return false;
          if (!occ.appointment.is_all_family && col.id === "all") return false;
          if (!occ.appointment.is_all_family && col.id !== "all") {
            const isOwner = occ.appointment.owner_id === col.id;
            const isParticipant = occ.appointment.participants.some((p) => p.member_id === col.id);
            if (!isOwner && !isParticipant) return false;
          }
          // Check if this is where the appointment starts (for rendering)
          return (
            occ.occurrenceStart >= slotStart && occ.occurrenceStart < slotEnd
          );
        });

        // Travel blocks starting in this slot
        const travelStartOccurrences = occurrences.filter((occ) => {
          if (occ.appointment.travel_before_min <= 0) return false;
          const isInColumn =
            occ.appointment.is_all_family
              ? col.id === "all"
              : occ.appointment.owner_id === col.id ||
                occ.appointment.participants.some((p) => p.member_id === col.id);
          if (!isInColumn) return false;
          return occ.travelStart >= slotStart && occ.travelStart < slotEnd;
        });

        const travelEndOccurrences = occurrences.filter((occ) => {
          if (occ.appointment.travel_after_min <= 0) return false;
          const isInColumn =
            occ.appointment.is_all_family
              ? col.id === "all"
              : occ.appointment.owner_id === col.id ||
                occ.appointment.participants.some((p) => p.member_id === col.id);
          if (!isInColumn) return false;
          return occ.occurrenceEnd >= slotStart && occ.occurrenceEnd < slotEnd;
        });

        const hasWarning = guardianWarnings.some((w) => w.memberId === col.id);

        return (
          <div
            key={col.id}
            className="flex-1 relative border-l border-[var(--border)]/50 min-w-0"
            style={{ minHeight: SLOT_HEIGHT }}
            onClick={() => onSlotClick(col.id)}
          >
            {hasWarning && (
              <div className="absolute inset-0 bg-red-500/10 border-l-2 border-red-500 pointer-events-none z-10" />
            )}
            {travelStartOccurrences.map((occ) => (
              <TravelBlock
                key={`travel-before-${occ.key}`}
                occurrence={occ}
                type="before"
                columnId={col.id}
                slotStart={slotStart}
              />
            ))}
            {colOccurrences.map((occ) => (
              <AppointmentBlock
                key={occ.key}
                occurrence={occ}
                columnId={col.id}
                memberColor={col.color}
                slotStart={slotStart}
              />
            ))}
            {travelEndOccurrences.map((occ) => (
              <TravelBlock
                key={`travel-after-${occ.key}`}
                occurrence={occ}
                type="after"
                columnId={col.id}
                slotStart={slotStart}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
