import { describe, expect, it } from "vitest";
import { appointment, d, member, participant } from "@/lib/utils/__fixtures__/calendar";
import { buildRecurrenceRule, type RecurrenceEndSpec } from "@/lib/utils/recurrence";
import type { HolidayRange } from "@/lib/utils/schoolHolidays";
import { isFirstOccurrence, occurrencesBefore, withOwner } from "./actions";

/** Weekly series starting at `start` (local time, "YYYY-MM-DD HH:mm"), one hour long. */
function weekly(start: string, end: RecurrenceEndSpec = { mode: "none" }, skipHolidays = false) {
  const startDate = d(start);
  const endDate = new Date(startDate.getTime() + 3600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const endStr = `${start.split(" ")[0]} ${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`;
  return appointment({
    start,
    end: endStr,
    recurrence_rule: buildRecurrenceRule({ freq: "weekly", start: startDate, end }),
    skip_school_holidays: skipHolidays,
  });
}

const winterBreak: HolidayRange[] = [{ name: "Winterferien", start_date: "2026-01-26", end_date: "2026-02-13" }];

describe("occurrencesBefore", () => {
  it("zählt über die durch Ferien verlängerte Serie hinaus", () => {
    // Mo 05.01. bis 19.01., Ferien 26.01.–13.02., dann 16.02. … 23.03. (9. sichtbares Vorkommen)
    const series = weekly("2026-01-05 16:00", { mode: "count", count: 10 }, true);
    expect(occurrencesBefore(series, d("2026-03-23 16:00"), winterBreak)).toBe(8);
  });

  it("zählt ohne Ferien alle früheren Vorkommen", () => {
    const series = weekly("2026-01-05 16:00", { mode: "count", count: 10 }, true);
    expect(occurrencesBefore(series, d("2026-01-26 16:00"), [])).toBe(3);
  });

  it("zählt Ferientage mit, wenn die Serie Ferien nicht auslässt", () => {
    const series = weekly("2026-01-05 16:00", { mode: "count", count: 10 }, false);
    // 05.01., 12.01., 19.01., 26.01., 02.02., 09.02. → 6 vor dem 16.02.
    expect(occurrencesBefore(series, d("2026-02-16 16:00"), winterBreak)).toBe(6);
  });
});

describe("isFirstOccurrence", () => {
  it("nimmt das erste Vorkommen nach Ferien zu Serienbeginn als erstes", () => {
    const series = weekly("2026-01-05 16:00", { mode: "none" }, true);
    const holidays: HolidayRange[] = [{ name: "Weihnachten", start_date: "2026-01-01", end_date: "2026-01-09" }];
    expect(isFirstOccurrence(series, d("2026-01-12 16:00"), [series], holidays)).toBe(true);
  });

  it("überspringt ein gelöschtes erstes Vorkommen", () => {
    const series = weekly("2026-01-05 16:00");
    const marker = appointment({
      start: "2026-01-05 16:00",
      end: "2026-01-05 17:00",
      recurrence_parent_id: series.id,
      exception_date: "2026-01-05",
      is_deleted: true,
    });
    expect(isFirstOccurrence(series, d("2026-01-12 16:00"), [series, marker], [])).toBe(true);
  });

  it("erkennt bei einer einfachen Serie nur das erste Vorkommen", () => {
    const series = weekly("2026-01-05 09:00");
    expect(isFirstOccurrence(series, d("2026-01-05 09:00"), [series], [])).toBe(true);
    expect(isFirstOccurrence(series, d("2026-01-12 09:00"), [series], [])).toBe(false);
  });

  it("erkennt das erste Vorkommen einer Nachmittagsserie (Mittags-Anker)", () => {
    const series = weekly("2026-01-05 16:00");
    expect(isFirstOccurrence(series, d("2026-01-05 16:00"), [series], [])).toBe(true);
  });

  it("gilt für Einzeltermine immer", () => {
    const single = appointment();
    expect(isFirstOccurrence(single, d("2026-06-01 09:00"), [single], [])).toBe(true);
  });
});

describe("withOwner", () => {
  const x = member({ name: "X" });
  const y = member({ name: "Y" });

  it("macht aus einem Familientermin einen Termin des neuen Besitzers", () => {
    const appt = appointment({ is_all_family: true });
    expect(withOwner(appt, x.id).owner).toEqual({ owner_id: x.id, is_all_family: false });
  });

  it("beendet „Alle“ auch, wenn der Besitzer schon eingetragen war", () => {
    const appt = appointment({ owner_id: x.id, is_all_family: true });
    expect(withOwner(appt, x.id).owner).toEqual({ owner_id: x.id, is_all_family: false });
  });

  it("nimmt den neuen Besitzer aus den Teilnehmern", () => {
    const appt = appointment({ owner_id: y.id, participants: [participant(x.id), participant(y.id, true)] });
    const { owner, participants } = withOwner(appt, x.id);
    expect(owner.owner_id).toBe(x.id);
    expect(participants.map((p) => p.member_id)).toEqual([y.id]);
  });

  it("lässt ohne neuen Besitzer alles unverändert", () => {
    const appt = appointment({ owner_id: y.id, participants: [participant(x.id)] });
    expect(withOwner(appt, null)).toEqual({
      owner: { owner_id: y.id, is_all_family: false },
      participants: [{ member_id: x.id, is_supervisor: false }],
    });
  });
});
