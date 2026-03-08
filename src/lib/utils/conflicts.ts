import type { AppointmentWithParticipants } from "@/lib/supabase/types";
import { addMinutes } from "@/lib/utils";

/**
 * Check if a vehicle is already used in the given time range
 * (excluding a specific appointment by id)
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
  const blockStart = addMinutes(startTime, -travelBeforeMin);
  const blockEnd = addMinutes(endTime, travelAfterMin);

  for (const appt of appointments) {
    if (appt.id === excludeId) continue;
    if (appt.vehicle_id !== vehicleId) continue;
    if (appt.is_deleted) continue;

    const apptStart = addMinutes(new Date(appt.start_time), -appt.travel_before_min);
    const apptEnd = addMinutes(new Date(appt.end_time), appt.travel_after_min);

    // Overlap check
    if (blockStart < apptEnd && blockEnd > apptStart) {
      return appt;
    }
  }
  return null;
}
