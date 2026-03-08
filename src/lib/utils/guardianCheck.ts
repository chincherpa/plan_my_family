import type { FamilyMember, AppointmentWithParticipants } from "@/lib/supabase/types";
import { addMinutes } from "@/lib/utils";

export interface GuardianWarning {
  memberId: string;
  memberName: string;
  startTime: Date;
  endTime: Date;
}

/**
 * Check for periods where a "cannot_be_alone" member has no supervision.
 * Returns warning intervals for the given time range.
 */
export function checkGuardianWarnings(
  members: FamilyMember[],
  appointments: AppointmentWithParticipants[],
  rangeStart: Date,
  rangeEnd: Date
): GuardianWarning[] {
  const warnings: GuardianWarning[] = [];

  const dependents = members.filter((m) => m.cannot_be_alone);
  const guardians = members.filter((m) => m.is_guardian);

  if (dependents.length === 0 || guardians.length === 0) return warnings;

  // Check in 15-min slots
  const SLOT_MS = 15 * 60 * 1000;
  const activeAppointments = appointments.filter((a) => !a.is_deleted);

  for (const dependent of dependents) {
    let warningStart: Date | null = null;

    let cursor = new Date(rangeStart);
    while (cursor < rangeEnd) {
      const slotEnd = new Date(cursor.getTime() + SLOT_MS);

      const isSupervised = isSlotSupervised(
        dependent,
        guardians,
        activeAppointments,
        cursor,
        slotEnd
      );

      if (!isSupervised) {
        if (!warningStart) warningStart = new Date(cursor);
      } else {
        if (warningStart) {
          warnings.push({
            memberId: dependent.id,
            memberName: dependent.name,
            startTime: warningStart,
            endTime: new Date(cursor),
          });
          warningStart = null;
        }
      }

      cursor = slotEnd;
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

function isSlotSupervised(
  dependent: FamilyMember,
  guardians: FamilyMember[],
  appointments: AppointmentWithParticipants[],
  slotStart: Date,
  slotEnd: Date
): boolean {
  // Dependent has own appointment in this slot → supervised
  const dependentHasAppt = appointments.some((a) => {
    if (a.owner_id !== dependent.id && !a.participants.some((p) => p.member_id === dependent.id))
      return false;
    const start = new Date(a.start_time);
    const end = new Date(a.end_time);
    return start < slotEnd && end > slotStart;
  });
  if (dependentHasAppt) return true;

  // Check each guardian
  for (const guardian of guardians) {
    const guardianAppts = appointments.filter((a) => {
      const start = new Date(a.start_time);
      const end = new Date(a.end_time);
      if (!(start < slotEnd && end > slotStart)) return false;
      return a.owner_id === guardian.id || a.participants.some((p) => p.member_id === guardian.id);
    });

    if (guardianAppts.length === 0) {
      // Guardian is free → dependent is supervised
      return true;
    }

    // Guardian has appointment — does it include the dependent?
    const dependentIsIncluded = guardianAppts.some(
      (a) =>
        a.is_all_family ||
        a.participants.some((p) => p.member_id === dependent.id)
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
