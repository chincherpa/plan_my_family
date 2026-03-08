import { RRule } from "rrule";
import type { AppointmentWithParticipants } from "@/lib/supabase/types";
import { addMinutes } from "@/lib/utils";

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
 */
export function expandAppointments(
  appointments: AppointmentWithParticipants[],
  rangeStart: Date,
  rangeEnd: Date
): AppointmentOccurrence[] {
  const results: AppointmentOccurrence[] = [];

  // Collect exception/deleted dates per parent id
  const exceptions = new Map<string, Set<string>>();
  for (const appt of appointments) {
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
        const occurrenceDates = rule.between(rangeStart, rangeEnd, true);
        const exceptedDates = exceptions.get(appt.id) ?? new Set();

        for (const occDate of occurrenceDates) {
          const dateStr = occDate.toISOString().split("T")[0];
          if (exceptedDates.has(dateStr)) continue; // replaced by exception

          const occStart = new Date(occDate);
          // Preserve original time if rule doesn't include time
          occStart.setHours(start.getHours(), start.getMinutes(), 0, 0);
          const occEnd = new Date(occStart.getTime() + durationMs);

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
    const parentExceptions = appointments.filter(
      (a) => a.recurrence_parent_id === appt.id && !a.is_deleted
    );
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
