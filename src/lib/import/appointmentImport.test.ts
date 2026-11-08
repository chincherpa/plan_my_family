import { describe, it, expect } from "vitest";
import { RRule } from "rrule";
import {
  normalizeAll,
  normalizeEntry,
  parseImportCsv,
  personNamesIn,
  resolveEntries,
  skippedOccurrence,
  unmatchedNames,
  type ImportContext,
} from "@/lib/import/appointmentImport";
import { expandAppointments } from "@/lib/utils/recurrence";
import { appointment, d, member } from "@/lib/utils/__fixtures__/calendar";
import type { AppointmentWithParticipants, Vehicle } from "@/lib/supabase/types";

const anna = member({ id: "m-anna", name: "Anna" });
const ben = member({ id: "m-ben", name: "Ben" });
const car: Vehicle = { id: "v-car", family_id: "family-1", name: "Auto", icon_emoji: "🚗", created_at: "" };

function ctx(overrides: Partial<ImportContext> = {}): ImportContext {
  return {
    familyId: "family-1",
    members: [anna, ben],
    vehicles: [car],
    existing: [],
    personMap: {},
    vehicleMap: {},
    importDuplicates: new Set<number>(),
    ...overrides,
  };
}

function resolveOne(raw: unknown, overrides: Partial<ImportContext> = {}) {
  return resolveEntries(normalizeAll([raw]), ctx(overrides))[0];
}

/** Wie die App einen gespeicherten Serientermin anzeigt. */
function expand(rule: string, start: string, end: string, from: string, to: string) {
  const parent: AppointmentWithParticipants = appointment({ start, end, recurrence_rule: rule });
  return expandAppointments([parent], d(from), d(to)).map((o) => o.occurrenceStart);
}

describe("parseImportCsv", () => {
  const rowsOf = (text: string) => {
    const parsed = parseImportCsv(text);
    expect(parsed.fileErrors).toEqual([]);
    return parsed.items as Record<string, unknown>[];
  };

  it("liest Semikolon, Komma und Tabulator als Trennzeichen sowie BOM und CRLF", () => {
    for (const sep of [";", ",", "\t"]) {
      const text = `\uFEFFtitle${sep}start${sep}owner\r\nZahnarzt${sep}2026-11-10T09:00${sep}Anna\r\n`;
      expect(rowsOf(text)).toEqual([{ title: "Zahnarzt", start: "2026-11-10T09:00", owner: "Anna" }]);
    }
  });

  it("versteht Anführungszeichen mit Trennzeichen, Zeilenumbruch und \"\"", () => {
    const items = rowsOf('title;start;notes\n"A; B";2026-11-10;"Zeile 1\nZeile ""2"""\n');
    expect(items[0]).toMatchObject({ title: "A; B", notes: 'Zeile 1\nZeile "2"' });
  });

  it("erkennt Spaltennamen ohne Beachtung von Groß-/Kleinschreibung und Unterstrichen", () => {
    const items = rowsOf("Title;START;travel_before;All Day\nA;2026-11-10T09:00;15;ja\n");
    expect(items[0]).toEqual({ title: "A", start: "2026-11-10T09:00", travelBefore: 15, allDay: true });
  });

  it("überspringt Leerzeilen und leere Zellen", () => {
    const items = rowsOf("title;start;owner\nA;2026-11-10;\n;;\n\nB;2026-11-11;Anna\n");
    expect(items).toEqual([
      { title: "A", start: "2026-11-10" },
      { title: "B", start: "2026-11-11", owner: "Anna" },
    ]);
  });

  it("wandelt Wahrheitswerte, Zahlen und Listen um", () => {
    const [item] = rowsOf(
      "title;start;everyone;event;duration;participants;repeat;repeatDays;repeatSkip\n" +
        "A;2026-11-10T09:00;Nein;x;90;Ben|Clara*;weekly;mo|we;2026-11-11|2026-11-18\n"
    );
    expect(item).toMatchObject({
      everyone: false,
      event: true,
      duration: 90,
      participants: ["Ben", { name: "Clara", supervisor: true }],
      repeat: { freq: "weekly", days: ["mo", "we"], skip: ["2026-11-11", "2026-11-18"] },
    });
  });

  it("lässt kaputte Werte als Text stehen, damit normalizeEntry sie meldet", () => {
    const [item] = rowsOf("title;start;event;travelBefore\nA;2026-11-10;vielleicht;viel\n");
    const e = normalizeEntry(item, 1);
    expect(e.errors.join(" ")).toContain('"event"');
    expect(e.errors.join(" ")).toContain("travelBefore");
  });

  it("kombiniert repeat-Spalten mit einem RRULE-Text nur mit repeatSkip", () => {
    const [ok] = rowsOf("title;start;repeat;repeatSkip\nA;2026-11-10T17:00;FREQ=WEEKLY;2026-11-17\n");
    expect(normalizeEntry(ok, 1).errors).toEqual([]);
    const [bad] = rowsOf("title;start;repeat;repeatCount\nA;2026-11-10T17:00;FREQ=WEEKLY;3\n");
    expect(normalizeEntry(bad, 1).errors[0]).toContain("RRULE");
  });

  it("meldet Wiederholungs-Zusatzspalten ohne repeat", () => {
    const [item] = rowsOf("title;start;repeatCount\nA;2026-11-10T17:00;3\n");
    expect(normalizeEntry(item, 1).errors[0]).toContain('"repeat"');
  });

  it("warnt bei unbekannten Spalten", () => {
    const [item] = rowsOf("title;start;ownr\nA;2026-11-10;Anna\n");
    expect(normalizeEntry(item, 1).warnings[0]).toContain('"ownr"');
  });

  it("lehnt leere, unvollständige und kaputte Dateien ab", () => {
    expect(parseImportCsv("  ").fileErrors).not.toEqual([]);
    expect(parseImportCsv("title;owner\nA;Anna\n").fileErrors[0]).toContain('"start"');
    expect(parseImportCsv("title;start;title\nA;2026-11-10;B\n").fileErrors[0]).toContain("mehrfach");
    expect(parseImportCsv("title;start\n").fileErrors[0]).toContain("keine Termine");
    expect(parseImportCsv('title;start\n"offen;2026-11-10\n').fileErrors[0]).toContain("Anführungszeichen");
  });
});

describe("normalizeEntry — Zeiten", () => {
  it("liest lokale Zeiten und nimmt 60 Minuten Dauer an, wenn end fehlt", () => {
    const e = normalizeEntry({ title: "Training", start: "2026-11-10T17:00" }, 1);
    expect(e.errors).toEqual([]);
    expect(e.start).toEqual(d("2026-11-10 17:00"));
    expect(e.end).toEqual(d("2026-11-10 18:00"));
    expect(e.allDay).toBe(false);
  });

  it("versteht end, duration und das Leerzeichen statt T", () => {
    const a = normalizeEntry({ title: "A", start: "2026-11-10 17:00", end: "2026-11-10 18:30" }, 1);
    expect(a.end).toEqual(d("2026-11-10 18:30"));
    const b = normalizeEntry({ title: "B", start: "2026-11-10T17:00", duration: 90 }, 1);
    expect(b.end).toEqual(d("2026-11-10 18:30"));
  });

  it("rechnet Zeiten mit Zone in den richtigen Zeitpunkt um", () => {
    const e = normalizeEntry({ title: "A", start: "2026-11-10T16:00:00Z", end: "2026-11-10T18:00:00+01:00" }, 1);
    expect(e.start.toISOString()).toBe("2026-11-10T16:00:00.000Z");
    expect(e.end.toISOString()).toBe("2026-11-10T17:00:00.000Z");
  });

  it("versteht das deutsche Datumsformat, das Excel beim Speichern erzeugt", () => {
    const e = normalizeEntry({ title: "A", start: "10.11.2026 9:00", end: "10.11.2026 10:30" }, 1);
    expect(e.errors).toEqual([]);
    expect(e.start).toEqual(d("2026-11-10 09:00"));
    expect(e.end).toEqual(d("2026-11-10 10:30"));
    expect(normalizeEntry({ title: "A", start: "24.12.2026" }, 1).allDay).toBe(true);
    expect(normalizeEntry({ title: "A", start: "31.02.2026" }, 1).errors[0]).toContain('"start"');
  });

  it("behandelt ein Datum ohne Uhrzeit als ganztägig; end ist inklusive", () => {
    const e = normalizeEntry({ title: "Urlaub", start: "2026-12-24", end: "2026-12-26" }, 1);
    expect(e.allDay).toBe(true);
    expect(e.start).toEqual(d("2026-12-24 00:00"));
    expect(e.end).toEqual(new Date(2026, 11, 26, 23, 59, 59));
  });

  it("macht einen eintägigen ganztägigen Termin ohne end", () => {
    const e = normalizeEntry({ title: "Geburtstag", start: "2026-05-05" }, 1);
    expect(e.end).toEqual(new Date(2026, 4, 5, 23, 59, 59));
  });

  it("nimmt bei allDay:true nur den Datumsteil", () => {
    const e = normalizeEntry({ title: "A", start: "2026-05-05T13:00", allDay: true }, 1);
    expect(e.start).toEqual(d("2026-05-05 00:00"));
  });

  it("weist ungültige Zeitangaben ab", () => {
    const bad = (raw: Record<string, unknown>) => normalizeEntry({ title: "A", ...raw }, 1).errors;
    expect(bad({})).toEqual(expect.arrayContaining([expect.stringContaining('"start"')]));
    expect(bad({ start: "11/10/2026 17:00" })[0]).toContain('"start"');
    expect(bad({ start: "2026-02-30T10:00" })[0]).toContain('"start"');
    expect(bad({ start: "2026-11-10T25:00" })[0]).toContain('"start"');
    expect(bad({ start: "2026-11-10" , allDay: false })[0]).toContain("Uhrzeit fehlt");
    expect(bad({ start: "2026-11-10T10:00", end: "2026-11-10T09:00" })[0]).toContain("Ende muss nach dem Beginn");
    expect(bad({ start: "2026-11-10T10:00", end: "2026-11-10T10:00" })[0]).toContain("Ende muss nach dem Beginn");
    expect(bad({ start: "2026-11-10T10:00", end: "2026-11-11" })[0]).toContain("Uhrzeit");
    expect(bad({ start: "2026-11-10T10:00", duration: 0 })[0]).toContain('"duration"');
    expect(bad({ start: "2026-11-10", end: "2026-11-09" })[0]).toContain('"end" liegt vor');
  });
});

describe("normalizeEntry — Felder", () => {
  it("verlangt einen Titel und prüft Typen", () => {
    expect(normalizeEntry({ start: "2026-01-01" }, 1).errors[0]).toContain('"title"');
    expect(normalizeEntry({ title: " ", start: "2026-01-01" }, 1).errors[0]).toContain('"title"');
    expect(normalizeEntry("text", 1).errors[0]).toContain("kein Objekt");
    expect(normalizeEntry({ title: "A", start: "2026-01-01", event: "ja" }, 1).errors[0]).toContain('"event"');
    expect(normalizeEntry({ title: "A", start: "2026-01-01", travelBefore: -5 }, 1).errors[0]).toContain("travelBefore");
    expect(normalizeEntry({ title: "A", start: "2026-01-01", travelBefore: 999 }, 1).errors[0]).toContain("travelBefore");
    expect(normalizeEntry({ title: "A", start: "2026-01-01", participants: "Ben" }, 1).errors[0]).toContain("participants");
  });

  it("warnt bei unbekannten Feldern (Tippfehler)", () => {
    const e = normalizeEntry({ title: "A", start: "2026-01-01", ownr: "Anna" }, 1);
    expect(e.errors).toEqual([]);
    expect(e.warnings[0]).toContain('"ownr"');
  });

  it("liest Teilnehmer als Text oder Objekt und entfernt Doppelte", () => {
    const e = normalizeEntry(
      {
        title: "A",
        start: "2026-01-01T10:00",
        owner: "Anna",
        participants: ["Ben", { name: "ben", supervisor: true }, { name: "Clara" }],
      },
      1
    );
    expect(e.participants).toEqual([
      { name: "Ben", supervisor: true },
      { name: "Clara", supervisor: false },
    ]);
  });

  it("ignoriert Personen bei Ereignissen und 'everyone', Anfahrt und Fahrzeug bei ganztägigen Terminen", () => {
    const ev = normalizeEntry({ title: "A", start: "2026-01-01", event: true, owner: "Anna" }, 1);
    expect(ev.owner).toBeNull();
    expect(ev.warnings.join(" ")).toContain("Ereignissen");

    const all = normalizeEntry({ title: "A", start: "2026-01-01T10:00", everyone: true, participants: ["Ben"] }, 1);
    expect(all.participants).toEqual([]);

    const day = normalizeEntry({ title: "A", start: "2026-01-01", travelBefore: 15, vehicle: "Auto" }, 1);
    expect(day.travelBefore).toBe(0);
    expect(day.vehicle).toBeNull();
  });
});

describe("Wiederholung", () => {
  it("baut die Formular-Voreinstellungen aus einem Wort", () => {
    const e = normalizeEntry({ title: "A", start: "2026-11-10T17:00", repeat: "weekly" }, 1);
    expect(e.errors).toEqual([]);
    const options = RRule.fromString(e.recurrence!.rule).options;
    expect(options.freq).toBe(RRule.WEEKLY);
    expect(options.interval).toBe(1);

    const bi = normalizeEntry({ title: "A", start: "2026-11-10T17:00", repeat: "biweekly" }, 1);
    expect(RRule.fromString(bi.recurrence!.rule).options.interval).toBe(2);
  });

  it("zeigt eine wöchentliche Serie mit until an den richtigen Tagen", () => {
    const e = normalizeEntry(
      { title: "Training", start: "2026-11-10T17:00", repeat: { freq: "weekly", until: "2026-11-24" } },
      1
    );
    const starts = expand(e.recurrence!.rule, "2026-11-10 17:00", "2026-11-10 18:00", "2026-11-01", "2026-12-31");
    expect(starts).toEqual([d("2026-11-10 17:00"), d("2026-11-17 17:00"), d("2026-11-24 17:00")]);
  });

  it("begrenzt mit count", () => {
    const e = normalizeEntry({ title: "A", start: "2026-11-10T17:00", repeat: { freq: "daily", count: 3 } }, 1);
    const starts = expand(e.recurrence!.rule, "2026-11-10 17:00", "2026-11-10 18:00", "2026-11-01", "2026-12-31");
    expect(starts).toHaveLength(3);
  });

  it("unterstützt days (Mo/Mi) und interval", () => {
    const e = normalizeEntry(
      { title: "A", start: "2026-11-09T09:00", repeat: { freq: "weekly", days: ["mo", "WE"], count: 4 } },
      1
    );
    const starts = expand(e.recurrence!.rule, "2026-11-09 09:00", "2026-11-09 10:00", "2026-11-01", "2026-12-31");
    expect(starts).toEqual([
      d("2026-11-09 09:00"), d("2026-11-11 09:00"), d("2026-11-16 09:00"), d("2026-11-18 09:00"),
    ]);

    const every3 = normalizeEntry(
      { title: "A", start: "2026-11-09T09:00", repeat: { freq: "weekly", interval: 3, count: 2 } },
      1
    );
    const s3 = expand(every3.recurrence!.rule, "2026-11-09 09:00", "2026-11-09 10:00", "2026-11-01", "2026-12-31");
    expect(s3).toEqual([d("2026-11-09 09:00"), d("2026-11-30 09:00")]);
  });

  it("trifft die richtigen Wochentage auch bei ganztägigen Terminen und kurz nach Mitternacht", () => {
    // In Berlin liegt 00:30 lokal noch am Vortag in UTC; rrule wertet Wochentage in UTC aus.
    const dates = (start: string, repeat: unknown, startForExpand: string, endForExpand: string) => {
      const e = normalizeEntry({ title: "A", start, repeat }, 1);
      expect(e.errors).toEqual([]);
      const appt = appointment({ start: startForExpand, end: endForExpand, recurrence_rule: e.recurrence!.rule });
      appt.start_time = e.start.toISOString();
      appt.end_time = e.end.toISOString();
      return expandAppointments([appt], d("2026-11-01"), d("2026-12-31")).map(
        (o) => `${o.occurrenceStart.getFullYear()}-${o.occurrenceStart.getMonth() + 1}-${o.occurrenceStart.getDate()}`
      );
    };
    const monWed = ["2026-11-9", "2026-11-11", "2026-11-16", "2026-11-18"];
    const repeat = { freq: "weekly", days: ["MO", "WE"], count: 4 };
    expect(dates("2026-11-09", repeat, "2026-11-09 00:00", "2026-11-09 23:59")).toEqual(monWed);
    expect(dates("2026-11-09T00:30", repeat, "2026-11-09 00:30", "2026-11-09 01:30")).toEqual(monWed);
    expect(dates("2026-11-09T23:30", repeat, "2026-11-09 23:30", "2026-11-10 00:30")).toEqual(monWed);
    // Mo–Fr ganztägig darf nie auf Sa/So fallen
    const weekdays = dates("2026-11-09", "weekdays", "2026-11-09 00:00", "2026-11-09 23:59").slice(0, 7);
    expect(weekdays).toEqual([
      "2026-11-9", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-16", "2026-11-17",
    ]);
  });

  it("verschiebt den Start auf den ersten passenden Tag", () => {
    // 2026-11-12 ist ein Donnerstag, die Serie läuft Mo/Mi.
    const e = normalizeEntry(
      { title: "A", start: "2026-11-12T09:00", repeat: { freq: "weekly", days: ["MO", "WE"], count: 2 } },
      1
    );
    expect(e.start).toEqual(d("2026-11-16 09:00"));
    expect(e.end).toEqual(d("2026-11-16 10:00"));
    expect(e.warnings.join(" ")).toContain("verschoben");
    const starts = expand(e.recurrence!.rule, "2026-11-16 09:00", "2026-11-16 10:00", "2026-11-01", "2026-12-31");
    expect(starts).toEqual([d("2026-11-16 09:00"), d("2026-11-18 09:00")]);
  });

  it("nimmt einen RRULE-Text (auch mit Präfix) und behandelt UNTIL als ganzen Tag", () => {
    const e = normalizeEntry(
      { title: "A", start: "2026-11-10T17:00", repeat: "RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20261124" },
      1
    );
    expect(e.errors).toEqual([]);
    const starts = expand(e.recurrence!.rule, "2026-11-10 17:00", "2026-11-10 18:00", "2026-11-01", "2026-12-31");
    expect(starts).toEqual([d("2026-11-10 17:00"), d("2026-11-17 17:00"), d("2026-11-24 17:00")]);

    const viaObject = normalizeEntry(
      { title: "A", start: "2026-11-10T17:00", repeat: { rrule: "FREQ=DAILY;COUNT=2" } },
      1
    );
    expect(viaObject.errors).toEqual([]);
  });

  it("legt Löschmarker für ausgefallene Termine an und ignoriert falsche Daten", () => {
    const e = normalizeEntry(
      {
        title: "A",
        start: "2026-11-10T17:00",
        repeat: { freq: "weekly", count: 4, skip: ["2026-11-17", "2026-11-18", "2026-11-17"] },
      },
      1
    );
    expect(e.recurrence!.skipDates).toEqual(["2026-11-17"]);
    expect(e.warnings.join(" ")).toContain("2026-11-18");

    const marker = skippedOccurrence("2026-11-17", e.start, e.end);
    expect(marker.start).toEqual(d("2026-11-17 17:00"));
    expect(marker.end).toEqual(d("2026-11-17 18:00"));
  });

  it("meldet ungültige Wiederholungen verständlich", () => {
    const err = (repeat: unknown) =>
      normalizeEntry({ title: "A", start: "2026-11-10T17:00", repeat }, 1).errors[0];
    expect(err("manchmal")).toContain("Unbekannte Wiederholung");
    expect(err({ freq: "weekly", until: "x" })).toContain("repeatUntil");
    expect(err({ freq: "weekly", until: "2026-12-01", count: 3 })).toContain("gleichzeitig");
    expect(err({ freq: "daily", days: ["MO"] })).toContain("repeatDays");
    expect(err({ freq: "weekly", days: ["XX"] })).toContain("Unbekannter Wochentag");
    expect(err({ freq: "weekly", interval: 0 })).toContain("repeatInterval");
    expect(err({ freq: "weekly", until: "2026-11-01" })).toContain("keinen einzigen Termin");
    expect(err("FREQ=HOURLY")).toContain("täglich, wöchentlich");
    expect(err("FREQ=WEEKLY;DTSTART=20261110")).toContain("DTSTART");
    expect(err(42)).toContain('"repeat"');
  });
});

describe("Namen zuordnen und speicherfertig machen", () => {
  it("ordnet Besitzer und Teilnehmer ohne Beachtung von Groß-/Kleinschreibung zu", () => {
    const r = resolveOne({
      title: "Zahnarzt",
      start: "2026-11-10T09:00",
      owner: " anna ",
      participants: ["BEN"],
      vehicle: "auto",
      travelBefore: 15,
    });
    expect(r.status).toBe("ok");
    expect(r.appointment).toMatchObject({
      family_id: "family-1",
      owner_id: "m-anna",
      is_all_family: false,
      vehicle_id: "v-car",
      travel_before_min: 15,
      recurrence_rule: null,
    });
    expect(r.participants).toEqual([{ member_id: "m-ben", is_supervisor: false }]);
  });

  it("übernimmt supervisor und nimmt den Besitzer aus der Teilnehmerliste", () => {
    const r = resolveOne({
      title: "A",
      start: "2026-11-10T09:00",
      owner: "Anna",
      participants: [{ name: "Ben", supervisor: true }, "Anna"],
    });
    expect(r.participants).toEqual([{ member_id: "m-ben", is_supervisor: true }]);
  });

  it("erkennt Namen ohne Akzent/mit Akzent als gleich", () => {
    const jose = member({ id: "m-jose", name: "José" });
    const r = resolveOne({ title: "A", start: "2026-11-10T09:00", owner: "Jose" }, { members: [jose] });
    expect(r.appointment?.owner_id).toBe("m-jose");
  });

  it("meldet unbekannte Personen als Fehler, bis sie zugeordnet oder ignoriert werden", () => {
    const raw = { title: "A", start: "2026-11-10T09:00", owner: "Mama", participants: ["Ben"] };
    const open = resolveOne(raw);
    expect(open.status).toBe("error");
    expect(open.errors[0]).toContain("Mama");

    const mapped = resolveOne(raw, { personMap: { mama: "m-anna" } });
    expect(mapped.status).toBe("ok");
    expect(mapped.appointment?.owner_id).toBe("m-anna");

    // Besitzer ignoriert → erster Teilnehmer wird Besitzer
    const ignored = resolveOne(raw, { personMap: { mama: null } });
    expect(ignored.status).toBe("ok");
    expect(ignored.appointment?.owner_id).toBe("m-ben");
    expect(ignored.participants).toEqual([]);
    expect(ignored.warnings.join(" ")).toContain("erste Teilnehmer");
  });

  it("verlangt eine Person, außer bei 'everyone' und Ereignissen", () => {
    expect(resolveOne({ title: "A", start: "2026-11-10T09:00" }).status).toBe("error");
    const all = resolveOne({ title: "Ausflug", start: "2026-11-10T09:00", everyone: true });
    expect(all.status).toBe("ok");
    expect(all.appointment).toMatchObject({ owner_id: null, is_all_family: true });
    const ev = resolveOne({ title: "Geburtstag", start: "2026-05-05", event: true });
    expect(ev.appointment).toMatchObject({ owner_id: null, is_event: true, is_all_day: true });
  });

  it("verwirft eine Zuordnung auf ein nicht (mehr) vorhandenes Mitglied", () => {
    const r = resolveOne(
      { title: "A", start: "2026-11-10T09:00", owner: "Mama" },
      { personMap: { mama: "geloescht" } }
    );
    expect(r.status).toBe("error");
  });

  it("behandelt mehrdeutige Namen als offen", () => {
    const twin = member({ id: "m-anna2", name: "anna" });
    const r = resolveOne({ title: "A", start: "2026-11-10T09:00", owner: "Anna" }, { members: [anna, twin] });
    expect(r.status).toBe("error");
  });

  it("fragt bei unbekanntem Fahrzeug nach und erlaubt Ignorieren", () => {
    const raw = { title: "A", start: "2026-11-10T09:00", owner: "Anna", vehicle: "Roller" };
    expect(resolveOne(raw).status).toBe("error");
    const ignored = resolveOne(raw, { vehicleMap: { roller: null } });
    expect(ignored.status).toBe("ok");
    expect(ignored.appointment?.vehicle_id).toBeNull();
  });

  it("sammelt nur die offenen Namen für die Zuordnung", () => {
    const entries = normalizeAll([
      { title: "A", start: "2026-11-10T09:00", owner: "Anna", participants: ["Mama", "Opa"] },
      { title: "B", start: "2026-11-11T09:00", owner: "mama" }, // zählt als derselbe Name
      { title: "C", start: "kaputt", owner: "Fehler" }, // fehlerhafte Einträge zählen nicht
    ]);
    const open = unmatchedNames(personNamesIn(entries), [anna, ben]);
    expect(open.map((u) => [u.name, u.count])).toEqual([["Mama", 2], ["Opa", 1]]);
  });

  it("schreibt die Wiederholung ins Ergebnis und zählt Löschmarker", () => {
    const r = resolveOne({
      title: "Training",
      start: "2026-11-10T17:00",
      owner: "Anna",
      repeat: { freq: "weekly", count: 4, skip: ["2026-11-17"] },
    });
    expect(r.appointment?.recurrence_rule).toContain("FREQ=WEEKLY");
    expect(r.skipCount).toBe(1);
  });
});

describe("Duplikate", () => {
  const raw = { title: "Zahnarzt", start: "2026-11-10T09:00", end: "2026-11-10T10:00", owner: "Anna" };
  const stored = appointment({ title: "zahnarzt", start: "2026-11-10 09:00", end: "2026-11-10 10:00" });

  it("überspringt bereits vorhandene Termine", () => {
    const r = resolveOne(raw, { existing: [stored] });
    expect(r.status).toBe("duplicate");
    expect(r.duplicate).toBe(true);
  });

  it("legt sie auf Wunsch trotzdem an", () => {
    const r = resolveOne(raw, { existing: [stored], importDuplicates: new Set([1]) });
    expect(r.status).toBe("ok");
    expect(r.duplicate).toBe(true);
    expect(r.warnings.join(" ")).toContain("existiert bereits");
  });

  it("erkennt Doppelte innerhalb der Datei", () => {
    const rows = resolveEntries(normalizeAll([raw, raw]), ctx());
    expect(rows.map((r) => r.status)).toEqual(["ok", "duplicate"]);
  });

  it("unterscheidet Einzeltermin und Serie sowie gelöschte und Ausnahme-Zeilen", () => {
    const series = appointment({ title: "Zahnarzt", start: "2026-11-10 09:00", end: "2026-11-10 10:00", recurrence_rule: "FREQ=WEEKLY" });
    expect(resolveOne(raw, { existing: [series] }).status).toBe("ok");

    const deleted = appointment({ title: "Zahnarzt", start: "2026-11-10 09:00", end: "2026-11-10 10:00", is_deleted: true });
    expect(resolveOne(raw, { existing: [deleted] }).status).toBe("ok");

    const exception = appointment({
      title: "Zahnarzt", start: "2026-11-10 09:00", end: "2026-11-10 10:00", recurrence_parent_id: "p",
    });
    expect(resolveOne(raw, { existing: [exception] }).status).toBe("ok");
  });
});

describe("CSV-Vorlage", () => {
  it("ist gültig und lässt sich komplett importieren", async () => {
    const { buildTemplateCsv } = await import("@/lib/import/exampleFile");
    const text = buildTemplateCsv([anna, ben], [car]);
    expect(text.startsWith("\uFEFFtitle;start;")).toBe(true);
    const parsed = parseImportCsv(text);
    expect(parsed.fileErrors).toEqual([]);
    const entries = normalizeAll(parsed.items);
    expect(entries.flatMap((e) => e.warnings)).toEqual([]);
    const rows = resolveEntries(entries, ctx());
    expect(rows.filter((r) => r.status !== "ok").map((r) => [r.entry.title, r.errors])).toEqual([]);
    expect(rows.length).toBeGreaterThanOrEqual(5);
    expect(rows.filter((r) => r.entry.recurrence).length).toBeGreaterThanOrEqual(3);
  });
});
