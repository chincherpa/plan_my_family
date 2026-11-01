import { describe, it, expect } from "vitest";
import { sortTodos } from "@/lib/utils/todos";
import type { TodoWithItems } from "@/lib/supabase/types";

function todo(overrides: Partial<TodoWithItems> & { id: string; created_at: string }): TodoWithItems {
  return {
    family_id: "family-1",
    title: "Todo",
    assignee_id: null,
    is_done: false,
    items: [],
    ...overrides,
  };
}

describe("sortTodos", () => {
  it("keeps open todos in creation order", () => {
    const a = todo({ id: "a", created_at: "2026-01-01T00:00:00Z" });
    const b = todo({ id: "b", created_at: "2026-01-02T00:00:00Z" });

    expect(sortTodos([b, a]).map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("moves done todos below open ones regardless of creation order", () => {
    const doneEarly = todo({ id: "done", created_at: "2026-01-01T00:00:00Z", is_done: true });
    const openLate = todo({ id: "open", created_at: "2026-01-05T00:00:00Z", is_done: false });

    expect(sortTodos([doneEarly, openLate]).map((t) => t.id)).toEqual(["open", "done"]);
  });

  it("keeps done todos in creation order among themselves", () => {
    const a = todo({ id: "a", created_at: "2026-01-01T00:00:00Z", is_done: true });
    const b = todo({ id: "b", created_at: "2026-01-02T00:00:00Z", is_done: true });

    expect(sortTodos([b, a]).map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("does not mutate the input array", () => {
    const list = [
      todo({ id: "a", created_at: "2026-01-01T00:00:00Z", is_done: true }),
      todo({ id: "b", created_at: "2026-01-02T00:00:00Z" }),
    ];
    const copy = [...list];

    sortTodos(list);

    expect(list).toEqual(copy);
  });
});
