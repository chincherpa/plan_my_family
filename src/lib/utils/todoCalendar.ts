import { localDateStr } from "@/lib/utils";
import { ALL_COLUMN_ID } from "@/components/calendar/model";
import type { FamilyMember, TodoWithItems } from "@/lib/supabase/types";

/**
 * Open todos whose due date ("Endtermin") falls on `day`, grouped by the
 * calendar column they belong to: the assignee's column (Bearbeiter) when the
 * todo is assigned to a known family member, otherwise the "Alle" column.
 *
 * Done todos are dropped — a completed deadline no longer needs a reminder.
 */
export function todosDueByColumn(
  todos: TodoWithItems[],
  day: Date,
  members: FamilyMember[]
): Map<string, TodoWithItems[]> {
  const dayKey = localDateStr(day);
  const memberIds = new Set(members.map((m) => m.id));
  const byColumn = new Map<string, TodoWithItems[]>();

  for (const todo of todos) {
    if (todo.is_done || !todo.due_date) continue;
    if (todo.due_date !== dayKey) continue;
    const columnId =
      todo.assignee_id && memberIds.has(todo.assignee_id)
        ? todo.assignee_id
        : ALL_COLUMN_ID;
    const list = byColumn.get(columnId) ?? [];
    list.push(todo);
    byColumn.set(columnId, list);
  }

  return byColumn;
}
