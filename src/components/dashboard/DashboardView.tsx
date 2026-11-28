"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, CalendarDays, CircleHelp, Repeat, UtensilsCrossed } from "lucide-react";
import { useDataStore } from "@/lib/store/dataStore";
import { useCalendarStore } from "@/lib/store/calendarStore";
import { expandAppointments, type AppointmentOccurrence } from "@/lib/utils/recurrence";
import { holidaysOn } from "@/lib/utils/schoolHolidays";
import { anniversaryBadge } from "@/lib/anniversaries";
import { cn, formatTime, getISOWeek, hexToRgba, localDateStr, readableTextColor, startOfDay } from "@/lib/utils";
import { useNow } from "@/lib/useNow";
import { appointmentsByMember, isOngoing, isPast, type DashboardEntry } from "@/lib/dashboard";
import type { MealType } from "@/lib/recipes/stats";
import type { FamilyMember } from "@/lib/supabase/types";
import AppointmentForm from "@/components/appointments/AppointmentForm";
import MealEditDialog from "@/components/calendar/MealEditDialog";
import {
  ALL_COLUMN_COLOR,
  EVENT_COLOR,
  HOLIDAY_COLOR,
  TENTATIVE_HINT,
  TENTATIVE_OPACITY,
  buildDayData,
  eventEmoji,
} from "@/components/calendar/model";

const IMPORTANT_HINT = "Wichtig";
/** Neutral grey for appointments that are already over */
const PAST_COLOR = "var(--muted-foreground)";

const MEAL_SLOTS: { type: MealType; label: string; emoji: string }[] = [
  { type: "lunch", label: "Mittag", emoji: "🍽" },
  { type: "dinner", label: "Abend", emoji: "🌙" },
];

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Startseite: heutige Termine je Familienmitglied, darunter das Essen des Tages. */
export default function DashboardView() {
  const { members, appointments, meals, schoolHolidays, vehicles, isLoading } = useDataStore();
  const { isFormOpen, openForm, closeForm } = useCalendarStore();
  const now = useNow();
  const todayMs = startOfDay(now).getTime();
  const today = useMemo(() => new Date(todayMs), [todayMs]);
  const todayKey = localDateStr(today);
  const [mealEdit, setMealEdit] = useState<MealType | null>(null);

  const dayData = useMemo(() => {
    const occurrences = expandAppointments(appointments, addDays(today, -1), addDays(today, 2), schoolHolidays);
    return buildDayData(today, occurrences, []);
  }, [appointments, schoolHolidays, today]);

  const perMember = useMemo(() => appointmentsByMember(dayData, members), [dayData, members]);
  const events = dayData.banner.filter((occ) => occ.appointment.is_event);
  const holidays = holidaysOn(todayKey, schoolHolidays);
  const meal = meals.find((m) => m.date === todayKey);

  function ownerColor(occ: AppointmentOccurrence): string {
    const appt = occ.appointment;
    if (appt.is_event) return EVENT_COLOR;
    if (appt.is_all_family) return ALL_COLUMN_COLOR;
    return members.find((m) => m.id === appt.owner_id)?.color ?? ALL_COLUMN_COLOR;
  }

  function open(occ: AppointmentOccurrence) {
    openForm({ appointmentId: occ.appointment.id, occurrenceStart: occ.occurrenceStart });
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden">
      <div className="mx-auto max-w-7xl px-4 pb-10 pt-3">
        {/* pr-11 leaves room for the floating theme toggle */}
        <header className="flex items-center gap-2 pr-11">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              {today.toLocaleDateString("de-DE", { weekday: "long" })}
              <span className="normal-case tracking-normal">· KW {getISOWeek(today)}</span>
            </div>
            <h1 className="truncate text-2xl sm:text-3xl font-bold tracking-tight">
              {today.toLocaleDateString("de-DE", { day: "numeric", month: "long" })}
              <span
                suppressHydrationWarning
                className="ml-3 text-lg sm:text-xl font-medium text-[var(--muted-foreground)] tabular"
              >
                {formatTime(now)}
              </span>
            </h1>
          </div>
          <Link
            href="/calendar"
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium hover:bg-[var(--accent)]"
          >
            <CalendarDays className="h-4 w-4" />
            <span className="hidden sm:inline">Kalender</span>
          </Link>
        </header>

        {(holidays.length > 0 || events.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {holidays.map((h) => (
              <span
                key={`holiday-${h.id}`}
                className="flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium"
                style={{
                  backgroundColor: hexToRgba(HOLIDAY_COLOR, 0.18),
                  color: HOLIDAY_COLOR,
                  boxShadow: `inset 0 0 0 1px ${hexToRgba(HOLIDAY_COLOR, 0.4)}`,
                }}
              >
                🏖️ {h.name}
              </span>
            ))}
            {events.map((occ) => {
              const appt = occ.appointment;
              const badge = anniversaryBadge(appt, occ.occurrenceStart);
              return (
                <button
                  key={occ.key}
                  type="button"
                  onClick={() => open(occ)}
                  className={cn(
                    "flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium hover:opacity-90",
                    appt.is_important && "ring-2 ring-red-600 ring-offset-1"
                  )}
                  style={{ backgroundColor: EVENT_COLOR, color: readableTextColor(EVENT_COLOR) }}
                >
                  {badge?.emoji ?? eventEmoji(appt.title)} {appt.title}
                  {badge?.count != null && ` (${badge.count})`}
                </button>
              );
            })}
          </div>
        )}

        <h2 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
          Termine heute
        </h2>
        {members.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Noch keine Familienmitglieder angelegt.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {perMember.map(({ member, entries }) => (
              <MemberCard
                key={member.id}
                member={member}
                entries={entries}
                now={now}
                colorOf={ownerColor}
                vehicleOf={(id) => vehicles.find((v) => v.id === id)}
                onOpen={open}
              />
            ))}
          </div>
        )}

        <h2 className="mb-2 mt-8 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
          Essen heute
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {MEAL_SLOTS.map(({ type, label, emoji }) => {
            const dish = meal?.[type];
            return (
              <button
                key={type}
                type="button"
                onClick={() => setMealEdit(type)}
                className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-left transition-colors hover:bg-[var(--accent)]"
              >
                <span className="text-2xl" aria-hidden>
                  {emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                    {label}
                  </span>
                  {dish ? (
                    <span className="block truncate text-base font-semibold">{dish}</span>
                  ) : (
                    <span className="block text-sm text-[var(--muted-foreground)]/70">Noch nichts geplant …</span>
                  )}
                </span>
                <UtensilsCrossed className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
              </button>
            );
          })}
        </div>
      </div>

      {isFormOpen && <AppointmentForm onClose={closeForm} />}
      {mealEdit && (
        <MealEditDialog date={todayKey} meal={meal ?? null} initialType={mealEdit} onClose={() => setMealEdit(null)} />
      )}
    </div>
  );
}

function MemberCard({
  member,
  entries,
  now,
  colorOf,
  vehicleOf,
  onOpen,
}: {
  member: FamilyMember;
  entries: DashboardEntry[];
  now: Date;
  colorOf: (occ: AppointmentOccurrence) => string;
  vehicleOf: (id: string) => { icon_emoji: string; name: string } | undefined;
  onOpen: (occ: AppointmentOccurrence) => void;
}) {
  const open = entries.filter((e) => !isPast(e.occ, now)).length;
  return (
    <section
      className="flex flex-col overflow-hidden rounded-2xl border bg-[var(--card)]"
      style={{ borderColor: hexToRgba(member.color, 0.5) }}
    >
      <header
        className="flex items-center justify-between gap-2 px-3 py-2"
        style={{ backgroundColor: member.color, color: readableTextColor(member.color) }}
      >
        <h3 className="truncate font-semibold">{member.name}</h3>
        <span className="text-xs font-medium opacity-80 tabular">
          {entries.length === 0 ? "frei" : open === 0 ? "alles erledigt" : `${open} offen`}
        </span>
      </header>
      <div className="flex flex-1 flex-col gap-1.5 p-2" style={{ backgroundColor: hexToRgba(member.color, 0.05) }}>
        {entries.length === 0 ? (
          <p className="px-1 py-3 text-center text-sm text-[var(--muted-foreground)]">Keine Termine heute</p>
        ) : (
          entries.map(({ occ, isOwner }) => {
            const appt = occ.appointment;
            const past = isPast(occ, now);
            const ongoing = isOngoing(occ, now);
            const color = past ? PAST_COLOR : colorOf(occ);
            const vehicle = appt.vehicle_id ? vehicleOf(appt.vehicle_id) : undefined;
            const notes = appt.notes?.trim();
            return (
              <button
                key={occ.key}
                type="button"
                onClick={() => onOpen(occ)}
                className={cn(
                  "flex w-full gap-2.5 rounded-xl bg-[var(--card)] px-2.5 py-2 text-left transition-colors hover:bg-[var(--accent)]",
                  appt.is_important ? "border-2 border-red-600" : "border",
                  past && "text-[var(--muted-foreground)]"
                )}
                style={{ opacity: past ? 0.6 : appt.is_tentative ? TENTATIVE_OPACITY + 0.2 : undefined }}
                title={[
                  appt.title,
                  appt.is_important && IMPORTANT_HINT,
                  appt.is_tentative && TENTATIVE_HINT,
                  !isOwner && "Teilnahme",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              >
                {/* Farbleiste: Farbe des Termin-Inhabers, gestrichelt bei bloßer Teilnahme */}
                <span
                  aria-hidden
                  className="w-1.5 shrink-0 self-stretch rounded-full"
                  style={
                    isOwner
                      ? { backgroundColor: color }
                      : { backgroundImage: `repeating-linear-gradient(to bottom, ${color} 0 4px, transparent 4px 7px)` }
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className={cn("flex items-center gap-1.5 text-xs tabular", past && "line-through")}>
                    <span className={past ? undefined : "text-[var(--muted-foreground)]"}>
                      {appt.is_all_day
                        ? "Ganztägig"
                        : `${formatTime(occ.occurrenceStart)}–${formatTime(occ.occurrenceEnd)}`}
                    </span>
                    {ongoing && (
                      <span
                        className="rounded-full px-1.5 py-px text-[10px] font-semibold no-underline"
                        style={{ backgroundColor: color, color: readableTextColor(colorOf(occ)) }}
                      >
                        jetzt
                      </span>
                    )}
                    <span className="ml-auto flex items-center gap-1">
                      {appt.is_important && (
                        <AlertCircle className="h-3.5 w-3.5 text-red-600" aria-label={IMPORTANT_HINT} />
                      )}
                      {appt.is_tentative && <CircleHelp className="h-3.5 w-3.5" aria-label={TENTATIVE_HINT} />}
                      {occ.isRecurringInstance && <Repeat className="h-3 w-3 opacity-60" aria-label="Serie" />}
                    </span>
                  </span>
                  <span className={cn("block break-words font-semibold leading-snug", past && "line-through")}>
                    {appt.title}
                  </span>
                  {vehicle && (
                    <span className="block truncate text-xs text-[var(--muted-foreground)]">
                      {vehicle.icon_emoji} {vehicle.name}
                    </span>
                  )}
                  {notes && (
                    <span className="mt-1 block whitespace-pre-wrap break-words border-l-2 border-[var(--border)] pl-2 text-xs text-[var(--muted-foreground)]">
                      {notes}
                    </span>
                  )}
                </span>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
