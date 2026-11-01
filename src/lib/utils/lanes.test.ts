import { describe, expect, it } from "vitest";
import { assignLanes } from "@/lib/utils/lanes";

describe("assignLanes", () => {
  it("keeps non-overlapping items in a single lane", () => {
    const a = { start: 0, end: 10 };
    const b = { start: 10, end: 20 };
    const lanes = assignLanes([a, b]);
    expect(lanes.get(a)).toEqual({ lane: 0, lanes: 1 });
    expect(lanes.get(b)).toEqual({ lane: 0, lanes: 1 });
  });

  it("puts overlapping items side by side", () => {
    const a = { start: 0, end: 30 };
    const b = { start: 10, end: 20 };
    const lanes = assignLanes([a, b]);
    expect(lanes.get(a)).toEqual({ lane: 0, lanes: 2 });
    expect(lanes.get(b)).toEqual({ lane: 1, lanes: 2 });
  });

  it("reuses a freed lane within a cluster and shares the lane count", () => {
    const a = { start: 0, end: 60 };
    const b = { start: 0, end: 20 };
    const c = { start: 30, end: 50 };
    const lanes = assignLanes([a, b, c]);
    expect(lanes.get(c)).toEqual({ lane: 1, lanes: 2 });
  });

  it("starts a new cluster once everything before has ended", () => {
    const a = { start: 0, end: 30 };
    const b = { start: 10, end: 20 };
    const c = { start: 40, end: 50 };
    expect(assignLanes([a, b, c]).get(c)).toEqual({ lane: 0, lanes: 1 });
  });
});
