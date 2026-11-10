import { RRule } from "rrule";
import { localDateStr } from "@/lib/utils";

/** Ein Ferienzeitraum, beide Grenzen "YYYY-MM-DD" und einschließlich. */
export interface HolidayRange {
  name: string;
  start_date: string;
  end_date: string;
}

/** Ferien, in die der lokale Tag `dateKey` ("YYYY-MM-DD") fällt. */
export function holidaysOn<T extends HolidayRange>(dateKey: string, holidays: T[]): T[] {
  return holidays.filter((h) => h.start_date <= dateKey && dateKey <= h.end_date);
}

export function isSchoolHoliday(dateKey: string, holidays: HolidayRange[]): boolean {
  return holidays.some((h) => h.start_date <= dateKey && dateKey <= h.end_date);
}

/** Sicherung gegen Endlosschleifen, z. B. wenn alle Termine in Ferien fallen. */
const MAX_SCANNED = 5000;

/**
 * Vorkommen einer Serie im Bereich [rangeStart, rangeEnd], ohne die, die in
 * Schulferien fallen. Bei COUNT=n zählen nur Vorkommen außerhalb der Ferien —
 * die Serie läuft also so lange, bis n Termine stattgefunden haben.
 * Maßgeblich ist der lokale Tag des Treffers — derselbe, den
 * expandAppointments anzeigt (dort wird nur die Uhrzeit ersetzt).
 */
export function occurrencesSkippingHolidays(
  rule: RRule,
  rangeStart: Date,
  rangeEnd: Date,
  holidays: HolidayRange[]
): Date[] {
  const count = rule.options.count;
  const inHoliday = (d: Date) => isSchoolHoliday(localDateStr(d), holidays);

  if (!count) {
    return rule.between(rangeStart, rangeEnd, true).filter((d) => !inHoliday(d));
  }

  // COUNT ohne Ferien: Regel ohne COUNT ab DTSTART durchlaufen und selbst zählen
  const open = new RRule({ ...rule.origOptions, count: null });
  const result: Date[] = [];
  let kept = 0;
  let scanned = 0;
  open.all((d) => {
    if (++scanned > MAX_SCANNED || d > rangeEnd) return false;
    if (inHoliday(d)) return true;
    kept++;
    if (d >= rangeStart) result.push(d);
    return kept < count;
  });
  return result;
}
