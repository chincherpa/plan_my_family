import { describe, expect, it } from "vitest";
import { appointment, d, member, occurrence, participant } from "@/lib/utils/__fixtures__/calendar";
import { buildDayData } from "@/components/calendar/model";
import { appointmentsByMember, familyParticipants, isOngoing, isPast } from "./dashboard";

const anna = member({ name: "Anna" });
const ben = member({ name: "Ben" });
const day = d("2026-06-01");

function titles(result: ReturnType<typeof appointmentsByMember>, memberId: string) {
  return result.members.find((r) => r.member.id === memberId)!.entries.map((e) => `${e.occ.appointment.title}${e.isOwner ? "" : "*"}`);
}

describe("appointmentsByMember", () => {
  it("sorts all-day first, then timed by start, and places participants", () => {
    const late = appointment({ title: "Sport", owner_id: anna.id, start: "2026-06-01 17:00", end: "2026-06-01 18:00" });
    const early = appointment({
      title: "Arzt",
      owner_id: anna.id,
      start: "2026-06-01 08:00",
      end: "2026-06-01 09:00",
      participants: [participant(ben.id)],
    });
    const allDay = appointment({
      title: "Ausflug",
      owner_id: anna.id,
      is_all_day: true,
      start: "2026-06-01 00:00",
      end: "2026-06-02 00:00",
    });
    const data = buildDayData(day, [late, early, allDay].map((a) => occurrence(a)), []);
    const result = appointmentsByMember(data, [anna, ben]);
    expect(titles(result, anna.id)).toEqual(["Ausflug", "Arzt", "Sport"]);
    expect(titles(result, ben.id)).toEqual(["Arzt*"]);
  });

  it("puts all-family appointments into the family list only and skips Ereignisse", () => {
    const family = appointment({ title: "Essen", is_all_family: true, owner_id: null });
    const birthday = appointment({
      title: "Geburtstag Oma",
      is_event: true,
      start: "2026-06-01 00:00",
      end: "2026-06-02 00:00",
    });
    const data = buildDayData(day, [family, birthday].map((a) => occurrence(a)), []);
    const result = appointmentsByMember(data, [anna, ben]);
    expect(titles(result, anna.id)).toEqual([]);
    expect(titles(result, ben.id)).toEqual([]);
    expect(result.family.map((e) => e.occ.appointment.title)).toEqual(["Essen"]);
  });

  it("ignores appointments of other days", () => {
    const tomorrow = appointment({ owner_id: anna.id, start: "2026-06-02 09:00", end: "2026-06-02 10:00" });
    const data = buildDayData(day, [occurrence(tomorrow)], []);
    expect(appointmentsByMember(data, [anna]).members[0].entries).toEqual([]);
  });
});

describe("isPast / isOngoing", () => {
  const occ = occurrence(appointment({ start: "2026-06-01 09:00", end: "2026-06-01 10:00" }));

  it("is past once the end time is reached", () => {
    expect(isPast(occ, d("2026-06-01 09:59"))).toBe(false);
    expect(isPast(occ, d("2026-06-01 10:00"))).toBe(true);
  });

  it("is ongoing between start and end", () => {
    expect(isOngoing(occ, d("2026-06-01 08:59"))).toBe(false);
    expect(isOngoing(occ, d("2026-06-01 09:00"))).toBe(true);
    expect(isOngoing(occ, d("2026-06-01 10:00"))).toBe(false);
  });

  it("an all-day appointment is never 'ongoing' and only past after its day", () => {
    const allDay = occurrence(
      appointment({ is_all_day: true, start: "2026-06-01 00:00", end: "2026-06-02 00:00" })
    );
    expect(isOngoing(allDay, d("2026-06-01 12:00"))).toBe(false);
    expect(isPast(allDay, d("2026-06-01 23:59"))).toBe(false);
  });
});

describe("familyParticipants", () => {
  it("is null when everyone takes part", () => {
    expect(familyParticipants(appointment({ is_all_family: true }), [anna, ben])).toBeNull();
    expect(
      familyParticipants(
        appointment({ is_all_family: true, participants: [participant(anna.id), participant(ben.id)] }),
        [anna, ben]
      )
    ).toBeNull();
  });

  it("lists the participants when someone is left out", () => {
    const appt = appointment({ is_all_family: true, participants: [participant(ben.id)] });
    expect(familyParticipants(appt, [anna, ben])?.map((m) => m.name)).toEqual(["Ben"]);
  });
});
