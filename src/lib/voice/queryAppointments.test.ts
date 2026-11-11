import { describe, expect, it } from "vitest";
import { anniversaryRecord, type AnniversaryInput } from "@/lib/anniversaries";
import { appointment, d, member, participant } from "@/lib/utils/__fixtures__/calendar";
import { buildRecurrenceRule } from "@/lib/utils/recurrence";
import type { AppointmentWithParticipants } from "@/lib/supabase/types";
import { describeQuery, runVoiceQuery, type QueryData } from "./queryAppointments";
import { checkQuery, type VoiceQuery } from "./appointmentFromText";

// Mittwoch, 11. November 2026, 10:00
const NOW = d("2026-11-11 10:00");

const jack = member({ name: "Jack" });
const anna = member({ name: "Anna" });

function birthday(title: string, day: number, month: number, year: number | null): AppointmentWithParticipants {
  const input: AnniversaryInput = { kind: "birthday", title, day, month, year, notes: null };
  return { ...appointment(), ...anniversaryRecord(input) };
}

function data(...appointments: AppointmentWithParticipants[]): QueryData {
  return { appointments, members: [jack, anna], schoolHolidays: [] };
}

function query(overrides: Partial<VoiceQuery> = {}): VoiceQuery {
  return {
    category: "any",
    person: null,
    person_id: null,
    search: null,
    from_date: null,
    to_date: null,
    limit: 1,
    ...overrides,
  };
}

const forJack = { person: "Jack", person_id: jack.id };

describe("runVoiceQuery", () => {
  it("findet den nächsten Geburtstag samt Alter", () => {
    const hits = runVoiceQuery(
      query({ category: "birthday" }),
      data(birthday("Oma Erika", 12, 3, 1946), birthday("Jack", 20, 11, 1990), birthday("Opa Heinz", 15, 12, 1940)),
      NOW
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ title: "Jack", emoji: "🎂", count: 36, daysUntil: 9, allDay: true });
  });

  it("zählt einen Geburtstag heute noch, obwohl der Tag um 00:00 begann", () => {
    const hits = runVoiceQuery(query({ category: "birthday" }), data(birthday("Anna", 11, 11, 1992)), NOW);
    expect(hits.map((h) => h.title)).toEqual(["Anna"]);
    expect(hits[0].daysUntil).toBe(0);
  });

  it("findet den nächsten Termin einer Person, Familientermine eingeschlossen", () => {
    const appts = [
      appointment({ title: "Elternabend", start: "2026-11-12 19:00", end: "2026-11-12 20:00", owner_id: anna.id }),
      appointment({ title: "Zahnarzt", start: "2026-11-13 09:00", end: "2026-11-13 10:00", owner_id: jack.id }),
      appointment({ title: "Familienessen", start: "2026-11-14 12:00", end: "2026-11-14 14:00", is_all_family: true }),
      appointment({
        title: "Fußball",
        start: "2026-11-15 10:00",
        end: "2026-11-15 11:00",
        owner_id: anna.id,
        participants: [participant(jack.id)],
      }),
    ];
    const hits = runVoiceQuery(query({ category: "appointment", ...forJack, limit: 5 }), data(...appts), NOW);
    expect(hits.map((h) => h.title)).toEqual(["Zahnarzt", "Familienessen", "Fußball"]);
    expect(hits[0].people).toEqual(["Jack"]);
    expect(hits[2].people).toEqual(["Anna", "Jack"]);
  });

  it("ordnet Geburtstage einer Person über den Titel zu, nicht über Familientermine", () => {
    const hits = runVoiceQuery(
      query({ category: "birthday", ...forJack, limit: 5 }),
      data(birthday("Oma Erika", 12, 3, 1946), birthday("Jack", 20, 11, 1990)),
      NOW
    );
    expect(hits.map((h) => h.title)).toEqual(["Jack"]);
  });

  it("lässt Vergangenes, Gelöschtes und bereits Begonnenes weg", () => {
    const appts = [
      appointment({ title: "Gestern", start: "2026-11-10 09:00", end: "2026-11-10 10:00" }),
      appointment({ title: "Heute früh", start: "2026-11-11 08:00", end: "2026-11-11 09:00" }),
      appointment({ title: "Gelöscht", start: "2026-11-12 09:00", end: "2026-11-12 10:00", is_deleted: true }),
      appointment({ title: "Heute Nachmittag", start: "2026-11-11 15:00", end: "2026-11-11 16:00" }),
    ];
    const hits = runVoiceQuery(query({ limit: 5 }), data(...appts), NOW);
    expect(hits.map((h) => h.title)).toEqual(["Heute Nachmittag"]);
  });

  it("begrenzt auf den gefragten Zeitraum und nimmt den ganzen Tag", () => {
    const appts = [
      appointment({ title: "Davor", start: "2026-11-11 15:00", end: "2026-11-11 16:00" }),
      appointment({ title: "Früh", start: "2026-11-12 07:00", end: "2026-11-12 08:00" }),
      appointment({ title: "Spät", start: "2026-11-12 23:00", end: "2026-11-12 23:30" }),
      appointment({ title: "Danach", start: "2026-11-13 09:00", end: "2026-11-13 10:00" }),
    ];
    const hits = runVoiceQuery(query({ from_date: "2026-11-12", to_date: "2026-11-12", limit: 10 }), data(...appts), NOW);
    expect(hits.map((h) => h.title)).toEqual(["Früh", "Spät"]);
  });

  it("löst Serien auf", () => {
    // Jeden Freitag 17:00
    const start = d("2026-10-02 17:00");
    const training = appointment({
      title: "Training",
      start: "2026-10-02 17:00",
      end: "2026-10-02 18:00",
      recurrence_rule: buildRecurrenceRule({ freq: "weekly", start, end: { mode: "none" } }),
    });
    const hits = runVoiceQuery(query({ search: "training", limit: 2 }), data(training), NOW);
    expect(hits.map((h) => h.start.getTime())).toEqual([d("2026-11-13 17:00").getTime(), d("2026-11-20 17:00").getTime()]);
  });

  it("sucht nach Stichwort in Titel und Notizen", () => {
    const appts = [
      appointment({ title: "Zahnarzttermin", start: "2026-11-20 09:00", end: "2026-11-20 10:00" }),
      appointment({ title: "Kinderarzt", notes: "Zahnstand prüfen", start: "2026-11-22 09:00", end: "2026-11-22 10:00" }),
      appointment({ title: "Friseur", start: "2026-11-12 09:00", end: "2026-11-12 10:00" }),
    ];
    const hits = runVoiceQuery(query({ search: "zahn", limit: 5 }), data(...appts), NOW);
    expect(hits.map((h) => h.title)).toEqual(["Zahnarzttermin", "Kinderarzt"]);
  });

  it("gibt nichts zurück, wenn nichts passt", () => {
    expect(runVoiceQuery(query({ category: "event" }), data(appointment({ start: "2026-11-12 09:00", end: "2026-11-12 10:00" })), NOW)).toEqual([]);
  });

  it("trennt Ereignisse und andere Jahrestage von Geburtstagen", () => {
    const wedding: AppointmentWithParticipants = {
      ...appointment(),
      ...anniversaryRecord({ kind: "wedding", title: "Mama & Papa", day: 14, month: 11, year: 2000, notes: null }),
    };
    const holiday = appointment({ title: "Feiertag", is_event: true, is_all_day: true, start: "2026-11-15 00:00", end: "2026-11-15 23:59" });
    const all = data(wedding, holiday, birthday("Jack", 20, 11, 1990));
    expect(runVoiceQuery(query({ category: "anniversary", limit: 5 }), all, NOW).map((h) => h.title)).toEqual(["Mama & Papa"]);
    expect(runVoiceQuery(query({ category: "event", limit: 5 }), all, NOW).map((h) => h.title)).toEqual(["Feiertag"]);
    expect(runVoiceQuery(query({ category: "birthday", limit: 5 }), all, NOW).map((h) => h.title)).toEqual(["Jack"]);
  });
});

describe("describeQuery", () => {
  it.each([
    [query({ category: "birthday" }), "Nächster Geburtstag"],
    [query({ category: "appointment", ...forJack }), "Nächster Termin für Jack"],
    [query({ category: "event" }), "Nächstes Ereignis"],
    [query({ category: "any", limit: 5 }), "Nächste Termine"],
    [query({ category: "any", limit: 10, from_date: "2026-11-12", to_date: "2026-11-12" }), "Termine, am Do., 12. November"],
    [query({ category: "appointment", limit: 5, search: "Zahnarzt" }), "Nächste Termine zu „Zahnarzt“"],
  ])("%#", (q, expected) => {
    expect(describeQuery(q)).toBe(expected);
  });
});

describe("checkQuery", () => {
  const members = [jack, anna].map((m) => ({ id: m.id, name: m.name }));
  const raw = { category: "appointment" as const, person: null, search: null, from_date: null, to_date: null, limit: 1 };

  it("ordnet Namen einem Familienmitglied zu (ohne Rücksicht auf Groß-/Kleinschreibung)", () => {
    const result = checkQuery({ ...raw, person: "jack" }, members);
    expect(result).toMatchObject({ ok: true, query: { person: "Jack", person_id: jack.id, search: null } });
  });

  it("macht einen unbekannten Namen zum Suchbegriff", () => {
    const result = checkQuery({ ...raw, category: "birthday", person: "Oma Erika" }, members);
    expect(result).toMatchObject({ ok: true, query: { person: null, person_id: null, search: "Oma Erika" } });
  });

  it("begrenzt die Trefferzahl auf 1 bis 10", () => {
    expect(checkQuery({ ...raw, limit: 99 }, members)).toMatchObject({ ok: true, query: { limit: 10 } });
    expect(checkQuery({ ...raw, limit: 0 }, members)).toMatchObject({ ok: true, query: { limit: 1 } });
  });

  it("weist ungültige Daten und verdrehte Zeiträume ab", () => {
    const bad = checkQuery({ ...raw, from_date: "2026-02-30" }, members);
    expect(bad.ok).toBe(false);
    const reversed = checkQuery({ ...raw, from_date: "2026-11-20", to_date: "2026-11-12" }, members);
    expect(reversed.ok).toBe(false);
  });

  it("weist eine fehlende Frage ab", () => {
    expect(checkQuery(null, members).ok).toBe(false);
  });
});
