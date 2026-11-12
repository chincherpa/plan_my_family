import { describe, expect, it } from "vitest";
import {
  ExtractionSchema,
  RequestBodySchema,
  checkExtraction,
  zonedToUtc,
  type Extraction,
} from "./appointmentFromText";

const base: Extraction = {
  title: "Zahnarzt",
  date: "2026-11-12",
  start_time: "15:00",
  end_time: null,
  all_day: false,
  person: null,
  notes: null,
};

describe("RequestBodySchema", () => {
  it("akzeptiert Text und trimmt ihn", () => {
    expect(RequestBodySchema.parse({ text: "  Morgen Zahnarzt  " })).toEqual({ text: "Morgen Zahnarzt" });
  });

  it.each([{}, { text: "" }, { text: "   " }, { text: 42 }, { text: "x".repeat(2001) }])(
    "lehnt %j ab",
    (body) => {
      expect(RequestBodySchema.safeParse(body).success).toBe(false);
    }
  );
});

describe("ExtractionSchema", () => {
  it("verlangt jedes Feld (null erlaubt)", () => {
    expect(ExtractionSchema.safeParse(base).success).toBe(true);
    const withoutPerson: Partial<Extraction> = { ...base };
    delete withoutPerson.person;
    expect(ExtractionSchema.safeParse(withoutPerson).success).toBe(false);
  });
});

describe("zonedToUtc", () => {
  it("rechnet Winterzeit (UTC+1)", () => {
    expect(zonedToUtc("2026-11-12", "15:00").toISOString()).toBe("2026-11-12T14:00:00.000Z");
  });

  it("rechnet Sommerzeit (UTC+2)", () => {
    expect(zonedToUtc("2026-07-01", "08:30").toISOString()).toBe("2026-07-01T06:30:00.000Z");
  });

  it("stimmt am Tag der Zeitumstellung", () => {
    // 29.03.2026: 02:00 → 03:00 MESZ
    expect(zonedToUtc("2026-03-29", "01:30").toISOString()).toBe("2026-03-29T00:30:00.000Z");
    expect(zonedToUtc("2026-03-29", "12:00").toISOString()).toBe("2026-03-29T10:00:00.000Z");
  });
});

describe("checkExtraction", () => {
  it("ergänzt 60 Minuten Dauer ohne Ende", () => {
    const result = checkExtraction(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.appointment.start.toISOString()).toBe("2026-11-12T14:00:00.000Z");
    expect(result.appointment.end.toISOString()).toBe("2026-11-12T15:00:00.000Z");
  });

  it("übernimmt ein genanntes Ende", () => {
    const result = checkExtraction({ ...base, end_time: "16:30" });
    expect(result.ok && result.appointment.end.toISOString()).toBe("2026-11-12T15:30:00.000Z");
  });

  it("meldet fehlende Pflichtfelder", () => {
    const result = checkExtraction({ ...base, title: "  ", date: null, start_time: null });
    expect(result).toEqual({ ok: false, missing: ["title", "date", "start_time"], invalid: [] });
  });

  it("meldet ungültige Werte", () => {
    const result = checkExtraction({ ...base, date: "2026-02-30", start_time: "25:00" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.missing).toEqual([]);
    expect(result.invalid.map((p) => p.field)).toEqual(["date", "start_time"]);
  });

  it("lehnt ein Ende gleich dem Beginn ab", () => {
    const result = checkExtraction({ ...base, end_time: "15:00" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.invalid[0].field).toBe("end_time");
  });

  it("legt ein Ende vor dem Beginn auf den Folgetag", () => {
    const result = checkExtraction({ ...base, date: "2026-11-14", start_time: "22:00", end_time: "01:00" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 14.11. 22:00 bis 15.11. 01:00 Ortszeit (MEZ, UTC+1)
    expect(result.appointment.start.toISOString()).toBe("2026-11-14T21:00:00.000Z");
    expect(result.appointment.end.toISOString()).toBe("2026-11-15T00:00:00.000Z");
  });

  it("braucht bei ganztägigen Terminen keine Uhrzeit", () => {
    const result = checkExtraction({ ...base, start_time: null, all_day: true, title: "Omas Geburtstag" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.appointment.startTime).toBeNull();
    expect(result.appointment.start.toISOString()).toBe("2026-11-11T23:00:00.000Z");
    expect(result.appointment.end.toISOString()).toBe("2026-11-12T22:59:59.000Z");
  });
});
