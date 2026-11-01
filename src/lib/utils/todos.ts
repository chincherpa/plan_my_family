import type { TodoWithItems } from "@/lib/supabase/types";

/** Open todos first (creation order), then done todos (creation order). */
export function sortTodos(todos: TodoWithItems[]): TodoWithItems[] {
  return [...todos].sort((a, b) => {
    if (a.is_done !== b.is_done) return a.is_done ? 1 : -1;
    return a.created_at.localeCompare(b.created_at);
  });
}
