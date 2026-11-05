import { describe, it, expect } from "vitest";
import {
  anniversaryBadge,
  anniversaryRecord,
  collectAnniversaries,
  formatDaysUntil,
  nextOccurrence,
  toAnniversary,
  upcomingAnniversaries,
  validateAnniversary,
  type AnniversaryInput,
} from "@/lib/anniversaries";
import { expandAppointments } from "@/lib/utils/recurrence";
import { localDateStr } from "@/lib/utils";
import { appointment } from "@/lib/utils/__fixtures__/calendar";
import type { AppointmentWithParticipants } from "@/lib/supabase/types";

const TODAY = new Date(2026, 10, 5); // 5. November 2026

function input(overrides: Partial<AnniversaryInput> = {}): AnniversaryInput {
  return { kind: "birthday", title: "Oma Erika", day: 12, month: 3, year: 1946, notes: null, ...overrides };
}

/** Appointment, wie es nach dem Speichern über das Jahrestage-Formular aussieht. */
function stored(overrides: Partial<AnniversaryInput> = {}): AppointmentWithParticipants {
  return { ...appointment(), ...anniversaryRecord(input(overrides)) };
}

function occurrenceDays(appt: AppointmentWithParticipants, from: Date, to: Date): string[] {
  return expandAppointments([appt], from, to).map((o) => localDateStr(o.occurrenceStart));
}

describe("anniversaryRecord + expandAppointments", () => {
  it("erscheint jedes Jahr am selben Tag im Kalender", () => {
    const appt = stored();
    expect(occurrenceDays(appt, new Date(2026, 0, 1), new Date(2028, 11, 31))).toEqual([
      "2026-03-12",
      "2027-03-12",
      "2028-03-12",
    ]);
  });

  it("bleibt über Sommerzeit-Unterschiede zwischen Ursprungs- und Zieljahr stabil", () => {
    // 28.3.2021 war Umstellungstag; 2026 ist am 28.3. noch Winterzeit
    const appt = stored({ day: 28, month: 3, year: 2021 });
    expect(occurrenceDays(appt, new Date(2026, 2, 1), new Date(2026, 3, 30))).toEqual(["2026-03-28"]);
    const oct = stored({ day: 26, month: 10, year: 2019 });
    expect(occurrenceDays(oct, new Date(2026, 9, 1), new Date(2026, 10, 30))).toEqual(["2026-10-26"]);
  });

  it("zeigt den 29. Februar in Nicht-Schaltjahren am 28. Februar", () => {
    const appt = stored({ day: 29, month: 2, year: 2000 });
    expect(occurrenceDays(appt, new Date(2026, 0, 1), new Date(2028, 11, 31))).toEqual([
      "2026-02-28",
      "2027-02-28",
      "2028-02-29",
    ]);
  });

  it("legt ganztägige Ereignisse ohne Besitzer an", () => {
    const record = anniversaryRecord(input({ year: null }));
    expect(record).toMatchObject({
      is_event: true,
      is_all_day: true,
      owner_id: null,
      anniversary_kind: "birthday",
      anniversary_year_known: false,
    });
    expect(new Date(record.start_time).getFullYear()).toBe(2000);
  });
});

describe("toAnniversary", () => {
  it("liest Datum und Jahr aus einem markierten Jahrestag", () => {
    expect(toAnniversary(stored())).toMatchObject({
      kind: "birthday",
      month: 3,
      day: 12,
      year: 1946,
      isLegacy: false,
    });
  });

  it("verwirft das Platzhalterjahr bei unbekanntem Jahr", () => {
    expect(toAnniversary(stored({ year: null }))?.year).toBeNull();
  });

  it("übernimmt offene jährliche Ereignisse aus dem Kalender ohne Alter", () => {
    const legacy = appointment({
      title: "Geburtstag Tom",
      is_event: true,
      is_all_day: true,
      start: "2025-07-04 00:00",
      end: "2025-07-04 23:59",
      recurrence_rule: "DTSTART:20250703T220000Z\nRRULE:FREQ=YEARLY",
    });
    expect(toAnniversary(legacy)).toMatchObject({ kind: "birthday", year: null, isLegacy: true });
  });

  it("ignoriert normale Termine, begrenzte Serien und Ausnahmen", () => {
    const plain = appointment({ is_event: true });
    const limited = appointment({ is_event: true, recurrence_rule: "RRULE:FREQ=YEARLY;COUNT=3" });
    const exception = { ...stored(), recurrence_parent_id: "parent" };
    expect(collectAnniversaries([plain, limited, exception])).toEqual([]);
  });
});

describe("nextOccurrence / upcomingAnniversaries", () => {
  it("nimmt heute mit und springt sonst ins nächste Jahr", () => {
    const todayOne = toAnniversary(stored({ day: 5, month: 11 }))!;
    const past = toAnniversary(stored({ day: 4, month: 11 }))!;
    expect(localDateStr(nextOccurrence(todayOne, TODAY))).toBe("2026-11-05");
    expect(localDateStr(nextOccurrence(past, TODAY))).toBe("2027-11-04");
  });

  it("sortiert nach Abstand und berechnet die Jubiläumszahl", () => {
    const list = upcomingAnniversaries(
      collectAnniversaries([
        stored({ title: "Später", day: 1, month: 1, year: 1990 }),
        stored({ title: "Heute", day: 5, month: 11, year: 1986 }),
        stored({ title: "Ohne Jahr", day: 24, month: 12, year: null }),
      ]),
      TODAY
    );
    expect(list.map((u) => [u.anniversary.title, u.daysUntil, u.count])).toEqual([
      ["Heute", 0, 40],
      ["Ohne Jahr", 49, null],
      ["Später", 57, 37],
    ]);
  });
});

describe("anniversaryBadge", () => {
  it("liefert Emoji und Zahl für das jeweilige Vorkommen", () => {
    const appt = stored({ kind: "wedding", year: 2001 });
    expect(anniversaryBadge(appt, new Date(2026, 2, 12))).toEqual({ emoji: "💍", count: 25 });
    expect(anniversaryBadge(stored({ year: null }), new Date(2026, 2, 12))).toEqual({ emoji: "🎂", count: null });
    expect(anniversaryBadge(appointment(), new Date())).toBeNull();
  });
});

describe("validateAnniversary", () => {
  it("lehnt den 29. Februar in Nicht-Schaltjahren ab, erlaubt ihn ohne Jahr", () => {
    expect(validateAnniversary(input({ day: 29, month: 2, year: 2001 }), TODAY)).toMatch(/Schaltjahr/);
    expect(validateAnniversary(input({ day: 29, month: 2, year: null }), TODAY)).toBeNull();
  });

  it("verlangt Bezeichnung und gültigen Tag", () => {
    expect(validateAnniversary(input({ title: "  " }), TODAY)).not.toBeNull();
    expect(validateAnniversary(input({ day: 31, month: 4 }), TODAY)).not.toBeNull();
    expect(validateAnniversary(input({ day: Number("") }), TODAY)).not.toBeNull();
  });
});

describe("formatDaysUntil", () => {
  it.each([
    [0, "heute"],
    [1, "morgen"],
    [5, "in 5 Tagen"],
    [20, "in 2 Wochen"],
    [120, "in 4 Monaten"],
  ])("%i → %s", (days, text) => {
    expect(formatDaysUntil(days)).toBe(text);
  });
});
