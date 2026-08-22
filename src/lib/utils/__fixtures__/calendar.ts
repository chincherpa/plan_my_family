/**
 * Test-only builders. Not imported by application code.
 *
 * Everything here works in local time on purpose: the domain logic does too
 * (startOfDay, localDateStr, setHours), and `pnpm test` pins TZ=Europe/Berlin
 * so these dates mean the same thing on every machine and in CI.
 */
import type {
  AppointmentWithParticipants,
  AppointmentParticipant,
  FamilyMember,
} from "@/lib/supabase/types";
import type { AppointmentOccurrence } from "@/lib/utils/recurrence";
import { addMinutes } from "@/lib/utils";

/** `d("2026-06-01 09:30")` → that instant in local time. */
export function d(value: string): Date {
  const [date, time = "00:00"] = value.split(" ");
  const [y, m, day] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  return new Date(y, m - 1, day, h, min, 0, 0);
}

let seq = 0;

export function member(overrides: Partial<FamilyMember> = {}): FamilyMember {
  return {
    id: `member-${++seq}`,
    family_id: "family-1",
    name: "Member",
    color: "#3b82f6",
    cannot_be_alone: false,
    is_guardian: false,
    user_id: null,
    sort_order: 0,
    created_at: d("2026-01-01").toISOString(),
    ...overrides,
  };
}

export function participant(
  memberId: string,
  isSupervisor = false
): AppointmentParticipant {
  return { appointment_id: "", member_id: memberId, is_supervisor: isSupervisor };
}

/**
 * `start`/`end` are given as local-time strings and stored the way Supabase
 * returns them — ISO strings in the `start_time`/`end_time` columns.
 */
export function appointment(
  overrides: Partial<Omit<AppointmentWithParticipants, "start_time" | "end_time">> & {
    start?: string;
    end?: string;
  } = {}
): AppointmentWithParticipants {
  const { start = "2026-06-01 09:00", end = "2026-06-01 10:00", ...rest } = overrides;
  return {
    id: `appt-${++seq}`,
    family_id: "family-1",
    title: "Termin",
    notes: null,
    start_time: d(start).toISOString(),
    end_time: d(end).toISOString(),
    travel_before_min: 0,
    travel_after_min: 0,
    vehicle_id: null,
    owner_id: null,
    is_all_family: false,
    is_event: false,
    is_all_day: false,
    recurrence_rule: null,
    recurrence_parent_id: null,
    exception_date: null,
    is_deleted: false,
    color: null,
    created_at: d("2026-01-01").toISOString(),
    participants: [],
    ...rest,
  };
}

/**
 * Build an occurrence directly, mirroring what expandAppointments produces
 * for a non-recurring appointment. Used by the guardian and conflict tests so
 * a failure there points at those modules rather than at the expander.
 */
export function occurrence(
  appt: AppointmentWithParticipants,
  overrides: Partial<AppointmentOccurrence> = {}
): AppointmentOccurrence {
  const occurrenceStart = new Date(appt.start_time);
  const occurrenceEnd = new Date(appt.end_time);
  return {
    key: `${appt.id}-${occurrenceStart.toISOString()}`,
    appointment: appt,
    occurrenceStart,
    occurrenceEnd,
    travelStart: addMinutes(occurrenceStart, -appt.travel_before_min),
    travelEnd: addMinutes(occurrenceEnd, appt.travel_after_min),
    isRecurringInstance: false,
    ...overrides,
  };
}

/** Readable assertion output: "2026-06-01 09:00–11:30". */
export function fmtRange(start: Date, end: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const day = `${start.getFullYear()}-${p(start.getMonth() + 1)}-${p(start.getDate())}`;
  return `${day} ${p(start.getHours())}:${p(start.getMinutes())}–${p(end.getHours())}:${p(end.getMinutes())}`;
}
