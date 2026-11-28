import type { AppointmentWithParticipants, FamilyMember } from "@/lib/supabase/types";
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

/** Today's appointments, split into one list per member and one for the whole family. */
export interface DashboardDay {
  members: MemberDay[];
  /** Appointments flagged "Familienausflug / Alle" — shown once, not per member */
  family: DashboardEntry[];
}

/**
 * Today's appointments per family member: all-day appointments first, then
 * timed ones by start. All-family appointments go to `family` instead of
 * every member's list. Ereignisse (Geburtstage …) belong to nobody and are
 * returned separately by the caller from `data.banner`.
 */
export function appointmentsByMember(data: DayData, members: FamilyMember[]): DashboardDay {
  const allDay = data.banner.filter((occ) => !occ.appointment.is_event);
  const ordered = [...allDay, ...data.timed];
  const byMember = new Map<string, DashboardEntry[]>(members.map((m) => [m.id, []]));
  const family: DashboardEntry[] = [];
  for (const occ of ordered) {
    if (occ.appointment.is_all_family) {
      family.push({ occ, isOwner: true });
      continue;
    }
    for (const { columnId, isOwner } of placementsFor(occ, members)) {
      byMember.get(columnId)?.push({ occ, isOwner });
    }
  }
  return {
    members: members.map((member) => ({ member, entries: byMember.get(member.id) ?? [] })),
    family,
  };
}

/**
 * Who takes part in an all-family appointment, or null when it is everyone
 * (no participants stored — legacy rows — or every member listed).
 */
export function familyParticipants(
  appt: AppointmentWithParticipants,
  members: FamilyMember[]
): FamilyMember[] | null {
  if (appt.participants.length === 0) return null;
  const ids = new Set(appt.participants.map((p) => p.member_id));
  const taking = members.filter((m) => ids.has(m.id));
  return taking.length === members.length ? null : taking;
}

/** Over by `now`. All-day appointments count as past only once their day has ended. */
export function isPast(occ: AppointmentOccurrence, now: Date): boolean {
  return occ.occurrenceEnd.getTime() <= now.getTime();
}

/** Running right now. */
export function isOngoing(occ: AppointmentOccurrence, now: Date): boolean {
  return !occ.appointment.is_all_day && occ.occurrenceStart <= now && occ.occurrenceEnd > now;
}

/** Whole minutes as "2h 23′", "2h" or "5′". */
function formatMinutes(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (h === 0) return `${min}′`;
  return min === 0 ? `${h}h` : `${h}h ${min}′`;
}

/** Minutes from `now` until `until`, partial minutes rounded up; null if not ahead. */
function minutesUntil(until: Date, now: Date): number | null {
  const ms = until.getTime() - now.getTime();
  return ms > 0 ? Math.ceil(ms / 60_000) : null;
}

/**
 * Time left until an appointment starts, e.g. "in 2h 23′" or "in 5′";
 * null once it has started. Partial minutes round up, so the label never
 * says "in 0′" while the appointment is still ahead.
 */
export function formatCountdown(start: Date, now: Date): string | null {
  const min = minutesUntil(start, now);
  return min === null ? null : `in ${formatMinutes(min)}`;
}

/** How long a running appointment still lasts, e.g. "noch 35′"; null once it is over. */
export function formatRemaining(end: Date, now: Date): string | null {
  const min = minutesUntil(end, now);
  return min === null ? null : `noch ${formatMinutes(min)}`;
}
