import { describe, it, expect } from "vitest";
import { todosDueByColumn } from "@/lib/utils/todoCalendar";
import { ALL_COLUMN_ID } from "@/components/calendar/model";
import type { FamilyMember, TodoWithItems } from "@/lib/supabase/types";

function member(id: string): FamilyMember {
  return { id, family_id: "family-1", name: id, color: "#000000" } as FamilyMember;
}

function todo(overrides: Partial<TodoWithItems> & { id: string }): TodoWithItems {
  return {
    family_id: "family-1",
    title: "Todo",
    assignee_id: null,
    due_date: null,
    is_done: false,
    created_at: "2026-01-01T00:00:00Z",
    items: [],
    ...overrides,
  };
}

const members = [member("alice"), member("bob")];
const day = new Date(2026, 0, 15); // local 2026-01-15

describe("todosDueByColumn", () => {
  it("places an assigned todo in its assignee's column", () => {
    const result = todosDueByColumn(
      [todo({ id: "t1", assignee_id: "alice", due_date: "2026-01-15" })],
      day,
      members
    );
    expect(result.get("alice")?.map((t) => t.id)).toEqual(["t1"]);
    expect(result.has(ALL_COLUMN_ID)).toBe(false);
  });

  it("places an unassigned todo in the 'Alle' column", () => {
    const result = todosDueByColumn(
      [todo({ id: "t1", assignee_id: null, due_date: "2026-01-15" })],
      day,
      members
    );
    expect(result.get(ALL_COLUMN_ID)?.map((t) => t.id)).toEqual(["t1"]);
  });

  it("falls back to 'Alle' when the assignee is no longer a family member", () => {
    const result = todosDueByColumn(
      [todo({ id: "t1", assignee_id: "ghost", due_date: "2026-01-15" })],
      day,
      members
    );
    expect(result.get(ALL_COLUMN_ID)?.map((t) => t.id)).toEqual(["t1"]);
  });

  it("ignores todos due on another day", () => {
    const result = todosDueByColumn(
      [todo({ id: "t1", due_date: "2026-01-16" })],
      day,
      members
    );
    expect(result.size).toBe(0);
  });

  it("ignores todos without a due date", () => {
    const result = todosDueByColumn([todo({ id: "t1", due_date: null })], day, members);
    expect(result.size).toBe(0);
  });

  it("ignores completed todos", () => {
    const result = todosDueByColumn(
      [todo({ id: "t1", due_date: "2026-01-15", is_done: true })],
      day,
      members
    );
    expect(result.size).toBe(0);
  });
});
