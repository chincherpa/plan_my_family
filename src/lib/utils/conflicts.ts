import type { AppointmentWithParticipants } from "@/lib/supabase/types";
import { addMinutes, startOfDay } from "@/lib/utils";
import { expandAppointments, type AppointmentOccurrence } from "@/lib/utils/recurrence";

export interface VehicleConflict {
  vehicleId: string;
  a: AppointmentOccurrence;
  b: AppointmentOccurrence;
  /** Start of the overlap — used for jump links */
  start: Date;
}

/**
 * Find all pairs of occurrences booking the same vehicle at overlapping
 * times (travel included) within the given window.
 */
export function findVehicleConflicts(
  occurrences: AppointmentOccurrence[],
  windowStart: Date,
  windowEnd: Date
): VehicleConflict[] {
  const byVehicle = new Map<string, AppointmentOccurrence[]>();
  for (const occ of occurrences) {
    const vid = occ.appointment.vehicle_id;
    if (!vid || occ.appointment.is_deleted) continue;
    if (occ.travelEnd <= windowStart || occ.travelStart >= windowEnd) continue;
    const list = byVehicle.get(vid);
    if (list) list.push(occ);
    else byVehicle.set(vid, [occ]);
  }

  const conflicts: VehicleConflict[] = [];
  for (const [vehicleId, occs] of byVehicle) {
    occs.sort((x, y) => x.travelStart.getTime() - y.travelStart.getTime());
    for (let i = 0; i < occs.length; i++) {
      for (let j = i + 1; j < occs.length; j++) {
        if (occs[j].travelStart >= occs[i].travelEnd) break; // sorted → no more overlaps
        if (occs[i].appointment.id === occs[j].appointment.id) continue;
        conflicts.push({
          vehicleId,
          a: occs[i],
          b: occs[j],
          start: occs[j].travelStart,
        });
      }
    }
  }
  return conflicts.sort((x, y) => x.start.getTime() - y.start.getTime());
}

/**
 * Check if a vehicle is already used in the given time range
 * (excluding a specific appointment by id).
 * Recurring appointments are expanded, so occurrences of a series
 * also block the vehicle.
 */
export function checkVehicleConflict(
  vehicleId: string,
  startTime: Date,
  endTime: Date,
  travelBeforeMin: number,
  travelAfterMin: number,
  appointments: AppointmentWithParticipants[],
  excludeId?: string
): AppointmentWithParticipants | null {
  if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) return null;

  const blockStart = addMinutes(startTime, -travelBeforeMin);
  const blockEnd = addMinutes(endTime, travelAfterMin);

  // Expand recurring series only across the window we are checking
  const windowStart = startOfDay(blockStart);
  const windowEnd = startOfDay(blockEnd);
  windowEnd.setDate(windowEnd.getDate() + 1);
  const occurrences = expandAppointments(appointments, windowStart, windowEnd);

  for (const occ of occurrences) {
    const appt = occ.appointment;
    if (appt.id === excludeId || appt.recurrence_parent_id === excludeId) continue;
    if (appt.vehicle_id !== vehicleId) continue;
    if (appt.is_deleted) continue;

    // Overlap check including travel times
    if (blockStart < occ.travelEnd && blockEnd > occ.travelStart) {
      return appt;
    }
  }
  return null;
}
