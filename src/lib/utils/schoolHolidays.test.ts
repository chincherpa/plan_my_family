import { describe, it, expect } from "vitest";
import { RRule } from "rrule";
import { expandAppointments, occurrenceDateKey } from "@/lib/utils/recurrence";
import { holidaysOn, isSchoolHoliday, type HolidayRange } from "@/lib/utils/schoolHolidays";
import { appointment, d } from "@/lib/utils/__fixtures__/calendar";

const herbst: HolidayRange = { name: "Herbstferien 2027", start_date: "2027-11-02", end_date: "2027-11-06" };
const holidays = [herbst];

/** Weekly on Tuesdays, DTSTART at local noon like the form writes it */
function tuesdays(extra: string): string {
  return new RRule({
    freq: RRule.WEEKLY,
    byweekday: [RRule.TU],
    dtstart: d("2027-10-19 12:00"),
    ...RRule.parseString(extra),
  }).toString();
}

const keys = (occs: { occurrenceStart: Date }[]) => occs.map((o) => occurrenceDateKey(o.occurrenceStart));

describe("isSchoolHoliday / holidaysOn", () => {
  it("treats both boundaries as inclusive", () => {
    expect(isSchoolHoliday("2027-11-01", holidays)).toBe(false);
    expect(isSchoolHoliday("2027-11-02", holidays)).toBe(true);
    expect(isSchoolHoliday("2027-11-06", holidays)).toBe(true);
    expect(isSchoolHoliday("2027-11-07", holidays)).toBe(false);
    expect(holidaysOn("2027-11-04", holidays)).toEqual([herbst]);
  });
});

describe("expandAppointments — skip_school_holidays", () => {
  const range: [Date, Date] = [d("2027-10-01"), d("2027-12-31")];

  it("drops occurrences inside the holidays", () => {
    const appt = appointment({
      start: "2027-10-19 16:00",
      end: "2027-10-19 17:00",
      recurrence_rule: tuesdays("UNTIL=20271116T225959Z"),
      skip_school_holidays: true,
    });
    expect(keys(expandAppointments([appt], ...range, holidays))).toEqual([
      "2027-10-19",
      "2027-10-26",
      // 2027-11-02 fällt in die Herbstferien
      "2027-11-09",
      "2027-11-16",
    ]);
  });

  it("does not count skipped occurrences towards COUNT", () => {
    const appt = appointment({
      start: "2027-10-19 16:00",
      end: "2027-10-19 17:00",
      recurrence_rule: tuesdays("COUNT=4"),
      skip_school_holidays: true,
    });
    expect(keys(expandAppointments([appt], ...range, holidays))).toEqual([
      "2027-10-19",
      "2027-10-26",
      "2027-11-09",
      "2027-11-16",
    ]);
  });

  it("respects the range for counted series", () => {
    const appt = appointment({
      start: "2027-10-19 16:00",
      end: "2027-10-19 17:00",
      recurrence_rule: tuesdays("COUNT=4"),
      skip_school_holidays: true,
    });
    expect(keys(expandAppointments([appt], d("2027-11-03"), d("2027-11-10"), holidays))).toEqual([
      "2027-11-09",
    ]);
  });

  it("leaves series without the flag untouched", () => {
    const appt = appointment({
      start: "2027-10-19 16:00",
      end: "2027-10-19 17:00",
      recurrence_rule: tuesdays("COUNT=4"),
    });
    expect(keys(expandAppointments([appt], ...range, holidays))).toEqual([
      "2027-10-19",
      "2027-10-26",
      "2027-11-02",
      "2027-11-09",
    ]);
  });

  it("never hides a single appointment", () => {
    const appt = appointment({
      start: "2027-11-03 16:00",
      end: "2027-11-03 17:00",
      skip_school_holidays: true,
    });
    expect(keys(expandAppointments([appt], ...range, holidays))).toEqual(["2027-11-03"]);
  });

  it("keeps the local day for all-day series anchored at noon", () => {
    // Mo/Mi/Fr, ganztägig — DTSTART mittags, Start 00:00 lokal
    const appt = appointment({
      start: "2027-11-01 00:00",
      end: "2027-11-01 23:59",
      is_all_day: true,
      recurrence_rule: new RRule({
        freq: RRule.WEEKLY,
        byweekday: [RRule.MO, RRule.WE, RRule.FR],
        dtstart: d("2027-11-01 12:00"),
        count: 3,
      }).toString(),
      skip_school_holidays: true,
    });
    expect(keys(expandAppointments([appt], ...range, holidays))).toEqual([
      "2027-11-01",
      "2027-11-08",
      "2027-11-10",
    ]);
  });
});
