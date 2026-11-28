import type { FamilyMember } from "@/lib/supabase/types";
import type { AppointmentOccurrence } from "@/lib/utils/recurrence";
import { placementsFor, type DayData } from "@/components/calendar/model";

/** One appointment in a member's list on the dashboard. */
export interface DashboardEntry {
  occ: AppointmentOccurrence;
  /** false = the member only takes part (owner is someone else / whole family) */
  isOwner: boolean;
}

export interface MemberDay {
  member: FamilyMember;
  entries: DashboardEntry[];
}

/**
 * Today's appointments per family member: all-day appointments first, then
 * timed ones by start. Ereignisse (Geburtstage …) belong to nobody and are
 * returned separately by the caller from `data.banner`.
 */
export function appointmentsByMember(data: DayData, members: FamilyMember[]): MemberDay[] {
  const allDay = data.banner.filter((occ) => !occ.appointment.is_event);
  const ordered = [...allDay, ...data.timed];
  const byMember = new Map<string, DashboardEntry[]>(members.map((m) => [m.id, []]));
  for (const occ of ordered) {
    for (const { columnId, isOwner } of placementsFor(occ, members)) {
      byMember.get(columnId)?.push({ occ, isOwner });
    }
  }
  return members.map((member) => ({ member, entries: byMember.get(member.id) ?? [] }));
}

/** Over by `now`. All-day appointments count as past only once their day has ended. */
export function isPast(occ: AppointmentOccurrence, now: Date): boolean {
  return occ.occurrenceEnd.getTime() <= now.getTime();
}

/** Running right now. */
export function isOngoing(occ: AppointmentOccurrence, now: Date): boolean {
  return !occ.appointment.is_all_day && occ.occurrenceStart <= now && occ.occurrenceEnd > now;
}
