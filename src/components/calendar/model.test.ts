import { describe, it, expect } from "vitest";
import { appointment, d, occurrence } from "@/lib/utils/__fixtures__/calendar";
import type { SchoolHoliday } from "@/lib/supabase/types";
import {
  EVENT_COLOR,
  HOLIDAY_COLOR,
  buildDayData,
  parseDayFilter,
  sideBarItems,
  sideGutterWidth,
  upcomingDays,
} from "./model";

const herbst: SchoolHoliday = {
  id: "h1",
  family_id: "family-1",
  name: "Herbstferien 2027",
  start_date: "2027-11-02",
  end_date: "2027-11-06",
  created_at: "2027-01-01T00:00:00Z",
};

describe("sideBarItems", () => {
  const birthday = appointment({
    title: "Anna",
    is_event: true,
    is_all_day: true,
    anniversary_kind: "birthday",
    start: "2027-11-03 00:00",
    end: "2027-11-04 00:00",
  });
  const allDay = appointment({
    title: "Ausflug",
    is_all_day: true,
    start: "2027-11-03 00:00",
    end: "2027-11-04 00:00",
  });

  it("lists holidays first, then Ereignisse — but not plain all-day appointments", () => {
    const data = buildDayData(d("2027-11-03"), [occurrence(birthday), occurrence(allDay)], []);
    const items = sideBarItems(data, [herbst]);
    expect(items.map((i) => [i.title, i.color, !!i.occ])).toEqual([
      ["Schulferien: Herbstferien 2027", HOLIDAY_COLOR, false],
      ["Anna", EVENT_COLOR, true],
    ]);
  });

  it("is empty on a day without holidays or Ereignisse", () => {
    const data = buildDayData(d("2027-11-08"), [occurrence(birthday)], []);
    expect(sideBarItems(data, [herbst])).toEqual([]);
  });
});

describe("sideGutterWidth", () => {
  it("takes no space when no day needs a bar", () => {
    expect(sideGutterWidth(0)).toBe(0);
    expect(sideGutterWidth(2)).toBeGreaterThan(sideGutterWidth(1));
  });
});

describe("upcomingDays", () => {
  // Sonntag, 22.11.2026
  const sunday = new Date(2026, 10, 22);

  it("liefert ohne Filter die nächsten Tage", () => {
    const days = upcomingDays(sunday, 3, "all", 365);
    expect(days.map((x) => x.getDate())).toEqual([23, 24, 25]);
  });

  it("zeigt nur Wochenenden", () => {
    const days = upcomingDays(sunday, 4, "weekend", 365);
    expect(days.map((x) => [x.getDate(), x.getDay()])).toEqual([
      [28, 6],
      [29, 0],
      [5, 6],
      [6, 0],
    ]);
  });

  it("zeigt nur einen Wochentag", () => {
    const days = upcomingDays(sunday, 3, 1, 365);
    expect(days.map((x) => x.getDate())).toEqual([23, 30, 7]);
  });

  it("schaut nicht weiter als maxDays", () => {
    expect(upcomingDays(sunday, 10, 1, 14)).toHaveLength(2);
  });
});

describe("parseDayFilter", () => {
  it("erkennt gültige Werte und fällt sonst auf 'all' zurück", () => {
    expect(parseDayFilter("weekend")).toBe("weekend");
    expect(parseDayFilter("0")).toBe(0);
    expect(parseDayFilter("6")).toBe(6);
    expect(parseDayFilter("7")).toBe("all");
    expect(parseDayFilter("")).toBe("all");
    expect(parseDayFilter(null)).toBe("all");
  });
});
