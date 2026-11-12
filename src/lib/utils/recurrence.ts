import { RRule } from "rrule";
import type { AppointmentWithParticipants } from "@/lib/supabase/types";
import { addMinutes, localDateStr, startOfDay } from "@/lib/utils";
import { occurrencesSkippingHolidays, type HolidayRange } from "@/lib/utils/schoolHolidays";

/**
 * Local "YYYY-MM-DD" key used for `exception_date` matching.
 * Must be used both when expanding occurrences and when creating
 * exception rows, otherwise UTC offsets shift the date.
 */
export function occurrenceDateKey(date: Date): string {
  return localDateStr(date);
}

/**
 * Ende eines ganztägigen Termins: 23:59:59 am Starttag + Anzahl Folgetage.
 * Die Zahl der Folgetage kommt aus dem ursprünglichen Termin. Nicht über die
 * Dauer in Millisekunden rechnen: Am Tag der Zeitumstellung hat der Tag
 * 23 bzw. 25 Stunden, das Ende fiele sonst auf den Folgetag oder davor.
 */
export function allDayEnd(start: Date, origStart: Date, origEnd: Date): Date {
  const days = Math.round((startOfDay(origEnd).getTime() - startOfDay(origStart).getTime()) / 86_400_000);
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + days, 23, 59, 59, 0);
}

export interface AppointmentOccurrence {
  key: string; // unique key for rendering
  appointment: AppointmentWithParticipants;
  occurrenceStart: Date;
  occurrenceEnd: Date;
  travelStart: Date;
  travelEnd: Date;
  isRecurringInstance: boolean;
}

/**
 * Expand appointments (including recurring ones) into occurrences
 * within the given date range.
 *
 * Series flagged `skip_school_holidays` drop occurrences on days inside
 * `holidays`; with COUNT those days do not count towards the total.
 */
export function expandAppointments(
  appointments: AppointmentWithParticipants[],
  rangeStart: Date,
  rangeEnd: Date,
  holidays: HolidayRange[] = []
): AppointmentOccurrence[] {
  const results: AppointmentOccurrence[] = [];

  // Collect exception/deleted dates per parent id
  const exceptions = new Map<string, Set<string>>();
  // Ausnahmetermine (geänderte Vorkommen) je Serie, einmal gruppiert
  const modifiedByParent = new Map<string, AppointmentWithParticipants[]>();
  for (const appt of appointments) {
    if (appt.recurrence_parent_id && !appt.is_deleted) {
      const list = modifiedByParent.get(appt.recurrence_parent_id) ?? [];
      list.push(appt);
      modifiedByParent.set(appt.recurrence_parent_id, list);
    }
    if (appt.recurrence_parent_id && appt.exception_date) {
      const set = exceptions.get(appt.recurrence_parent_id) ?? new Set();
      set.add(appt.exception_date);
      exceptions.set(appt.recurrence_parent_id, set);
    }
  }

  for (const appt of appointments) {
    if (appt.is_deleted && !appt.recurrence_parent_id) continue;
    if (appt.recurrence_parent_id) continue; // handled via parent expansion

    const start = new Date(appt.start_time);
    const end = new Date(appt.end_time);
    const durationMs = end.getTime() - start.getTime();

    if (appt.recurrence_rule) {
      // Expand recurring event
      try {
        const rule = RRule.fromString(appt.recurrence_rule);
        // Früher suchen: ein Vorkommen kann vor dem Bereich starten und hineinragen
        // (Nachtfahrt, Fahrzeit danach). Der Anker liegt auf Mittag, daher +1 Tag Puffer.
        const lookbackMs = durationMs + appt.travel_after_min * 60_000 + 24 * 3600_000;
        const searchStart = new Date(rangeStart.getTime() - lookbackMs);
        const occurrenceDates =
          appt.skip_school_holidays && holidays.length > 0
            ? occurrencesSkippingHolidays(rule, searchStart, rangeEnd, holidays)
            : rule.between(searchStart, rangeEnd, true);
        const exceptedDates = exceptions.get(appt.id) ?? new Set();

        for (const occDate of occurrenceDates) {
          const occStart = new Date(occDate);
          // Preserve original time if rule doesn't include time
          occStart.setHours(start.getHours(), start.getMinutes(), 0, 0);
          const occEnd = appt.is_all_day
            ? allDayEnd(occStart, start, end)
            : new Date(occStart.getTime() + durationMs);

          // Occurrence replaced or deleted via exception row?
          if (exceptedDates.has(occurrenceDateKey(occStart))) continue;

          // Nur Vorkommen, die den Bereich überlappen (wie bei Einzelterminen)
          if (
            !(
              addMinutes(occStart, -appt.travel_before_min) < rangeEnd &&
              addMinutes(occEnd, appt.travel_after_min) > rangeStart
            )
          )
            continue;

          results.push(buildOccurrence(appt, occStart, occEnd, true));
        }
      } catch {
        // Invalid rule, treat as single
        if (start >= rangeStart && start <= rangeEnd) {
          results.push(buildOccurrence(appt, start, end, false));
        }
      }
    } else {
      // Single occurrence
      if (start < rangeEnd && end > rangeStart) {
        results.push(buildOccurrence(appt, start, end, false));
      }
    }

    // Add exceptions (modified instances)
    const parentExceptions = modifiedByParent.get(appt.id) ?? [];
    for (const exc of parentExceptions) {
      const excStart = new Date(exc.start_time);
      const excEnd = new Date(exc.end_time);
      if (excStart < rangeEnd && excEnd > rangeStart) {
        results.push(buildOccurrence(exc, excStart, excEnd, true));
      }
    }
  }

  return results;
}

function buildOccurrence(
  appt: AppointmentWithParticipants,
  occStart: Date,
  occEnd: Date,
  isRecurring: boolean
): AppointmentOccurrence {
  return {
    key: `${appt.id}-${occStart.toISOString()}`,
    appointment: appt,
    occurrenceStart: occStart,
    occurrenceEnd: occEnd,
    travelStart: addMinutes(occStart, -appt.travel_before_min),
    travelEnd: addMinutes(occEnd, appt.travel_after_min),
    isRecurringInstance: isRecurring,
  };
}

/**
 * DTSTART der Regel: der lokale Mittag des Starttags statt der echten Startzeit.
 *
 * rrule wertet Wochentage in UTC aus, `expandAppointments` übersetzt die Treffer
 * aber in lokale Tage. Bei Terminen kurz nach Mitternacht (und ganztägigen, die
 * um 00:00 beginnen) liegt das UTC-Datum vor dem lokalen — „Mo/Mi“ würde dann
 * als Di/Do angezeigt. Mittags stimmen beide Daten in jeder Zeitzone überein.
 * Die Uhrzeit des Termins kommt ohnehin aus start_time, nicht aus der Regel.
 */
export function ruleAnchor(start: Date): Date {
  return new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12, 0, 0, 0);
}

export type RecurrenceFreqKey =
  | "daily"
  | "weekdays"
  | "weekend"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "yearly"
  | "custom";

export type RecurrenceEndSpec =
  | { mode: "none" }
  | { mode: "count"; count: number }
  | { mode: "until"; date: Date };

/**
 * Der eine Erzeuger für Serienregeln (Kalenderformular, Jahrestage).
 * Verankert DTSTART über `ruleAnchor`; am 29. Februar jährlich fällt der Termin
 * in Nicht-Schaltjahren auf den 28.
 */
export function buildRecurrenceRule(opts: {
  freq: RecurrenceFreqKey;
  start: Date;
  end: RecurrenceEndSpec;
  /** Wochentage (rrule: 0 = Montag) für freq "custom" */
  customDays?: number[];
}): string {
  const { freq, start, end, customDays = [] } = opts;
  const freqMap = {
    daily: RRule.DAILY,
    weekdays: RRule.WEEKLY,
    weekend: RRule.WEEKLY,
    weekly: RRule.WEEKLY,
    biweekly: RRule.WEEKLY,
    monthly: RRule.MONTHLY,
    yearly: RRule.YEARLY,
    custom: RRule.WEEKLY,
  };
  const leapDay = freq === "yearly" && start.getMonth() === 1 && start.getDate() === 29;
  return new RRule({
    freq: freqMap[freq],
    dtstart: ruleAnchor(start),
    ...(freq === "biweekly" && { interval: 2 }),
    ...(freq === "weekdays" && { byweekday: [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR] }),
    ...(freq === "weekend" && { byweekday: [RRule.SA, RRule.SU] }),
    ...(freq === "custom" && { byweekday: [...customDays].sort() }),
    ...(leapDay && { bymonth: 2, bymonthday: -1 }),
    ...(end.mode === "count" && { count: end.count }),
    ...(end.mode === "until" && { until: end.date }),
  }).toString();
}
