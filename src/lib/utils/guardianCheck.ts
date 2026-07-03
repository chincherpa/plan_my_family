import type { FamilyMember } from "@/lib/supabase/types";
import { startOfDay } from "@/lib/utils";
import type { AppointmentOccurrence } from "@/lib/utils/recurrence";

export interface GuardianWarning {
  memberId: string;
  memberName: string;
  startTime: Date;
  endTime: Date;
}

const SLOT_MS = 30 * 60 * 1000;

/**
 * Check for periods where a "cannot_be_alone" member has no supervision.
 * Works on expanded occurrences, so recurring appointments are covered.
 * Returns warning intervals for the given time range.
 */
export function checkGuardianWarnings(
  members: FamilyMember[],
  occurrences: AppointmentOccurrence[],
  rangeStart: Date,
  rangeEnd: Date
): GuardianWarning[] {
  const warnings: GuardianWarning[] = [];

  const dependents = members.filter((m) => m.cannot_be_alone);
  const guardians = members.filter((m) => m.is_guardian);

  if (dependents.length === 0 || guardians.length === 0) return warnings;

  // Bucket occurrences by day (travel-inclusive span) so days without
  // appointments can be skipped wholesale — the range spans ~2 years.
  const byDay = new Map<string, AppointmentOccurrence[]>();
  for (const occ of occurrences) {
    if (occ.appointment.is_event) continue; // events are informational only
    const cur = startOfDay(occ.travelStart);
    const last = startOfDay(occ.travelEnd);
    while (cur <= last) {
      const key = cur.toDateString();
      const list = byDay.get(key);
      if (list) list.push(occ);
      else byDay.set(key, [occ]);
      cur.setDate(cur.getDate() + 1);
    }
  }

  for (const dependent of dependents) {
    let warningStart: Date | null = null;

    const day = startOfDay(rangeStart);
    while (day < rangeEnd) {
      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);
      const dayOccs = byDay.get(day.toDateString());

      if (!dayOccs || dayOccs.length === 0) {
        // No appointments → every guardian is free → supervised
        if (warningStart) {
          warnings.push({
            memberId: dependent.id,
            memberName: dependent.name,
            startTime: warningStart,
            endTime: new Date(Math.max(day.getTime(), rangeStart.getTime())),
          });
          warningStart = null;
        }
      } else {
        let cursor = new Date(Math.max(day.getTime(), rangeStart.getTime()));
        const dayEnd = new Date(Math.min(nextDay.getTime(), rangeEnd.getTime()));
        while (cursor < dayEnd) {
          const slotEnd = new Date(cursor.getTime() + SLOT_MS);

          if (!isSlotSupervised(dependent, guardians, dayOccs, cursor, slotEnd)) {
            if (!warningStart) warningStart = new Date(cursor);
          } else if (warningStart) {
            warnings.push({
              memberId: dependent.id,
              memberName: dependent.name,
              startTime: warningStart,
              endTime: new Date(cursor),
            });
            warningStart = null;
          }

          cursor = slotEnd;
        }
      }

      day.setDate(day.getDate() + 1);
    }

    if (warningStart) {
      warnings.push({
        memberId: dependent.id,
        memberName: dependent.name,
        startTime: warningStart,
        endTime: new Date(rangeEnd),
      });
    }
  }

  return warnings;
}

function involves(occ: AppointmentOccurrence, memberId: string): boolean {
  return (
    occ.appointment.is_all_family ||
    occ.appointment.owner_id === memberId ||
    occ.appointment.participants.some((p) => p.member_id === memberId)
  );
}

function isSlotSupervised(
  dependent: FamilyMember,
  guardians: FamilyMember[],
  occurrences: AppointmentOccurrence[],
  slotStart: Date,
  slotEnd: Date
): boolean {
  // Dependent has own appointment in this slot → supervised
  const dependentHasAppt = occurrences.some(
    (occ) =>
      involves(occ, dependent.id) &&
      occ.occurrenceStart < slotEnd &&
      occ.occurrenceEnd > slotStart
  );
  if (dependentHasAppt) return true;

  // Check each guardian
  for (const guardian of guardians) {
    const guardianOccs = occurrences.filter(
      (occ) =>
        involves(occ, guardian.id) &&
        occ.travelStart < slotEnd &&
        occ.travelEnd > slotStart
    );

    if (guardianOccs.length === 0) {
      // Guardian is free → dependent is supervised
      return true;
    }

    // Guardian has appointment — does it include the dependent?
    const dependentIsIncluded = guardianOccs.some(
      (occ) =>
        occ.appointment.is_all_family ||
        occ.appointment.participants.some((p) => p.member_id === dependent.id)
    );
    if (dependentIsIncluded) return true;
  }

  return false;
}

/**
 * Get warning blocks for a specific member in a time range
 */
export function getWarningsForMember(
  memberId: string,
  warnings: GuardianWarning[]
): GuardianWarning[] {
  return warnings.filter((w) => w.memberId === memberId);
}
