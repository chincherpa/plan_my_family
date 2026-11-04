"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useCalendarStore } from "@/lib/store/calendarStore";
import { useDataStore } from "@/lib/store/dataStore";
import { expandAppointments, type AppointmentOccurrence } from "@/lib/utils/recurrence";
import { checkGuardianWarnings } from "@/lib/utils/guardianCheck";
import { findVehicleConflicts } from "@/lib/utils/conflicts";
import { formatDate, formatTime, getISOWeek, localDateStr, readableTextColor, startOfDay } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import AppointmentForm from "@/components/appointments/AppointmentForm";
import MealEditDialog from "./MealEditDialog";
import DayTimeline, { TIME_GUTTER, snapShiftMin } from "./DayTimeline";
import { DayBanner, MealsStrip, TodoDueStrip, UpcomingDay } from "./DayParts";
import {
  ALL_COLUMN_COLOR,
  ALL_COLUMN_ID,
  EVENTS_COLUMN_ID,
  buildDayData,
  type Column,
} from "./model";

const CONFLICT_WINDOW_DAYS = 14;
const UPCOMING_BATCH = 21;
const UPCOMING_MAX = 365;
/** Space reserved for header, banner and meals when fitting the day on screen */
const CHROME_HEIGHT = 250;

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Hour height that fits the whole visible day into the viewport, within bounds. */
function useHourHeight(hours: number): number {
  const [height, setHeight] = useState(48);
  useEffect(() => {
    const update = () =>
      setHeight(Math.round(Math.min(Math.max((window.innerHeight - CHROME_HEIGHT) / hours, 40), 84)));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [hours]);
  return height;
}

function currentMinute(): Date {
  const d = new Date();
  d.setSeconds(0, 0);
  return d;
}

/**
 * Current time floored to the minute, refreshed on each full minute (moves the
 * now-line, rolls over at midnight). Flooring keeps the SSR and hydration
 * renders identical within the same minute.
 */
function useNow(): Date {
  const [now, setNow] = useState(currentMinute);
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(currentMinute());
      id = setTimeout(tick, 60_000 - (Date.now() % 60_000));
    };
    tick();
    return () => clearTimeout(id);
  }, []);
  return now;
}

export default function CalendarView() {
  const { isFormOpen, openForm, closeForm, startHour, endHour } = useCalendarStore();
  const { members, vehicles, appointments, meals, isLoading, updateAppointment } = useDataStore();

  const now = useNow();
  const today = useMemo(() => startOfDay(now), [now]);
  // null = follow today, so the wall tablet rolls over at midnight on its own
  const [pickedDay, setPickedDay] = useState<Date | null>(null);
  const heroDay = pickedDay ?? today;
  const isHeroToday = heroDay.getTime() === today.getTime();

  const [upcomingCount, setUpcomingCount] = useState(UPCOMING_BATCH);
  const [mealEditDate, setMealEditDate] = useState<string | null>(null);
  const [conflictsOpen, setConflictsOpen] = useState(false);
  /** Upcoming day shown as full timeline in place ("YYYY-MM-DD") */
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const lastDragEnd = useRef(0);

  const hourHeight = useHourHeight(endHour - startHour);

  const columns = useMemo<Column[]>(
    () => [...members, { id: ALL_COLUMN_ID, name: "Alle", color: ALL_COLUMN_COLOR }],
    [members]
  );

  // One range covers the hero day, the upcoming list and the conflict window
  const rangeStart = useMemo(() => addDays(heroDay < today ? heroDay : today, -1), [heroDay, today]);
  const rangeEnd = useMemo(() => {
    const listEnd = addDays(heroDay, upcomingCount + 1);
    const conflictEnd = addDays(today, CONFLICT_WINDOW_DAYS + 1);
    return listEnd > conflictEnd ? listEnd : conflictEnd;
  }, [heroDay, today, upcomingCount]);

  const occurrences = useMemo(
    () => expandAppointments(appointments, rangeStart, rangeEnd),
    [appointments, rangeStart, rangeEnd]
  );

  const guardianWarnings = useMemo(
    () => checkGuardianWarnings(members, occurrences, rangeStart, rangeEnd),
    [members, occurrences, rangeStart, rangeEnd]
  );

  const vehicleConflicts = useMemo(
    () =>
      findVehicleConflicts(
        occurrences.filter((o) => !o.appointment.is_all_day),
        rangeStart,
        rangeEnd
      ),
    [occurrences, rangeStart, rangeEnd]
  );

  const conflictKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const c of vehicleConflicts) {
      keys.add(c.a.key);
      keys.add(c.b.key);
    }
    return keys;
  }, [vehicleConflicts]);

  const upcomingConflicts = useMemo(() => {
    const windowEnd = addDays(today, CONFLICT_WINDOW_DAYS);
    const inWindow = (start: Date, end: Date) => start < windowEnd && end > today;
    const guardian = guardianWarnings.filter((w) => inWindow(w.startTime, w.endTime));
    const vehicle = vehicleConflicts.filter((c) => inWindow(c.start, c.start));
    return { guardian, vehicle, total: guardian.length + vehicle.length };
  }, [guardianWarnings, vehicleConflicts, today]);

  const heroData = useMemo(
    () => buildDayData(heroDay, occurrences, guardianWarnings),
    [heroDay, occurrences, guardianWarnings]
  );

  const upcomingData = useMemo(
    () =>
      Array.from({ length: upcomingCount }, (_, i) =>
        buildDayData(addDays(heroDay, i + 1), occurrences, guardianWarnings)
      ),
    [heroDay, upcomingCount, occurrences, guardianWarnings]
  );

  const mealsByDate = useMemo(() => new Map(meals.map((m) => [m.date, m])), [meals]);

  // Grow the upcoming list as the sentinel scrolls into view
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setUpcomingCount((n) => Math.min(n + UPCOMING_BATCH, UPCOMING_MAX));
        }
      },
      { root: scrollRef.current, rootMargin: "600px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isLoading]);

  function showDay(day: Date) {
    const d = startOfDay(day);
    setPickedDay(d.getTime() === today.getTime() ? null : d);
    setUpcomingCount(UPCOMING_BATCH);
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showDateStr(dateStr: string) {
    const [y, m, d] = dateStr.split("-").map(Number);
    showDay(new Date(y, m - 1, d));
  }

  function openOccurrence(occ: AppointmentOccurrence) {
    // A drag ends with a click on the dropped block — don't open the form then
    if (Date.now() - lastDragEnd.current < 300) return;
    openForm({ appointmentId: occ.appointment.id, occurrenceStart: occ.occurrenceStart });
  }

  function newAt(day: Date, columnId: string) {
    const start = new Date(day);
    start.setHours(Math.min(Math.max(9, startHour), endHour - 1), 0, 0, 0);
    openForm({ date: start, memberId: columnId });
  }

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } })
  );

  async function handleDragEnd(event: DragEndEvent) {
    lastDragEnd.current = Date.now();
    const occ = event.active.data.current as AppointmentOccurrence | undefined;
    if (!occ) return;
    const overColumn = (event.over?.data.current as { columnId?: string } | undefined)?.columnId;
    const shiftMin = snapShiftMin(event.delta.y, hourHeight);
    const newOwnerId =
      !overColumn || overColumn === ALL_COLUMN_ID ? occ.appointment.owner_id : overColumn;
    if (shiftMin === 0 && newOwnerId === occ.appointment.owner_id) return;

    const newStart = new Date(occ.occurrenceStart.getTime() + shiftMin * 60000);
    const newEnd = new Date(occ.occurrenceEnd.getTime() + shiftMin * 60000);
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

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" />
      </div>
    );
  }

  const heroKey = localDateStr(heroDay);

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd} onDragCancel={() => (lastDragEnd.current = Date.now())}>
      <div ref={scrollRef} className="h-full overflow-y-auto overflow-x-hidden">
        {/* Sticky top: date, navigation, conflicts, column names */}
        <div className="sticky top-0 z-40 bg-[var(--background)]/95 backdrop-blur px-2 sm:px-4 pt-3">
          {/* pr-11 leaves room for the floating theme toggle */}
          <div className="flex items-center gap-2 pr-11">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                {heroDay.toLocaleDateString("de-DE", { weekday: "long" })}
                <span className="normal-case tracking-normal">· KW {getISOWeek(heroDay)}</span>
                {isHeroToday && (
                  <button
                    type="button"
                    onClick={() => showDay(today)}
                    title="Zu heute springen"
                    className="cursor-pointer rounded-full bg-[var(--primary)] px-2 py-0.5 text-[10px] text-[var(--primary-foreground)] hover:opacity-90"
                  >
                    Heute
                  </button>
                )}
              </div>
              <h1 className="truncate text-2xl sm:text-3xl font-bold tracking-tight">
                {heroDay.toLocaleDateString("de-DE", { day: "numeric", month: "long" })}
                {isHeroToday && (
                  <span
                    suppressHydrationWarning
                    className="ml-3 text-lg sm:text-xl font-medium text-[var(--muted-foreground)] tabular"
                  >
                    {formatTime(now)}
                  </span>
                )}
              </h1>
            </div>

            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => showDay(addDays(heroDay, -1))} title="Vorheriger Tag">
                <ChevronLeft className="w-5 h-5" />
              </Button>
              {!isHeroToday && (
                <Button variant="secondary" size="sm" onClick={() => showDay(today)}>
                  Heute
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={() => showDay(addDays(heroDay, 1))} title="Nächster Tag">
                <ChevronRight className="w-5 h-5" />
              </Button>
              <label className="relative inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg hover:bg-[var(--accent)]" title="Datum wählen">
                <CalendarDays className="w-5 h-5" />
                <input
                  type="date"
                  value={heroKey}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  onChange={(e) => e.target.value && showDateStr(e.target.value)}
                />
              </label>
              <Button className="ml-1 gap-1" onClick={() => openForm({ date: isHeroToday ? undefined : heroDay })}>
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Termin</span>
              </Button>
            </div>
          </div>

          {upcomingConflicts.total > 0 && (
            <div className="mt-3 rounded-xl border border-[var(--warning)]/50 bg-[var(--warning)]/10">
              <button
                type="button"
                onClick={() => setConflictsOpen((o) => !o)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-[var(--warning)]"
              >
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span className="flex-1">
                  {[
                    upcomingConflicts.guardian.length > 0 &&
                      `${upcomingConflicts.guardian.length} Aufsichtslücke${upcomingConflicts.guardian.length === 1 ? "" : "n"}`,
                    upcomingConflicts.vehicle.length > 0 &&
                      `${upcomingConflicts.vehicle.length} Fahrzeugkonflikt${upcomingConflicts.vehicle.length === 1 ? "" : "e"}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  <span className="font-normal opacity-80"> · nächste {CONFLICT_WINDOW_DAYS} Tage</span>
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform ${conflictsOpen ? "rotate-180" : ""}`} />
              </button>
              {conflictsOpen && (
                <div className="max-h-48 space-y-0.5 overflow-y-auto px-2 pb-2">
                  {upcomingConflicts.guardian.map((w) => (
                    <button
                      key={`gw-${w.memberId}-${w.startTime.getTime()}`}
                      type="button"
                      onClick={() => showDay(w.startTime)}
                      className="block w-full rounded-lg px-2 py-1 text-left text-sm hover:bg-[var(--warning)]/15"
                    >
                      <span className="text-[var(--muted-foreground)] tabular">
                        {formatDate(w.startTime)} {formatTime(w.startTime)}–{formatTime(w.endTime)}
                      </span>{" "}
                      · <span className="font-medium">{w.memberName}</span> ohne Aufsicht
                    </button>
                  ))}
                  {upcomingConflicts.vehicle.map((c) => {
                    const vehicle = vehicles.find((v) => v.id === c.vehicleId);
                    return (
                      <button
                        key={`vc-${c.a.key}-${c.b.key}`}
                        type="button"
                        onClick={() => showDay(c.start)}
                        className="block w-full rounded-lg px-2 py-1 text-left text-sm hover:bg-[var(--warning)]/15"
                      >
                        <span className="text-[var(--muted-foreground)] tabular">{formatDate(c.start)}</span> ·{" "}
                        <span className="font-medium">
                          {vehicle ? `${vehicle.icon_emoji} ${vehicle.name}` : "Fahrzeug"}
                        </span>{" "}
                        doppelt: „{c.a.appointment.title}“ / „{c.b.appointment.title}“
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Column names */}
          <div className="mt-3 flex pb-2">
            <div className={`${TIME_GUTTER} shrink-0`} />
            <div className="flex flex-1 gap-1 min-w-0">
              {columns.map((col) => (
                <div
                  key={col.id}
                  className="flex-1 min-w-0 truncate rounded-lg px-1 py-1.5 text-center text-xs sm:text-sm font-semibold"
                  style={{ backgroundColor: col.color, color: readableTextColor(col.color) }}
                >
                  {col.name}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-2 sm:px-4 pb-8">
          {/* Hero day */}
          <div className="mb-2 pl-11 sm:pl-14">
            <DayBanner
              data={heroData}
              onOpen={openOccurrence}
              onAddEvent={() => openForm({ date: heroDay, memberId: EVENTS_COLUMN_ID })}
            />
          </div>
          <div className="pt-2">
            <TodoDueStrip day={heroDay} columns={columns} />
            <DayTimeline
              data={heroData}
              columns={columns}
              startHour={startHour}
              endHour={endHour}
              hourHeight={hourHeight}
              now={now}
              conflictKeys={conflictKeys}
              onSlotClick={(start, columnId) => openForm({ date: start, memberId: columnId })}
              onOpen={openOccurrence}
            />
          </div>
          <div className="mt-3 pl-11 sm:pl-14">
            <MealsStrip meal={mealsByDate.get(heroKey)} onEdit={() => setMealEditDate(heroKey)} />
          </div>

          {/* Coming days */}
          <h2 className="mt-8 mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Kommende Tage
          </h2>
          {upcomingData.map((data) => {
            const key = localDateStr(data.day);
            const expanded = expandedKey === key;
            return (
              <UpcomingDay
                key={key}
                data={data}
                columns={columns}
                meal={mealsByDate.get(key)}
                conflictKeys={conflictKeys}
                expanded={expanded}
                timeline={
                  expanded && (
                    <>
                      <TodoDueStrip day={data.day} columns={columns} />
                      <DayTimeline
                        data={data}
                        columns={columns}
                        startHour={startHour}
                        endHour={endHour}
                        hourHeight={hourHeight}
                        now={now}
                        conflictKeys={conflictKeys}
                        onSlotClick={(start, columnId) => openForm({ date: start, memberId: columnId })}
                        onOpen={openOccurrence}
                      />
                    </>
                  )
                }
                onToggle={() => setExpandedKey(expanded ? null : key)}
                onOpen={openOccurrence}
                onCellClick={(columnId) => newAt(data.day, columnId)}
                onEditMeal={() => setMealEditDate(key)}
              />
            );
          })}
          <div ref={sentinelRef} className="h-8" />
        </div>
      </div>

      {isFormOpen && <AppointmentForm onClose={closeForm} />}
      {mealEditDate && (
        <MealEditDialog
          date={mealEditDate}
          meal={mealsByDate.get(mealEditDate) ?? null}
          onClose={() => setMealEditDate(null)}
        />
      )}
    </DndContext>
  );
}
