import { describe, it, expect } from "vitest";
import { RRule } from "rrule";
import {
  buildRecurrenceRule,
  expandAppointments,
  occurrenceDateKey,
  type RecurrenceEndSpec,
  type RecurrenceFreqKey,
} from "@/lib/utils/recurrence";
import { anniversaryRecord } from "@/lib/anniversaries";
import { appointment, d } from "@/lib/utils/__fixtures__/calendar";

describe("occurrenceDateKey", () => {
  it("uses the local day, not the UTC day", () => {
    // 23:30 local in Europe/Berlin is already the next day in UTC during
    // summer time. exception_date rows are written with this key, so a UTC
    // slip here would delete the wrong occurrence of a series.
    const lateEvening = d("2026-07-15 23:30");
    expect(lateEvening.toISOString().slice(0, 10)).toBe("2026-07-15");
    expect(occurrenceDateKey(lateEvening)).toBe("2026-07-15");

    const justBeforeMidnight = d("2026-07-15 23:59");
    expect(occurrenceDateKey(justBeforeMidnight)).toBe("2026-07-15");
    expect(occurrenceDateKey(d("2026-07-16 00:01"))).toBe("2026-07-16");
  });

  it("zero-pads month and day", () => {
    expect(occurrenceDateKey(d("2026-01-05 12:00"))).toBe("2026-01-05");
  });
});

describe("expandAppointments — single appointments", () => {
  it("includes an appointment that falls inside the range", () => {
    const appt = appointment({ start: "2026-06-10 09:00", end: "2026-06-10 10:00" });
    const result = expandAppointments([appt], d("2026-06-01"), d("2026-06-30 23:59"));

    expect(result).toHaveLength(1);
    expect(result[0].occurrenceStart).toEqual(d("2026-06-10 09:00"));
    expect(result[0].occurrenceEnd).toEqual(d("2026-06-10 10:00"));
    expect(result[0].isRecurringInstance).toBe(false);
  });

  it("excludes an appointment entirely outside the range", () => {
    const appt = appointment({ start: "2026-05-01 09:00", end: "2026-05-01 10:00" });
    expect(expandAppointments([appt], d("2026-06-01"), d("2026-06-30 23:59"))).toEqual([]);
  });

  it("includes an appointment that only overlaps the range edge", () => {
    // Starts before the window, ends inside it.
    const appt = appointment({ start: "2026-05-31 22:00", end: "2026-06-01 02:00" });
    expect(expandAppointments([appt], d("2026-06-01"), d("2026-06-30 23:59"))).toHaveLength(1);
  });

  it("derives travel start and end from the travel minutes", () => {
    const appt = appointment({
      start: "2026-06-10 09:00",
      end: "2026-06-10 10:00",
      travel_before_min: 30,
      travel_after_min: 15,
    });
    const [occ] = expandAppointments([appt], d("2026-06-01"), d("2026-06-30 23:59"));

    expect(occ.travelStart).toEqual(d("2026-06-10 08:30"));
    expect(occ.travelEnd).toEqual(d("2026-06-10 10:15"));
  });

  it("skips a deleted appointment", () => {
    const appt = appointment({ start: "2026-06-10 09:00", is_deleted: true });
    expect(expandAppointments([appt], d("2026-06-01"), d("2026-06-30 23:59"))).toEqual([]);
  });
});

describe("expandAppointments — recurring series", () => {
  const weekly = () =>
    appointment({
      id: "series",
      start: "2026-06-01 09:00",
      end: "2026-06-01 10:00",
      recurrence_rule: "FREQ=WEEKLY;DTSTART=20260601T090000Z",
    });

  it("expands one occurrence per week within the range", () => {
    const result = expandAppointments([weekly()], d("2026-06-01"), d("2026-06-29 23:59"));

    expect(result.map((o) => occurrenceDateKey(o.occurrenceStart))).toEqual([
      "2026-06-01",
      "2026-06-08",
      "2026-06-15",
      "2026-06-22",
      "2026-06-29",
    ]);
    expect(result.every((o) => o.isRecurringInstance)).toBe(true);
  });

  it("keeps the original time of day and duration on every occurrence", () => {
    const result = expandAppointments([weekly()], d("2026-06-01"), d("2026-06-29 23:59"));

    for (const occ of result) {
      expect(occ.occurrenceStart.getHours()).toBe(9);
      expect(occ.occurrenceStart.getMinutes()).toBe(0);
      expect(occ.occurrenceEnd.getTime() - occ.occurrenceStart.getTime()).toBe(60 * 60 * 1000);
    }
  });

  it("keeps the wall-clock time across the spring daylight-saving switch", () => {
    // Europe/Berlin springs forward on 2026-03-29. A 09:00 appointment must
    // stay at 09:00 afterwards, not drift to 08:00 or 10:00.
    const series = appointment({
      start: "2026-03-25 09:00",
      end: "2026-03-25 10:00",
      recurrence_rule: "FREQ=WEEKLY;DTSTART=20260325T090000Z",
    });
    const result = expandAppointments([series], d("2026-03-20"), d("2026-04-10 23:59"));

    expect(result).toHaveLength(3);
    for (const occ of result) {
      expect(occ.occurrenceStart.getHours()).toBe(9);
      expect(occ.occurrenceEnd.getHours()).toBe(10);
    }
    // ... and the underlying instants really are an hour apart in UTC terms,
    // i.e. the offset changed rather than the local time.
    const [before, after] = result;
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    expect(after.occurrenceStart.getTime() - before.occurrenceStart.getTime()).toBe(
      weekMs - 60 * 60 * 1000
    );
  });

  it("treats rangeEnd as an instant, not as a whole day", () => {
    // Easy to get wrong at the call site: midnight on the 29th excludes that
    // day's 09:00 occurrence. CalendarView passes 23:59:59 for this reason.
    const atMidnight = expandAppointments([weekly()], d("2026-06-01"), d("2026-06-29"));
    const atEndOfDay = expandAppointments([weekly()], d("2026-06-01"), d("2026-06-29 23:59"));

    expect(atMidnight).toHaveLength(4);
    expect(atEndOfDay).toHaveLength(5);
  });

  it("gives every occurrence a distinct key", () => {
    const result = expandAppointments([weekly()], d("2026-06-01"), d("2026-06-29 23:59"));
    expect(new Set(result.map((o) => o.key)).size).toBe(result.length);
  });

  it("treats an unparseable recurrence rule as a single appointment", () => {
    const broken = appointment({
      start: "2026-06-10 09:00",
      end: "2026-06-10 10:00",
      recurrence_rule: "not a real rrule",
    });
    const result = expandAppointments([broken], d("2026-06-01"), d("2026-06-30 23:59"));

    expect(result).toHaveLength(1);
    expect(result[0].isRecurringInstance).toBe(false);
  });

  it("skips a deleted series parent entirely", () => {
    const series = { ...weekly(), is_deleted: true };
    expect(expandAppointments([series], d("2026-06-01"), d("2026-06-29 23:59"))).toEqual([]);
  });
});

describe("expandAppointments — series exceptions", () => {
  const daily = appointment({
    id: "series",
    start: "2026-06-01 09:00",
    end: "2026-06-01 10:00",
    recurrence_rule: "FREQ=DAILY;DTSTART=20260601T090000Z",
  });

  it("replaces a single occurrence with the modified row", () => {
    const moved = appointment({
      id: "moved",
      recurrence_parent_id: "series",
      exception_date: "2026-06-03",
      start: "2026-06-03 14:00",
      end: "2026-06-03 15:00",
    });
    const result = expandAppointments([daily, moved], d("2026-06-01"), d("2026-06-05 23:59"));

    const third = result.filter((o) => o.occurrenceStart.getDate() === 3);
    expect(third).toHaveLength(1);
    expect(third[0].occurrenceStart).toEqual(d("2026-06-03 14:00"));
    expect(third[0].appointment.id).toBe("moved");
    // The other days keep the series time.
    expect(result.filter((o) => o.occurrenceStart.getHours() === 9)).toHaveLength(4);
  });

  it("removes an occurrence marked deleted without adding the marker row", () => {
    const marker = appointment({
      id: "marker",
      recurrence_parent_id: "series",
      exception_date: "2026-06-03",
      start: "2026-06-03 09:00",
      end: "2026-06-03 10:00",
      is_deleted: true,
    });
    const result = expandAppointments([daily, marker], d("2026-06-01"), d("2026-06-05 23:59"));

    expect(result.map((o) => o.occurrenceStart.getDate()).sort()).toEqual([1, 2, 4, 5]);
    expect(result.some((o) => o.appointment.id === "marker")).toBe(false);
  });

  it("applies an exception only to its own series", () => {
    const otherSeries = appointment({
      id: "other",
      start: "2026-06-01 16:00",
      end: "2026-06-01 17:00",
      recurrence_rule: "FREQ=DAILY;DTSTART=20260601T160000Z",
    });
    const marker = appointment({
      id: "marker",
      recurrence_parent_id: "series",
      exception_date: "2026-06-03",
      start: "2026-06-03 09:00",
      is_deleted: true,
    });
    const result = expandAppointments(
      [daily, otherSeries, marker],
      d("2026-06-01"),
      d("2026-06-05 23:59")
    );

    // The other series still has all five of its occurrences.
    expect(result.filter((o) => o.appointment.id === "other")).toHaveLength(5);
  });
});

describe("buildRecurrenceRule", () => {
  /** Regel bauen, Termin speichern und im Bereich expandieren → lokale Tage. */
  function days(opts: {
    freq: RecurrenceFreqKey;
    start: string;
    end?: string;
    allDay?: boolean;
    rangeStart: string;
    rangeEnd: string;
    endSpec?: RecurrenceEndSpec;
  }): string[] {
    const start = d(opts.start);
    const rule = buildRecurrenceRule({
      freq: opts.freq,
      start,
      end: opts.endSpec ?? { mode: "none" },
    });
    const appt = appointment({
      start: opts.start,
      end: opts.end ?? (opts.allDay ? opts.start.split(" ")[0] + " 23:59" : opts.start),
      recurrence_rule: rule,
    });
    return expandAppointments([appt], d(opts.rangeStart), d(opts.rangeEnd)).map((o) =>
      occurrenceDateKey(o.occurrenceStart)
    );
  }

  it("ganztägig wöchentlich ab Sonntag bleibt im November sonntags", () => {
    const result = days({
      freq: "weekly",
      start: "2026-07-05 00:00",
      allDay: true,
      rangeStart: "2026-11-01",
      rangeEnd: "2026-11-30 23:59",
    });
    expect(result).toEqual(["2026-11-01", "2026-11-08", "2026-11-15", "2026-11-22", "2026-11-29"]);
  });

  it("ganztägig „Wochenende“ ab Samstag enthält den ersten Samstag", () => {
    const result = days({
      freq: "weekend",
      start: "2026-11-14 00:00",
      allDay: true,
      rangeStart: "2026-11-01",
      rangeEnd: "2026-11-23 23:59",
    });
    expect(result).toEqual(["2026-11-14", "2026-11-15", "2026-11-21", "2026-11-22"]);
  });

  it("ganztägig monatlich am 1. liefert zwölf Monatserste in Folge", () => {
    const result = days({
      freq: "monthly",
      start: "2026-11-01 00:00",
      allDay: true,
      rangeStart: "2026-11-01",
      rangeEnd: "2027-10-31 23:59",
    });
    expect(result).toEqual([
      "2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01", "2027-03-01", "2027-04-01",
      "2027-05-01", "2027-06-01", "2027-07-01", "2027-08-01", "2027-09-01", "2027-10-01",
    ]);
  });

  it("ganztägig jährlich am 1. März ab 2028 trifft jedes Jahr", () => {
    const result = days({
      freq: "yearly",
      start: "2028-03-01 00:00",
      allDay: true,
      rangeStart: "2028-01-01",
      rangeEnd: "2033-12-31 23:59",
    });
    expect(result).toEqual([
      "2028-03-01", "2029-03-01", "2030-03-01", "2031-03-01", "2032-03-01", "2033-03-01",
    ]);
  });

  it("ganztägig täglich mit 10 Terminen zählt keinen Tag doppelt", () => {
    const result = days({
      freq: "daily",
      start: "2026-10-20 00:00",
      allDay: true,
      rangeStart: "2026-10-01",
      rangeEnd: "2026-11-30 23:59",
      endSpec: { mode: "count", count: 10 },
    });
    expect(result).toEqual([
      "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24",
      "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29",
    ]);
  });

  it("jährlich am 29.02. fällt in Nicht-Schaltjahren auf den 28.02.", () => {
    const result = days({
      freq: "yearly",
      start: "2024-02-29 00:00",
      allDay: true,
      rangeStart: "2024-01-01",
      rangeEnd: "2028-12-31 23:59",
    });
    expect(result).toEqual(["2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
  });

  it("werktags 08:00 bleibt Montag bis Freitag", () => {
    const result = days({
      freq: "weekdays",
      start: "2026-11-09 08:00",
      end: "2026-11-09 09:00",
      rangeStart: "2026-11-09",
      rangeEnd: "2026-11-15 23:59",
    });
    expect(result).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]);
  });

  it("verankert DTSTART auf lokalem Mittag; der erste Termin einer 18:00-Serie ist der erste", () => {
    const rule = buildRecurrenceRule({
      freq: "weekly",
      start: d("2026-11-09 18:00"),
      end: { mode: "none" },
    });
    const parsed = RRule.fromString(rule);
    // Vorkommen davor gibt es nicht — Vergleich über den lokalen Tag (wie im Formular)
    expect(parsed.before(d("2026-11-09 00:00"), false)).toBeNull();
    expect(parsed.before(d("2026-11-16 00:00"), false)).not.toBeNull();
  });
});

describe("Jahrestage im Kalenderformular (Befund 2)", () => {
  it.each([
    ["29.02.", 2, 29],
    ["01.03.", 3, 1],
  ])("Jahrestag am %s überlebt „Alle“ speichern mit neu gebauter Regel", (_label, month, day) => {
    const rec = anniversaryRecord({
      title: "Test",
      kind: "birthday",
      month,
      day,
      year: null,
    } as Parameters<typeof anniversaryRecord>[0]);
    const start = new Date(rec.start_time);
    const rebuilt = buildRecurrenceRule({ freq: "yearly", start, end: { mode: "none" } });
    expect(rebuilt).toBe(rec.recurrence_rule);

    const appt = appointment({
      start: `2000-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} 00:00`,
      end: `2000-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} 23:59`,
      recurrence_rule: rebuilt,
    });
    const occ = expandAppointments([appt], d("2026-01-01"), d("2031-12-31 23:59"));
    expect(occ).toHaveLength(6);
  });
});
