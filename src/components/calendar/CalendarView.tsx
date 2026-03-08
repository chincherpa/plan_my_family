"use client";
import { useRef, useEffect, useMemo, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronLeft, ChevronRight, Plus, Settings } from "lucide-react";
import { DndContext, DragEndEvent, DragOverlay, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useCalendarStore } from "@/lib/store/calendarStore";
import { useDataStore } from "@/lib/store/dataStore";
import { expandAppointments, type AppointmentOccurrence } from "@/lib/utils/recurrence";
import { checkGuardianWarnings } from "@/lib/utils/guardianCheck";
import { startOfDay, formatDate, SLOT_HEIGHT, addMinutes } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import AppointmentBlock from "./AppointmentBlock";
import TravelBlock from "./TravelBlock";
import AppointmentForm from "@/components/appointments/AppointmentForm";
import { createClient } from "@/lib/supabase/client";

const WEEK_DAYS = 7;
const DAY_HEADER_HEIGHT = 36;

type VItem =
  | { type: "day-header"; dayIdx: number }
  | { type: "slot"; dayIdx: number; slotIdx: number };

function getMondayWeek(date: Date): Date[] {
  const monday = new Date(date);
  const day = monday.getDay();
  monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: WEEK_DAYS }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export default function CalendarView() {
  const {
    view, focusedDate, goToPrev, goToNext, goToToday,
    isFormOpen, openForm, closeForm,
    startHour, endHour, setTimeRange,
  } = useCalendarStore();
  const { members, appointments, isLoading, updateAppointment } = useDataStore();
  const [showSettings, setShowSettings] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const slotsPerDay = (endHour - startHour) * 4;

  const visibleDays = useMemo(() => {
    if (view === "week") return getMondayWeek(focusedDate);
    return [startOfDay(focusedDate)];
  }, [focusedDate, view]);

  // Build flat virtual list: [day-header, slot×slotsPerDay] × visibleDays
  const items = useMemo<VItem[]>(() => {
    const result: VItem[] = [];
    for (let d = 0; d < visibleDays.length; d++) {
      result.push({ type: "day-header", dayIdx: d });
      for (let s = 0; s < slotsPerDay; s++) {
        result.push({ type: "slot", dayIdx: d, slotIdx: s });
      }
    }
    return result;
  }, [visibleDays.length, slotsPerDay]);

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

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (items[i].type === "day-header" ? DAY_HEADER_HEIGHT : SLOT_HEIGHT),
    overscan: 20,
  });

  // Scroll to current time on mount
  useEffect(() => {
    const now = new Date();
    const todayMs = startOfDay(now).getTime();
    const todayIdx = visibleDays.findIndex((d) => d.getTime() === todayMs);
    if (todayIdx === -1) return;
    const minsSinceStart = (now.getHours() - startHour) * 60 + now.getMinutes();
    const slotIdx = Math.max(0, Math.floor(minsSinceStart / 15));
    // item index: each day has 1 header + slotsPerDay slots
    const itemIdx = todayIdx * (slotsPerDay + 1) + 1 + slotIdx;
    rowVirtualizer.scrollToIndex(Math.min(itemIdx, items.length - 1), { align: "start" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || !active.data.current) return;
    const occ = active.data.current as AppointmentOccurrence;
    const dropData = over.data.current as { slotIndex: number; dayDate: Date; memberId: string };
    if (!dropData) return;
    const originalDuration = occ.occurrenceEnd.getTime() - occ.occurrenceStart.getTime();
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
    if (data) updateAppointment(occ.appointment.id, data);
  }

  const columns = useMemo(
    () => [...members, { id: "all", name: "Alle", color: "#6366f1" }],
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

        {/* Navigation header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--card)] shrink-0">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={goToPrev}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={goToToday}>Heute</Button>
            <Button variant="ghost" size="icon" onClick={goToNext}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <span className="text-sm font-medium hidden sm:block">
            {view === "week"
              ? `${formatDate(visibleDays[0])} – ${formatDate(visibleDays[6])}`
              : formatDate(focusedDate)}
          </span>

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
            <Button
              variant={showSettings ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setShowSettings((s) => !s)}
            >
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div className="flex items-center gap-4 px-4 py-2 border-b border-[var(--border)] bg-[var(--muted)]/30 shrink-0 text-sm">
            <span className="font-medium text-[var(--foreground)]">Anzeigezeit:</span>
            <label className="flex items-center gap-1 text-[var(--muted-foreground)]">
              Von
              <select
                className="ml-1 border border-[var(--border)] rounded px-1 py-0.5 bg-[var(--card)] text-[var(--foreground)] text-xs"
                value={startHour}
                onChange={(e) => setTimeRange(Number(e.target.value), endHour)}
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1 text-[var(--muted-foreground)]">
              Bis
              <select
                className="ml-1 border border-[var(--border)] rounded px-1 py-0.5 bg-[var(--card)] text-[var(--foreground)] text-xs"
                value={endHour}
                onChange={(e) => setTimeRange(startHour, Number(e.target.value))}
              >
                {Array.from({ length: 24 }, (_, i) => i + 1).map((i) => (
                  <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>
                ))}
              </select>
            </label>
          </div>
        )}

        {/* Sticky member column header */}
        <div className="flex border-b border-[var(--border)] bg-[var(--card)] shrink-0">
          <div className="w-14 shrink-0" />
          {columns.map((col) => (
            <div
              key={col.id}
              className="flex-1 min-w-0 border-l border-[var(--border)]/50 px-1 py-1 text-center text-xs truncate font-medium"
              style={{ color: col.color }}
            >
              {col.name}
            </div>
          ))}
        </div>

        {/* Scrollable vertical day list */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
            {rowVirtualizer.getVirtualItems().map((vItem) => {
              const item = items[vItem.index];

              // Day header row
              if (item.type === "day-header") {
                const day = visibleDays[item.dayIdx];
                const isToday = startOfDay(new Date()).getTime() === day.getTime();
                return (
                  <div
                    key={vItem.key}
                    style={{
                      position: "absolute",
                      top: `${vItem.start}px`,
                      left: 0,
                      right: 0,
                      height: `${DAY_HEADER_HEIGHT}px`,
                    }}
                    className="flex items-center gap-2 px-3 bg-[var(--muted)]/40 border-b border-t border-[var(--border)]"
                  >
                    <div
                      className={`text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full shrink-0 ${
                        isToday ? "bg-[var(--primary)] text-white" : "text-[var(--foreground)]"
                      }`}
                    >
                      {day.getDate()}
                    </div>
                    <span className="text-sm font-medium text-[var(--foreground)]">
                      {day.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}
                    </span>
                  </div>
                );
              }

              // Time slot row
              const { dayIdx, slotIdx } = item;
              const day = visibleDays[dayIdx];
              const absoluteSlotMinutes = (startHour * 60) + slotIdx * 15;
              const hours = Math.floor(absoluteSlotMinutes / 60);
              const mins = absoluteSlotMinutes % 60;
              const showLabel = mins === 0;
              const showHourLine = slotIdx % 4 === 0;

              const slotStart = new Date(day);
              slotStart.setHours(hours, mins, 0, 0);
              const slotEnd = addMinutes(slotStart, 15);

              const relevantWarnings = guardianWarnings.filter(
                (w) => new Date(w.startTime) <= slotEnd && new Date(w.endTime) > slotStart
              );

              return (
                <div
                  key={vItem.key}
                  style={{
                    position: "absolute",
                    top: `${vItem.start}px`,
                    left: 0,
                    right: 0,
                    height: `${SLOT_HEIGHT}px`,
                  }}
                  className={`flex ${showHourLine ? "border-t border-[var(--border)]" : ""}`}
                >
                  {/* Time label */}
                  <div className="w-14 shrink-0 flex items-start justify-end pr-2">
                    {showLabel && (
                      <span className="text-[10px] text-[var(--muted-foreground)] -translate-y-1/2 leading-none">
                        {String(hours).padStart(2, "0")}:00
                      </span>
                    )}
                  </div>

                  {/* Member columns */}
                  {columns.map((col) => {
                    const colOccurrences = occurrences.filter((occ) => {
                      if (occ.appointment.is_all_family && col.id !== "all") return false;
                      if (!occ.appointment.is_all_family && col.id === "all") return false;
                      if (!occ.appointment.is_all_family) {
                        const isOwner = occ.appointment.owner_id === col.id;
                        const isParticipant = occ.appointment.participants.some((p) => p.member_id === col.id);
                        if (!isOwner && !isParticipant) return false;
                      }
                      return (
                        occ.occurrenceStart >= slotStart &&
                        occ.occurrenceStart < slotEnd &&
                        occ.occurrenceStart.toDateString() === day.toDateString()
                      );
                    });

                    const travelStartOccurrences = occurrences.filter((occ) => {
                      if (occ.appointment.travel_before_min <= 0) return false;
                      const inCol = occ.appointment.is_all_family
                        ? col.id === "all"
                        : occ.appointment.owner_id === col.id ||
                          occ.appointment.participants.some((p) => p.member_id === col.id);
                      if (!inCol) return false;
                      return (
                        occ.travelStart >= slotStart &&
                        occ.travelStart < slotEnd &&
                        occ.travelStart.toDateString() === day.toDateString()
                      );
                    });

                    const travelEndOccurrences = occurrences.filter((occ) => {
                      if (occ.appointment.travel_after_min <= 0) return false;
                      const inCol = occ.appointment.is_all_family
                        ? col.id === "all"
                        : occ.appointment.owner_id === col.id ||
                          occ.appointment.participants.some((p) => p.member_id === col.id);
                      if (!inCol) return false;
                      return (
                        occ.occurrenceEnd >= slotStart &&
                        occ.occurrenceEnd < slotEnd &&
                        occ.occurrenceEnd.toDateString() === day.toDateString()
                      );
                    });

                    const hasWarning = relevantWarnings.some((w) => w.memberId === col.id);

                    return (
                      <div
                        key={col.id}
                        className="flex-1 relative border-l border-[var(--border)]/50 min-w-0"
                        style={{ minHeight: SLOT_HEIGHT }}
                        onClick={() => openForm({ date: slotStart, memberId: col.id })}
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
            })}
          </div>
        </div>
      </div>

      {isFormOpen && <AppointmentForm onClose={closeForm} />}
      <DragOverlay />
    </DndContext>
  );
}
