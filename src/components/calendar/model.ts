import type { AppointmentOccurrence } from "@/lib/utils/recurrence";
import type { GuardianWarning } from "@/lib/utils/guardianCheck";

export const ALL_COLUMN_ID = "all";
export const EVENTS_COLUMN_ID = "events";
export const ALL_COLUMN_COLOR = "#6366f1";
export const EVENT_COLOR = "#8b5cf6";

export interface Column {
  id: string;
  name: string;
  color: string;
}

/** Everything one day needs to render, pre-sorted by start time. */
export interface DayData {
  day: Date;
  /** Timed, non-event occurrences overlapping the day (incl. travel). */
  timed: AppointmentOccurrence[];
  /** All-day appointments and events (Geburtstage, Feiertage, …). */
  banner: AppointmentOccurrence[];
  warnings: GuardianWarning[];
}

/**
 * Columns an occurrence shows up in, and whether it's the owner's copy there.
 * An all-family appointment owns the "Alle" column and appears in every
 * member column too (`columns` also holds "Alle" and is filtered here).
 */
export function placementsFor(
  occ: AppointmentOccurrence,
  columns: Column[]
): { columnId: string; isOwner: boolean }[] {
  const appt = occ.appointment;
  if (appt.is_all_family) {
    return [
      { columnId: ALL_COLUMN_ID, isOwner: true },
      ...columns
        .filter((c) => c.id !== ALL_COLUMN_ID)
        .map((c) => ({ columnId: c.id, isOwner: false })),
    ];
  }
  const result: { columnId: string; isOwner: boolean }[] = appt.owner_id
    ? [{ columnId: appt.owner_id, isOwner: true }]
    : [];
  for (const p of appt.participants) {
    if (p.member_id !== appt.owner_id) result.push({ columnId: p.member_id, isOwner: false });
  }
  return result;
}

export function dayBounds(day: Date): [Date, Date] {
  const end = new Date(day);
  end.setDate(end.getDate() + 1);
  return [day, end];
}

export function buildDayData(
  day: Date,
  occurrences: AppointmentOccurrence[],
  warnings: GuardianWarning[]
): DayData {
  const [start, end] = dayBounds(day);
  const timed: AppointmentOccurrence[] = [];
  const banner: AppointmentOccurrence[] = [];
  for (const occ of occurrences) {
    const appt = occ.appointment;
    if (appt.is_all_day || appt.is_event) {
      if (occ.occurrenceStart < end && (occ.occurrenceEnd > start || occ.occurrenceStart >= start)) {
        banner.push(occ);
      }
      continue;
    }
    if (occ.travelStart < end && occ.travelEnd > start) timed.push(occ);
  }
  timed.sort((a, b) => a.occurrenceStart.getTime() - b.occurrenceStart.getTime());
  banner.sort((a, b) => a.occurrenceStart.getTime() - b.occurrenceStart.getTime());
  return {
    day,
    timed,
    banner,
    warnings: warnings.filter((w) => w.startTime < end && w.endTime > start),
  };
}
