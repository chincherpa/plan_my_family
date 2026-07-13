"use client";
import { useRef, useEffect, useMemo, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertTriangle, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Plus, UtensilsCrossed } from "lucide-react";
import { DndContext, DragEndEvent, DragOverlay, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useCalendarStore } from "@/lib/store/calendarStore";
import { useDataStore } from "@/lib/store/dataStore";
import { expandAppointments, type AppointmentOccurrence } from "@/lib/utils/recurrence";
import { checkGuardianWarnings } from "@/lib/utils/guardianCheck";
<<<<<<< HEAD
import { startOfDay, SLOT_HEIGHT, addMinutes, hexToRgba, getISOWeek } from "@/lib/utils";
=======
import { findVehicleConflicts } from "@/lib/utils/conflicts";
import { startOfDay, SLOT_HEIGHT, addMinutes, hexToRgba, localDateStr, formatDate, formatTime } from "@/lib/utils";
>>>>>>> 485593881e3feccb28c04fb2507d4aedbb639398
import { Button } from "@/components/ui/button";
import AppointmentBlock from "./AppointmentBlock";
import TravelBlock from "./TravelBlock";
import { DroppableSlotCell } from "./DroppableSlotCell";
import MealEditDialog from "./MealEditDialog";
import AppointmentForm from "@/components/appointments/AppointmentForm";
import MealRow from "./MealRow";
import { createClient } from "@/lib/supabase/client";

const DAYS_BEFORE = 100;
const DAYS_AFTER = 100;
const DAY_HEADER_HEIGHT = 36;
const ALL_DAY_ROW_HEIGHT = 22;
<<<<<<< HEAD
const MEAL_ROW_HEIGHT = 24;
=======
const MEALS_ROW_HEIGHT = 24;
const CONFLICT_WINDOW_DAYS = 14;
>>>>>>> 485593881e3feccb28c04fb2507d4aedbb639398

type VItem =
  | { type: "day-header"; dayIdx: number; allDayCount: number }
  | { type: "slot"; dayIdx: number; slotIdx: number };

export default function CalendarView() {
  const {
    isFormOpen, openForm, closeForm,
    startHour, endHour,
  } = useCalendarStore();
  const { members, vehicles, appointments, meals, isLoading, updateAppointment } = useDataStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [headerDate, setHeaderDate] = useState(() => startOfDay(new Date()));
  const [selectedSlot, setSelectedSlot] = useState<{ dayIdx: number; slotIdx: number; colId: string } | null>(null);
  const [activeOccurrence, setActiveOccurrence] = useState<AppointmentOccurrence | null>(null);
  const [mealEditDate, setMealEditDate] = useState<string | null>(null);
  const [conflictsOpen, setConflictsOpen] = useState(false);

  const slotsPerDay = (endHour - startHour) * 2;
  const heightPerDay = DAY_HEADER_HEIGHT + MEAL_ROW_HEIGHT + slotsPerDay * SLOT_HEIGHT;

  // All days: DAYS_BEFORE before today + DAYS_AFTER after
  const allDays = useMemo(() => {
    const today = startOfDay(new Date());
    return Array.from({ length: DAYS_BEFORE + DAYS_AFTER }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - DAYS_BEFORE + i);
      return d;
    });
  }, []);

  const rangeStart = allDays[0];
  const rangeEnd = useMemo(() => {
    const d = new Date(allDays[allDays.length - 1]);
    d.setHours(23, 59, 59);
    return d;
  }, [allDays]);

  const occurrences = useMemo(
    () => expandAppointments(appointments, rangeStart, rangeEnd),
    [appointments, rangeStart, rangeEnd]
  );

  const timedOccurrences = useMemo(
    () => occurrences.filter((occ) => !occ.appointment.is_all_day),
    [occurrences]
  );

  const allDayByDay = useMemo(() => {
    const map = new Map<string, AppointmentOccurrence[]>();
    for (const occ of occurrences) {
      if (!occ.appointment.is_all_day) continue;
      const cur = new Date(startOfDay(occ.occurrenceStart));
      const last = startOfDay(occ.occurrenceEnd);
      while (cur <= last) {
        const key = cur.toDateString();
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(occ);
        cur.setDate(cur.getDate() + 1);
      }
    }
    return map;
  }, [occurrences]);

  const items = useMemo<VItem[]>(() => {
    const result: VItem[] = [];
    for (let d = 0; d < allDays.length; d++) {
      const allDayCount = allDayByDay.get(allDays[d].toDateString())?.length ?? 0;
      result.push({ type: "day-header", dayIdx: d, allDayCount });
      for (let s = 0; s < slotsPerDay; s++) {
        result.push({ type: "slot", dayIdx: d, slotIdx: s });
      }
    }
    return result;
  }, [allDays, slotsPerDay, allDayByDay]);

  const guardianWarnings = useMemo(
    () => checkGuardianWarnings(members, occurrences, rangeStart, rangeEnd),
    [members, occurrences, rangeStart, rangeEnd]
  );

  const mealsByDate = useMemo(() => {
    const map = new Map(meals.map((m) => [m.date, m]));
    return map;
  }, [meals]);

  // Conflicts in the next 14 days for the summary banner
  const upcomingConflicts = useMemo(() => {
    const windowStart = startOfDay(new Date());
    const windowEnd = new Date(windowStart);
    windowEnd.setDate(windowEnd.getDate() + CONFLICT_WINDOW_DAYS);
    const guardian = guardianWarnings.filter(
      (w) => w.startTime < windowEnd && w.endTime > windowStart
    );
    const vehicle = findVehicleConflicts(timedOccurrences, windowStart, windowEnd);
    return { guardian, vehicle, total: guardian.length + vehicle.length };
  }, [guardianWarnings, timedOccurrences]);

  // Group timed occurrences by day so slot rows don't scan the full
  // 2-year occurrence list. Keyed by start, travel-start and end day.
  const timedByDay = useMemo(() => {
    const map = new Map<string, AppointmentOccurrence[]>();
    for (const occ of timedOccurrences) {
      const keys = new Set([
        occ.occurrenceStart.toDateString(),
        occ.travelStart.toDateString(),
        occ.occurrenceEnd.toDateString(),
      ]);
      for (const key of keys) {
        const list = map.get(key);
        if (list) list.push(occ);
        else map.set(key, [occ]);
      }
    }
    return map;
  }, [timedOccurrences]);

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => {
      const item = items[i];
      if (item.type === "day-header") {
<<<<<<< HEAD
        return DAY_HEADER_HEIGHT + MEAL_ROW_HEIGHT + item.allDayCount * ALL_DAY_ROW_HEIGHT;
=======
        return DAY_HEADER_HEIGHT + MEALS_ROW_HEIGHT + item.allDayCount * ALL_DAY_ROW_HEIGHT;
>>>>>>> 485593881e3feccb28c04fb2507d4aedbb639398
      }
      return SLOT_HEIGHT;
    },
    overscan: 20,
    initialOffset: DAYS_BEFORE * heightPerDay,
  });

<<<<<<< HEAD
=======
  // Scroll to today's current time on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { scrollToToday(); }, []);

  // Day index at a scroll offset — via virtualizer, since day heights vary
  // with the number of all-day rows (fixed heightPerDay math drifts)
  function dayIdxAtOffset(offset: number): number {
    const vi = rowVirtualizer.getVirtualItemForOffset(offset);
    const item = vi ? items[vi.index] : undefined;
    if (item) return item.dayIdx;
    return Math.max(0, Math.min(Math.floor(offset / heightPerDay), allDays.length - 1));
  }
  const dayIdxAtOffsetRef = useRef(dayIdxAtOffset);
  dayIdxAtOffsetRef.current = dayIdxAtOffset;

>>>>>>> 485593881e3feccb28c04fb2507d4aedbb639398
  // Update header date as user scrolls
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function onScroll() {
      setHeaderDate(allDays[dayIdxAtOffsetRef.current(el!.scrollTop)]);
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [allDays]);

  function scrollByDays(delta: number) {
    const el = scrollRef.current;
    if (!el) return;
    const currentDayIdx = dayIdxAtOffset(el.scrollTop);
    const targetDayIdx = Math.max(0, Math.min(currentDayIdx + delta, allDays.length - 1));
    rowVirtualizer.scrollToIndex(targetDayIdx * (slotsPerDay + 1), { align: "start" });
  }

  function scrollToToday() {
    rowVirtualizer.scrollToIndex(DAYS_BEFORE * (slotsPerDay + 1), { align: "start" });
  }

  function scrollToDate(dateStr: string) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const target = new Date(y, m - 1, d, 0, 0, 0, 0);
    const dayIdx = allDays.findIndex((day) => day.getTime() === target.getTime());
    if (dayIdx === -1) return;
    rowVirtualizer.scrollToIndex(dayIdx * (slotsPerDay + 1), { align: "start" });
  }

  const headerLabel = useMemo(() => {
    const weekday = headerDate.toLocaleDateString("de-DE", { weekday: "long" });
    const date = headerDate.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
    return { weekday, date };
  }, [headerDate]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  async function handleDragEnd(event: DragEndEvent) {
    setActiveOccurrence(null);
    const { active, over } = event;
    if (!over || !active.data.current) return;
    const occ = active.data.current as AppointmentOccurrence;
    const dropData = over.data.current as { slotStart: Date; memberId: string };
    if (!dropData?.slotStart) return;
    const originalDuration = occ.occurrenceEnd.getTime() - occ.occurrenceStart.getTime();
    const newStart = dropData.slotStart;
    const newEnd = new Date(newStart.getTime() + originalDuration);
    // No-op if time and target column didn't change
    const newOwnerId = dropData.memberId === "all" || dropData.memberId === "events"
      ? occ.appointment.owner_id
      : dropData.memberId;
    if (
      newStart.getTime() === occ.occurrenceStart.getTime() &&
      newOwnerId === occ.appointment.owner_id
    ) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("appointments")
      .update({
        start_time: newStart.toISOString(),
        end_time: newEnd.toISOString(),
        owner_id: newOwnerId,
      })
      .eq("id", occ.appointment.id)
      .select("*, participants:appointment_participants(*)")
      .single();
    if (data) updateAppointment(occ.appointment.id, data);
  }

  const columns = useMemo(
    () => [
      ...members,
      { id: "all", name: "Alle", color: "#6366f1" },
      { id: "events", name: "Ereignisse", color: "#8b5cf6" },
    ],
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
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setActiveOccurrence(e.active.data.current as AppointmentOccurrence)}
      onDragCancel={() => setActiveOccurrence(null)}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col h-full overflow-hidden">

        {/* Navigation header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--muted)] shrink-0">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => scrollByDays(-1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={scrollToToday}>Heute</Button>
            <Button variant="ghost" size="icon" onClick={() => scrollByDays(1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex items-center gap-2">
              <div className="text-center leading-tight">
                <div className="text-xs text-[var(--muted-foreground)] font-medium">{headerLabel.weekday}</div>
                <div className="text-sm font-semibold text-[var(--foreground)]">{headerLabel.date}</div>
              </div>
              <Button variant="ghost" size="icon" asChild>
                <label htmlFor="date-jump" className="cursor-pointer">
                  <CalendarDays className="w-4 h-4" />
                </label>
              </Button>
              <input
                id="date-jump"
                type="date"
                className="absolute inset-0 opacity-0 cursor-pointer w-full"
                onChange={(e) => e.target.value && scrollToDate(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" className="gap-1" onClick={() => openForm()}>
              <Plus className="w-4 h-4" />
              Termin
            </Button>
          </div>
        </div>

        {/* Conflict summary banner */}
        {upcomingConflicts.total > 0 && (
          <div className="shrink-0 border-b border-amber-300/60 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
            <button
              type="button"
              onClick={() => setConflictsOpen((o) => !o)}
              className="flex w-full items-center gap-2 px-4 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-300"
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>
                {[
                  upcomingConflicts.guardian.length > 0 &&
                    `${upcomingConflicts.guardian.length} Aufsichtslücke${upcomingConflicts.guardian.length === 1 ? "" : "n"}`,
                  upcomingConflicts.vehicle.length > 0 &&
                    `${upcomingConflicts.vehicle.length} Fahrzeugkonflikt${upcomingConflicts.vehicle.length === 1 ? "" : "e"}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}{" "}
                in den nächsten {CONFLICT_WINDOW_DAYS} Tagen
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 ml-auto transition-transform ${conflictsOpen ? "rotate-180" : ""}`}
              />
            </button>
            {conflictsOpen && (
              <div className="px-4 pb-2 space-y-0.5 max-h-40 overflow-y-auto">
                {upcomingConflicts.guardian.map((w) => (
                  <button
                    key={`gw-${w.memberId}-${w.startTime.getTime()}`}
                    type="button"
                    onClick={() => scrollToDate(localDateStr(w.startTime))}
                    className="block w-full text-left text-xs text-amber-900 dark:text-amber-200 hover:underline"
                  >
                    {formatDate(w.startTime)} {formatTime(w.startTime)}–{formatTime(w.endTime)} · {w.memberName} ohne Aufsicht
                  </button>
                ))}
                {upcomingConflicts.vehicle.map((c) => {
                  const vehicle = vehicles.find((v) => v.id === c.vehicleId);
                  return (
                    <button
                      key={`vc-${c.a.key}-${c.b.key}`}
                      type="button"
                      onClick={() => scrollToDate(localDateStr(c.start))}
                      className="block w-full text-left text-xs text-amber-900 dark:text-amber-200 hover:underline"
                    >
                      {formatDate(c.start)} · {vehicle ? `${vehicle.icon_emoji} ${vehicle.name}` : "Fahrzeug"} doppelt gebucht: „{c.a.appointment.title}“ / „{c.b.appointment.title}“
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Sticky member column header */}
        <div className="flex border-b border-[var(--border)] bg-[var(--muted)] shrink-0">
          <div className="w-14 shrink-0" />
          {columns.map((col) => (
            <div
              key={col.id}
              className={`flex-1 min-w-0 px-1 py-1 text-center text-xs truncate font-medium ${
                col.id === "all" || col.id === "events"
                  ? "border-l-2 border-[var(--border)]"
                  : "border-l border-[var(--border)]/50"
              }`}
              style={{ backgroundColor: col.color, color: "#ffffff" }}
            >
              {col.name}
            </div>
          ))}
        </div>

        {/* Scrollable vertical day list */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
          {/* Sticky day header — overlays virtualizer content, z-index on top */}
          <div
            style={{ position: "sticky", top: 0, zIndex: 20, height: DAY_HEADER_HEIGHT }}
            className="flex items-center gap-2 px-3 bg-[var(--background)] border-b border-t border-[var(--border)]"
          >
            <div
              className={`text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full shrink-0 ${
                startOfDay(new Date()).getTime() === headerDate.getTime()
                  ? "bg-[var(--primary)] text-white"
                  : "text-[var(--foreground)]"
              }`}
            >
              {headerDate.getDate()}
            </div>
            <span className="text-sm font-medium text-[var(--foreground)]">
              {headerDate.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              <span className="ml-2 text-xs text-[var(--muted-foreground)]">KW {getISOWeek(headerDate)}</span>
            </span>
          </div>
          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative", marginTop: `-${DAY_HEADER_HEIGHT}px` }}>
            {rowVirtualizer.getVirtualItems().map((vItem) => {
              const item = items[vItem.index];

              // Day header row
              if (item.type === "day-header") {
                const day = allDays[item.dayIdx];
                const isToday = startOfDay(new Date()).getTime() === day.getTime();
                const dayAllDayOccs = allDayByDay.get(day.toDateString()) ?? [];
<<<<<<< HEAD
                const headerHeight = DAY_HEADER_HEIGHT + MEAL_ROW_HEIGHT + dayAllDayOccs.length * ALL_DAY_ROW_HEIGHT;
=======
                const headerHeight =
                  DAY_HEADER_HEIGHT + MEALS_ROW_HEIGHT + dayAllDayOccs.length * ALL_DAY_ROW_HEIGHT;
                const dayKey = localDateStr(day);
                const meal = mealsByDate.get(dayKey);
>>>>>>> 485593881e3feccb28c04fb2507d4aedbb639398
                return (
                  <div
                    key={vItem.key}
                    style={{
                      position: "absolute",
                      top: `${vItem.start}px`,
                      left: 0,
                      right: 0,
                      height: `${headerHeight}px`,
                    }}
                    className="flex flex-col bg-[var(--muted)]/40 border-b border-t border-[var(--border)]"
                  >
                    <div className="flex items-center gap-2 px-3" style={{ height: DAY_HEADER_HEIGHT }}>
                      <div
                        className={`text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full shrink-0 ${
                          isToday ? "bg-[var(--primary)] text-white" : "text-[var(--foreground)]"
                        }`}
                      >
                        {day.getDate()}
                      </div>
                      <span className="text-sm font-medium text-[var(--foreground)]">
                        {day.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                        <span className="ml-2 text-xs text-[var(--muted-foreground)]">KW {getISOWeek(day)}</span>
                      </span>
                    </div>
                    <MealRow day={day} />
                    {dayAllDayOccs.map((occ) => {
                      const ownerMember = members.find((m) => m.id === occ.appointment.owner_id);
                      const color = ownerMember?.color ?? "#6366f1";
                      return (
                        <div
                          key={occ.key}
                          onClick={() => openForm({ appointmentId: occ.appointment.id, occurrenceStart: occ.occurrenceStart })}
                          className="mx-14 px-2 rounded text-xs font-medium cursor-pointer truncate flex items-center gap-1"
                          style={{
                            height: ALL_DAY_ROW_HEIGHT,
                            marginBottom: 2,
                            backgroundColor: `${color}22`,
                            color,
                            borderLeft: `3px solid ${color}`,
                          }}
                        >
                          {occ.appointment.is_event && <span>🎉</span>}
                          {occ.appointment.title}
                        </div>
                      );
                    })}
                    {/* Meals row */}
                    <button
                      type="button"
                      onClick={() => setMealEditDate(dayKey)}
                      className="mx-14 px-2 rounded text-xs cursor-pointer truncate flex items-center gap-3 text-left hover:bg-[var(--muted)] transition-colors"
                      style={{ height: MEALS_ROW_HEIGHT - 2, marginBottom: 2 }}
                    >
                      <UtensilsCrossed className="w-3 h-3 shrink-0 text-[var(--muted-foreground)]" />
                      {meal?.lunch || meal?.dinner ? (
                        <>
                          {meal.lunch && (
                            <span className="truncate">
                              <span className="text-[var(--muted-foreground)]">Mittag:</span>{" "}
                              <span className="font-medium text-[var(--foreground)]">{meal.lunch}</span>
                            </span>
                          )}
                          {meal.dinner && (
                            <span className="truncate">
                              <span className="text-[var(--muted-foreground)]">Abend:</span>{" "}
                              <span className="font-medium text-[var(--foreground)]">{meal.dinner}</span>
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-[var(--muted-foreground)]/60">Essensplan hinzufügen …</span>
                      )}
                    </button>
                  </div>
                );
              }

              // Time slot row
              const { dayIdx, slotIdx } = item;
              const day = allDays[dayIdx];
              const absoluteSlotMinutes = (startHour * 60) + slotIdx * 30;
              const hours = Math.floor(absoluteSlotMinutes / 60);
              const mins = absoluteSlotMinutes % 60;
              const isHalfHour = mins === 30;
              const showHourLine = slotIdx % 2 === 0;

              const slotStart = new Date(day);
              slotStart.setHours(hours, mins, 0, 0);
              const slotEnd = addMinutes(slotStart, 30);
              const dayOccurrences = timedByDay.get(day.toDateString()) ?? [];
              // Last rendered minute of this day — blocks are clipped here
              const dayVisibleEnd = new Date(day);
              dayVisibleEnd.setHours(endHour, 0, 0, 0);

              const warningsStartingInSlot = guardianWarnings.filter(
                (w) =>
                  new Date(w.startTime) >= slotStart &&
                  new Date(w.startTime) < slotEnd &&
                  new Date(w.startTime).toDateString() === day.toDateString()
              );

              // Connector bands: find appointments that appear in 2+ member columns
              const appointmentColIndices = new Map<string, { colIdxs: number[]; occ: AppointmentOccurrence }>();
              columns.forEach((col, colIdx) => {
                if (col.id === "events" || col.id === "all") return;
                dayOccurrences.forEach((occ) => {
                  if (occ.appointment.is_event || occ.appointment.is_all_family) return;
                  const isOwner = occ.appointment.owner_id === col.id;
                  const isParticipant = occ.appointment.participants.some((p) => p.member_id === col.id);
                  if (!isOwner && !isParticipant) return;
                  if (
                    occ.occurrenceStart >= slotStart &&
                    occ.occurrenceStart < slotEnd &&
                    occ.occurrenceStart.toDateString() === day.toDateString()
                  ) {
                    if (!appointmentColIndices.has(occ.appointment.id)) {
                      appointmentColIndices.set(occ.appointment.id, { colIdxs: [], occ });
                    }
                    appointmentColIndices.get(occ.appointment.id)!.colIdxs.push(colIdx);
                  }
                });
              });
              const connectors = Array.from(appointmentColIndices.values())
                .filter(({ colIdxs }) => colIdxs.length >= 2)
                .map(({ colIdxs, occ }) => {
                  const fromColIdx = Math.min(...colIdxs);
                  const toColIdx = Math.max(...colIdxs);
                  const durationMin = (occ.occurrenceEnd.getTime() - occ.occurrenceStart.getTime()) / 60000;
                  const heightPx = Math.max((durationMin / 30) * SLOT_HEIGHT, SLOT_HEIGHT);
                  const minutesIntoSlot = (occ.occurrenceStart.getTime() - slotStart.getTime()) / 60000;
                  const topOffset = (minutesIntoSlot / 30) * SLOT_HEIGHT;
                  const ownerMember = members.find((m) => m.id === occ.appointment.owner_id);
                  const color = ownerMember?.color ?? "#6366f1";
                  return { occ, fromColIdx, toColIdx, heightPx, topOffset, color };
                });

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
                  className={`flex ${showHourLine ? "border-t border-[var(--border)]" : "border-t border-[var(--border)]/30"}`}
                >
                  {/* Time label */}
                  <div className="w-14 shrink-0 flex items-start justify-end pr-2">
                    {showHourLine && (
                      <span className="text-[10px] text-[var(--muted-foreground)] -translate-y-1/2 leading-none">
                        {String(hours).padStart(2, "0")}:00
                      </span>
                    )}
                    {isHalfHour && (
                      <span className="text-[9px] text-[var(--muted-foreground)]/60 -translate-y-1/2 leading-none">
                        {String(hours).padStart(2, "0")}:30
                      </span>
                    )}
                  </div>

                  {/* Member columns */}
                  {columns.map((col) => {
                    const isEventsCol = col.id === "events";

                    const colOccurrences = dayOccurrences.filter((occ) => {
                      const apptIsEvent = occ.appointment.is_event ?? false;
                      if (isEventsCol) {
                        if (!apptIsEvent) return false;
                      } else {
                        if (apptIsEvent) return false;
                        if (occ.appointment.is_all_family && col.id !== "all") return false;
                        if (!occ.appointment.is_all_family && col.id === "all") return false;
                        if (!occ.appointment.is_all_family) {
                          const isOwner = occ.appointment.owner_id === col.id;
                          const isParticipant = occ.appointment.participants.some((p) => p.member_id === col.id);
                          if (!isOwner && !isParticipant) return false;
                        }
                      }
<<<<<<< HEAD
                      if (occ.occurrenceStart.toDateString() !== day.toDateString()) return false;
                      if (occ.occurrenceStart >= slotStart && occ.occurrenceStart < slotEnd) return true;
                      // Appointments outside the visible hours are pinned to the edge
                      // slots instead of disappearing entirely
                      if (slotIdx === 0 && occ.occurrenceStart < slotStart) return true;
                      if (slotIdx === slotsPerDay - 1 && occ.occurrenceStart >= slotEnd) return true;
                      return false;
=======
                      const sameDay = occ.occurrenceStart.toDateString() === day.toDateString();
                      const startsInSlot =
                        sameDay && occ.occurrenceStart >= slotStart && occ.occurrenceStart < slotEnd;
                      // Appointment starting before the visible window
                      // (e.g. 06:00 with startHour 08) → clamp into first slot
                      const clampedIntoFirstSlot =
                        slotIdx === 0 &&
                        sameDay &&
                        occ.occurrenceStart < slotStart &&
                        occ.occurrenceEnd > slotStart;
                      return startsInSlot || clampedIntoFirstSlot;
>>>>>>> 485593881e3feccb28c04fb2507d4aedbb639398
                    });

                    const travelStartOccurrences = isEventsCol ? [] : dayOccurrences.filter((occ) => {
                      if (occ.appointment.is_event) return false;
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

                    const travelEndOccurrences = isEventsCol ? [] : dayOccurrences.filter((occ) => {
                      if (occ.appointment.is_event) return false;
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

                    const colWarnings = isEventsCol ? [] : warningsStartingInSlot.filter((w) => w.memberId === col.id);

                    return (
                      <DroppableSlotCell
                        key={col.id}
                        id={`drop-${dayIdx}-${slotIdx}-${col.id}`}
                        data={{ slotStart, memberId: col.id }}
                        className={`flex-1 relative min-w-0 ${
                          col.id === "all" || col.id === "events"
                            ? "border-l-2 border-[var(--border)]"
                            : "border-l border-[var(--border)]/50"
                        } ${isEventsCol ? "bg-purple-500/[0.02]" : ""} ${
                          selectedSlot?.dayIdx === dayIdx && selectedSlot?.slotIdx === slotIdx && selectedSlot?.colId === col.id
                            ? "bg-[var(--primary)]/15"
                            : ""
                        }`}
                        style={{ minHeight: SLOT_HEIGHT }}
                        onClick={() => {
                          setSelectedSlot({ dayIdx, slotIdx, colId: col.id });
                          openForm({ date: slotStart, memberId: col.id });
                        }}
                      >
                        {colWarnings.map((w) => {
                          const topOffset = ((w.startTime.getTime() - slotStart.getTime()) / 60000 / 30) * SLOT_HEIGHT;
                          const heightPx = ((w.endTime.getTime() - w.startTime.getTime()) / 60000 / 30) * SLOT_HEIGHT;
                          return (
                            <div
                              key={`warning-${w.memberId}-${w.startTime.getTime()}`}
                              style={{ position: "absolute", top: topOffset, left: 0, right: 0, height: heightPx, zIndex: 10 }}
                              className="bg-red-500/10 border-l-2 border-red-500 pointer-events-none"
                            />
                          );
                        })}
                        {travelStartOccurrences.map((occ) => (
                          <TravelBlock
                            key={`travel-before-${occ.key}`}
                            occurrence={occ}
                            type="before"
                            slotStart={slotStart}
                          />
                        ))}
                        {colOccurrences.map((occ) => (
                          <AppointmentBlock
                            key={`${occ.key}-${col.id}`}
                            occurrence={occ}
                            columnId={col.id}
                            memberColor={col.color}
                            ownerIsDragging={activeOccurrence?.appointment.id === occ.appointment.id}
                            slotStart={slotStart}
                            dayVisibleEnd={dayVisibleEnd}
                          />
                        ))}
                        {travelEndOccurrences.map((occ) => (
                          <TravelBlock
                            key={`travel-after-${occ.key}`}
                            occurrence={occ}
                            type="after"
                            slotStart={slotStart}
                          />
                        ))}
                      </DroppableSlotCell>
                    );
                  })}
                  {/* Connector bands linking owner + participant columns */}
                  {connectors.map(({ occ, fromColIdx, toColIdx, heightPx, topOffset, color }) => (
                    <div
                      key={`connector-${occ.key}`}
                      style={{
                        position: "absolute",
                        left: `calc(56px + ${fromColIdx} * (100% - 56px) / ${columns.length})`,
                        width: `calc(${toColIdx - fromColIdx + 1} * (100% - 56px) / ${columns.length})`,
                        top: `${topOffset}px`,
                        height: `${heightPx - 2}px`,
                        borderTop: `2px solid ${hexToRgba(color, 0.35)}`,
                        borderBottom: `1px solid ${hexToRgba(color, 0.2)}`,
                        pointerEvents: "none",
                        zIndex: 5,
                      }}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {isFormOpen && <AppointmentForm onClose={() => { closeForm(); setSelectedSlot(null); }} />}
      {mealEditDate && (
        <MealEditDialog
          date={mealEditDate}
          meal={mealsByDate.get(mealEditDate) ?? null}
          onClose={() => setMealEditDate(null)}
        />
      )}
      <DragOverlay dropAnimation={null}>
        {activeOccurrence && (() => {
          const occ = activeOccurrence;
          const ownerMember = members.find((m) => m.id === occ.appointment.owner_id);
          const color = ownerMember?.color ?? "#6366f1";
          const durationMin = (occ.occurrenceEnd.getTime() - occ.occurrenceStart.getTime()) / 60000;
          const heightPx = Math.max((durationMin / 30) * SLOT_HEIGHT, SLOT_HEIGHT);
          return (
            <div
              style={{
                width: 120,
                height: `${heightPx}px`,
                backgroundColor: hexToRgba(color, 0.9),
                borderLeft: `3px solid ${color}`,
                borderRadius: 4,
                color: "#fff",
                fontSize: 11,
                fontWeight: 500,
                padding: "2px 5px",
                overflow: "hidden",
                boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
                opacity: 0.95,
                cursor: "grabbing",
              }}
            >
              <span className="truncate block">{occ.appointment.title}</span>
            </div>
          );
        })()}
      </DragOverlay>
    </DndContext>
  );
}
