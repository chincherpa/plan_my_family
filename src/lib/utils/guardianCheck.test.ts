import { describe, it, expect } from "vitest";
import { checkGuardianWarnings, getWarningsForMember } from "@/lib/utils/guardianCheck";
import {
  appointment,
  occurrence,
  member,
  participant,
  d,
  fmtRange,
} from "@/lib/utils/__fixtures__/calendar";

const mama = member({ id: "mama", name: "Mama", is_guardian: true });
const papa = member({ id: "papa", name: "Papa", is_guardian: true });
const tim = member({ id: "tim", name: "Tim", cannot_be_alone: true });
const lea = member({ id: "lea", name: "Lea", cannot_be_alone: true });

const DAY_START = d("2026-06-02");
const DAY_END = d("2026-06-03");

/** Warnings as "2026-06-02 09:00–11:00" strings, for readable assertions. */
function ranges(
  members: Parameters<typeof checkGuardianWarnings>[0],
  occurrences: Parameters<typeof checkGuardianWarnings>[1],
  start = DAY_START,
  end = DAY_END
): string[] {
  return checkGuardianWarnings(members, occurrences, start, end).map((w) =>
    fmtRange(w.startTime, w.endTime)
  );
}

describe("checkGuardianWarnings — nothing to check", () => {
  it("returns nothing when no member needs supervision", () => {
    const busy = occurrence(appointment({ owner_id: "mama", start: "2026-06-02 09:00", end: "2026-06-02 11:00" }));
    expect(ranges([mama, papa], [busy])).toEqual([]);
  });

  it("returns nothing when the family has no guardian at all", () => {
    // Nobody to be missing, so nothing to warn about — the family setup is
    // the problem, and that is not this function's job to report.
    const busy = occurrence(appointment({ owner_id: "tim", start: "2026-06-02 09:00", end: "2026-06-02 11:00" }));
    expect(ranges([tim], [busy])).toEqual([]);
  });

  it("returns nothing for a day without any appointments", () => {
    expect(ranges([mama, tim], [])).toEqual([]);
  });
});

describe("checkGuardianWarnings — a lone guardian leaving", () => {
  const guardianOut = () =>
    occurrence(
      appointment({ owner_id: "mama", title: "Sport", start: "2026-06-02 09:00", end: "2026-06-02 11:00" })
    );

  it("warns for exactly the time the only guardian is away", () => {
    expect(ranges([mama, tim], [guardianOut()])).toEqual(["2026-06-02 09:00–11:00"]);
  });

  it("names the member who would be left alone", () => {
    const [warning] = checkGuardianWarnings([mama, tim], [guardianOut()], DAY_START, DAY_END);
    expect(warning.memberId).toBe("tim");
    expect(warning.memberName).toBe("Tim");
  });

  it("does not warn when the dependent comes along as a participant", () => {
    const withTim = occurrence(
      appointment({
        owner_id: "mama",
        start: "2026-06-02 09:00",
        end: "2026-06-02 11:00",
        participants: [participant("tim")],
      })
    );
    expect(ranges([mama, tim], [withTim])).toEqual([]);
  });

  it("does not warn for a family outing", () => {
    const outing = occurrence(
      appointment({ is_all_family: true, start: "2026-06-02 09:00", end: "2026-06-02 11:00" })
    );
    expect(ranges([mama, tim], [outing])).toEqual([]);
  });

  it("does not warn while the dependent has an appointment of their own", () => {
    const guardianAway = guardianOut();
    const timAtSchool = occurrence(
      appointment({ owner_id: "tim", start: "2026-06-02 09:00", end: "2026-06-02 11:00" })
    );
    expect(ranges([mama, tim], [guardianAway, timAtSchool])).toEqual([]);
  });

  it("counts the guardian's travel time as being away", () => {
    const withTravel = occurrence(
      appointment({
        owner_id: "mama",
        start: "2026-06-02 09:00",
        end: "2026-06-02 11:00",
        travel_before_min: 30,
        travel_after_min: 30,
      })
    );
    expect(ranges([mama, tim], [withTravel])).toEqual(["2026-06-02 08:30–11:30"]);
  });

  it("does not treat an event as occupying the guardian", () => {
    // Birthdays and holidays are informational rows on the calendar; nobody
    // actually leaves the house for them.
    const birthday = occurrence(
      appointment({ owner_id: "mama", is_event: true, start: "2026-06-02 09:00", end: "2026-06-02 11:00" })
    );
    expect(ranges([mama, tim], [birthday])).toEqual([]);
  });
});

describe("checkGuardianWarnings — several guardians", () => {
  it("stays quiet while a second guardian is still free", () => {
    const mamaOut = occurrence(
      appointment({ owner_id: "mama", start: "2026-06-02 09:00", end: "2026-06-02 11:00" })
    );
    expect(ranges([mama, papa, tim], [mamaOut])).toEqual([]);
  });

  it("warns only for the overlap when both guardians are away", () => {
    const mamaOut = occurrence(
      appointment({ owner_id: "mama", start: "2026-06-02 09:00", end: "2026-06-02 12:00" })
    );
    const papaOut = occurrence(
      appointment({ owner_id: "papa", start: "2026-06-02 11:00", end: "2026-06-02 14:00" })
    );
    expect(ranges([mama, papa, tim], [mamaOut, papaOut])).toEqual(["2026-06-02 11:00–12:00"]);
  });

  it("counts a guardian as present when they are only a participant elsewhere", () => {
    // Papa is a participant on Mama's appointment, so he is out too.
    const bothOut = occurrence(
      appointment({
        owner_id: "mama",
        start: "2026-06-02 09:00",
        end: "2026-06-02 11:00",
        participants: [participant("papa")],
      })
    );
    expect(ranges([mama, papa, tim], [bothOut])).toEqual(["2026-06-02 09:00–11:00"]);
  });
});

describe("checkGuardianWarnings — intervals", () => {
  it("merges consecutive unsupervised slots into one interval", () => {
    const longOut = occurrence(
      appointment({ owner_id: "mama", start: "2026-06-02 08:00", end: "2026-06-02 17:00" })
    );
    expect(ranges([mama, tim], [longOut])).toEqual(["2026-06-02 08:00–17:00"]);
  });

  it("reports two separate intervals for two separate gaps", () => {
    const morning = occurrence(
      appointment({ owner_id: "mama", start: "2026-06-02 09:00", end: "2026-06-02 10:00" })
    );
    const afternoon = occurrence(
      appointment({ owner_id: "mama", start: "2026-06-02 14:00", end: "2026-06-02 15:00" })
    );
    expect(ranges([mama, tim], [morning, afternoon])).toEqual([
      "2026-06-02 09:00–10:00",
      "2026-06-02 14:00–15:00",
    ]);
  });

  it("rounds a gap outward to the surrounding half-hour slots", () => {
    // Supervision is evaluated in 30-minute slots, so 09:15–10:45 is
    // reported as 09:00–11:00. Erring wide is the safe direction here.
    const odd = occurrence(
      appointment({ owner_id: "mama", start: "2026-06-02 09:15", end: "2026-06-02 10:45" })
    );
    expect(ranges([mama, tim], [odd])).toEqual(["2026-06-02 09:00–11:00"]);
  });

  it("closes an interval that is still open at the end of the range", () => {
    const lateOut = occurrence(
      appointment({ owner_id: "mama", start: "2026-06-02 23:00", end: "2026-06-03 02:00" })
    );
    expect(ranges([mama, tim], [lateOut])).toEqual(["2026-06-02 23:00–00:00"]);
  });

  it("does not leak a gap into the following day", () => {
    const out = occurrence(
      appointment({ owner_id: "mama", start: "2026-06-02 09:00", end: "2026-06-02 11:00" })
    );
    const result = ranges([mama, tim], [out], d("2026-06-01"), d("2026-06-04"));
    expect(result).toEqual(["2026-06-02 09:00–11:00"]);
  });
});

describe("checkGuardianWarnings — several dependents", () => {
  it("reports each dependent separately", () => {
    const out = occurrence(
      appointment({ owner_id: "mama", start: "2026-06-02 09:00", end: "2026-06-02 11:00" })
    );
    const warnings = checkGuardianWarnings([mama, tim, lea], [out], DAY_START, DAY_END);

    expect(warnings.map((w) => w.memberId).sort()).toEqual(["lea", "tim"]);
  });

  it("warns only for the dependent left behind", () => {
    const out = occurrence(
      appointment({
        owner_id: "mama",
        start: "2026-06-02 09:00",
        end: "2026-06-02 11:00",
        participants: [participant("lea")],
      })
    );
    const warnings = checkGuardianWarnings([mama, tim, lea], [out], DAY_START, DAY_END);

    expect(warnings).toHaveLength(1);
    expect(warnings[0].memberId).toBe("tim");
  });
});

describe("getWarningsForMember", () => {
  it("keeps only the requested member's warnings", () => {
    const out = occurrence(
      appointment({ owner_id: "mama", start: "2026-06-02 09:00", end: "2026-06-02 11:00" })
    );
    const all = checkGuardianWarnings([mama, tim, lea], [out], DAY_START, DAY_END);

    expect(getWarningsForMember("tim", all).every((w) => w.memberId === "tim")).toBe(true);
    expect(getWarningsForMember("tim", all)).toHaveLength(1);
    expect(getWarningsForMember("mama", all)).toEqual([]);
  });
});
