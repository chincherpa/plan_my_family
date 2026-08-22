import { describe, it, expect } from "vitest";
import { findVehicleConflicts, checkVehicleConflict } from "@/lib/utils/conflicts";
import { appointment, occurrence, d } from "@/lib/utils/__fixtures__/calendar";

const CAR = "vehicle-car";
const BIKE = "vehicle-bike";

describe("findVehicleConflicts", () => {
  const window = { start: d("2026-06-01"), end: d("2026-06-08") };

  function find(occs: ReturnType<typeof occurrence>[]) {
    return findVehicleConflicts(occs, window.start, window.end);
  }

  it("reports nothing when the same vehicle is used at different times", () => {
    const a = occurrence(appointment({ vehicle_id: CAR, start: "2026-06-02 08:00", end: "2026-06-02 09:00" }));
    const b = occurrence(appointment({ vehicle_id: CAR, start: "2026-06-02 10:00", end: "2026-06-02 11:00" }));

    expect(find([a, b])).toEqual([]);
  });

  it("reports nothing when overlapping appointments use different vehicles", () => {
    const a = occurrence(appointment({ vehicle_id: CAR, start: "2026-06-02 08:00", end: "2026-06-02 10:00" }));
    const b = occurrence(appointment({ vehicle_id: BIKE, start: "2026-06-02 09:00", end: "2026-06-02 11:00" }));

    expect(find([a, b])).toEqual([]);
  });

  it("reports a double booking of the same vehicle", () => {
    const a = occurrence(appointment({ vehicle_id: CAR, title: "Training", start: "2026-06-02 08:00", end: "2026-06-02 10:00" }));
    const b = occurrence(appointment({ vehicle_id: CAR, title: "Arzt", start: "2026-06-02 09:00", end: "2026-06-02 11:00" }));

    const conflicts = find([a, b]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].vehicleId).toBe(CAR);
    expect(conflicts[0].start).toEqual(d("2026-06-02 09:00"));
    expect([conflicts[0].a.appointment.title, conflicts[0].b.appointment.title].sort()).toEqual([
      "Arzt",
      "Training",
    ]);
  });

  it("counts travel time as occupying the vehicle", () => {
    // Back to back on the clock, but the second one's 30 minutes of travel
    // start while the first is still driving home.
    const a = occurrence(
      appointment({ vehicle_id: CAR, start: "2026-06-02 08:00", end: "2026-06-02 10:00", travel_after_min: 30 })
    );
    const b = occurrence(
      appointment({ vehicle_id: CAR, start: "2026-06-02 10:00", end: "2026-06-02 11:00", travel_before_min: 30 })
    );

    expect(find([a, b])).toHaveLength(1);
  });

  it("does not flag two occurrences of the same series against each other", () => {
    // A long daily series can have overlapping occurrences; that is one
    // appointment reusing its own vehicle, not a conflict between two.
    const appt = appointment({ id: "series", vehicle_id: CAR });
    const first = occurrence(appt, {
      key: "series-1",
      occurrenceStart: d("2026-06-02 08:00"),
      occurrenceEnd: d("2026-06-02 12:00"),
      travelStart: d("2026-06-02 08:00"),
      travelEnd: d("2026-06-02 12:00"),
    });
    const second = occurrence(appt, {
      key: "series-2",
      occurrenceStart: d("2026-06-02 10:00"),
      occurrenceEnd: d("2026-06-02 14:00"),
      travelStart: d("2026-06-02 10:00"),
      travelEnd: d("2026-06-02 14:00"),
    });

    expect(find([first, second])).toEqual([]);
  });

  it("ignores appointments without a vehicle", () => {
    const a = occurrence(appointment({ start: "2026-06-02 08:00", end: "2026-06-02 10:00" }));
    const b = occurrence(appointment({ start: "2026-06-02 09:00", end: "2026-06-02 11:00" }));

    expect(find([a, b])).toEqual([]);
  });

  it("ignores deleted appointments", () => {
    const a = occurrence(appointment({ vehicle_id: CAR, start: "2026-06-02 08:00", end: "2026-06-02 10:00" }));
    const b = occurrence(
      appointment({ vehicle_id: CAR, start: "2026-06-02 09:00", end: "2026-06-02 11:00", is_deleted: true })
    );

    expect(find([a, b])).toEqual([]);
  });

  it("ignores conflicts that fall outside the window", () => {
    const a = occurrence(appointment({ vehicle_id: CAR, start: "2026-07-02 08:00", end: "2026-07-02 10:00" }));
    const b = occurrence(appointment({ vehicle_id: CAR, start: "2026-07-02 09:00", end: "2026-07-02 11:00" }));

    expect(find([a, b])).toEqual([]);
  });

  it("returns conflicts ordered by when they start", () => {
    const mk = (start: string, end: string) =>
      occurrence(appointment({ vehicle_id: CAR, start, end }));
    const conflicts = find([
      mk("2026-06-05 08:00", "2026-06-05 10:00"),
      mk("2026-06-05 09:00", "2026-06-05 11:00"),
      mk("2026-06-02 08:00", "2026-06-02 10:00"),
      mk("2026-06-02 09:00", "2026-06-02 11:00"),
    ]);

    expect(conflicts).toHaveLength(2);
    expect(conflicts[0].start).toEqual(d("2026-06-02 09:00"));
    expect(conflicts[1].start).toEqual(d("2026-06-05 09:00"));
  });

  it("keeps conflicts on different vehicles apart", () => {
    const mk = (vehicle: string) =>
      occurrence(appointment({ vehicle_id: vehicle, start: "2026-06-02 08:00", end: "2026-06-02 10:00" }));
    const conflicts = find([mk(CAR), mk(CAR), mk(BIKE), mk(BIKE)]);

    expect(conflicts.map((c) => c.vehicleId).sort()).toEqual([BIKE, CAR]);
  });
});

describe("checkVehicleConflict", () => {
  const booked = appointment({
    id: "booked",
    title: "Schwimmkurs",
    vehicle_id: CAR,
    start: "2026-06-02 09:00",
    end: "2026-06-02 11:00",
  });

  it("finds the appointment already holding the vehicle", () => {
    const hit = checkVehicleConflict(CAR, d("2026-06-02 10:00"), d("2026-06-02 12:00"), 0, 0, [booked]);
    expect(hit?.title).toBe("Schwimmkurs");
  });

  it("returns null for a free slot", () => {
    expect(
      checkVehicleConflict(CAR, d("2026-06-02 12:00"), d("2026-06-02 13:00"), 0, 0, [booked])
    ).toBeNull();
  });

  it("returns null for a different vehicle", () => {
    expect(
      checkVehicleConflict(BIKE, d("2026-06-02 10:00"), d("2026-06-02 12:00"), 0, 0, [booked])
    ).toBeNull();
  });

  it("treats touching-but-not-overlapping times as free", () => {
    expect(
      checkVehicleConflict(CAR, d("2026-06-02 11:00"), d("2026-06-02 12:00"), 0, 0, [booked])
    ).toBeNull();
  });

  it("counts the requested travel time when looking for an overlap", () => {
    // 11:30–12:30 is clear, but 45 minutes of travel before it reaches back
    // into the booked slot.
    expect(
      checkVehicleConflict(CAR, d("2026-06-02 11:30"), d("2026-06-02 12:30"), 45, 0, [booked])
    ).not.toBeNull();
  });

  it("counts the other appointment's travel time too", () => {
    const withTravel = { ...booked, travel_after_min: 60 };
    expect(
      checkVehicleConflict(CAR, d("2026-06-02 11:30"), d("2026-06-02 12:30"), 0, 0, [withTravel])
    ).not.toBeNull();
  });

  it("ignores the appointment currently being edited", () => {
    expect(
      checkVehicleConflict(CAR, d("2026-06-02 09:00"), d("2026-06-02 11:00"), 0, 0, [booked], "booked")
    ).toBeNull();
  });

  it("ignores the edited series' own exception rows", () => {
    // Editing a series must not report the series' own moved occurrence as
    // the thing blocking the vehicle.
    const exception = appointment({
      id: "exception",
      recurrence_parent_id: "booked",
      vehicle_id: CAR,
      start: "2026-06-02 09:00",
      end: "2026-06-02 11:00",
    });
    expect(
      checkVehicleConflict(
        CAR, d("2026-06-02 09:00"), d("2026-06-02 11:00"), 0, 0, [booked, exception], "booked"
      )
    ).toBeNull();
  });

  it("sees occurrences of a recurring series, not just its first date", () => {
    const series = appointment({
      id: "series",
      title: "Musikschule",
      vehicle_id: CAR,
      start: "2026-06-01 15:00",
      end: "2026-06-01 16:00",
      recurrence_rule: "FREQ=WEEKLY;DTSTART=20260601T150000Z",
    });
    // Three weeks later — only reachable by expanding the rule.
    const hit = checkVehicleConflict(
      CAR, d("2026-06-22 15:30"), d("2026-06-22 16:30"), 0, 0, [series]
    );
    expect(hit?.title).toBe("Musikschule");
  });

  it("ignores deleted appointments", () => {
    const deleted = { ...booked, is_deleted: true };
    expect(
      checkVehicleConflict(CAR, d("2026-06-02 10:00"), d("2026-06-02 12:00"), 0, 0, [deleted])
    ).toBeNull();
  });

  it("returns null instead of throwing on an invalid date", () => {
    // The form calls this on every keystroke, so half-typed input arrives here.
    expect(
      checkVehicleConflict(CAR, new Date("nonsense"), d("2026-06-02 12:00"), 0, 0, [booked])
    ).toBeNull();
    expect(
      checkVehicleConflict(CAR, d("2026-06-02 10:00"), new Date("nonsense"), 0, 0, [booked])
    ).toBeNull();
  });
});
