"use client";
import { useEffect, useState } from "react";
import { CalendarClock, ListTodo, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useDataStore } from "@/lib/store/dataStore";
import { useTodoStore } from "@/lib/store/todoStore";
import { sortTodos } from "@/lib/utils/todos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import TodoCard from "./TodoCard";
import AssigneeSelect from "./AssigneeSelect";
import type { TodoWithItems } from "@/lib/supabase/types";

/** Slide-over todo list, opened from the nav on every screen. */
export default function TodoSheet() {
  const { family, todos, addTodo } = useDataStore();
  const { isSidebarOpen, toggleSidebar } = useTodoStore();
  const [newTitle, setNewTitle] = useState("");
  const [newAssigneeId, setNewAssigneeId] = useState<string | null>(null);
  const [newDueDate, setNewDueDate] = useState("");

  const openCount = todos.filter((t) => !t.is_done).length;
  const sorted = sortTodos(todos);

  useEffect(() => {
    if (!isSidebarOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && toggleSidebar();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isSidebarOpen, toggleSidebar]);

  async function handleAddTodo() {
    const title = newTitle.trim();
    if (!title || !family) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("todos")
      .insert({
        family_id: family.id,
        title,
        assignee_id: newAssigneeId,
        due_date: newDueDate || null,
      })
      .select()
      .single();
    if (error || !data) {
      console.error("Todo konnte nicht angelegt werden.", error);
      return;
    }
    addTodo({ ...(data as TodoWithItems), items: [] });
    setNewTitle("");
    setNewAssigneeId(null);
    setNewDueDate("");
  }

  if (!isSidebarOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={toggleSidebar} />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-[var(--border)] bg-[var(--card)] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 shrink-0">
          <span className="flex items-center gap-2 text-lg font-semibold">
            <ListTodo className="w-5 h-5" />
            Todos
            {openCount > 0 && (
              <span className="text-sm font-normal text-[var(--muted-foreground)] tabular">{openCount} offen</span>
            )}
          </span>
          <Button variant="ghost" size="icon" onClick={toggleSidebar} title="Todos schließen">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="space-y-2 px-5 pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddTodo()}
              placeholder="Neues Todo …"
              className="flex-1 min-w-0"
            />
            <AssigneeSelect value={newAssigneeId} onChange={setNewAssigneeId} />
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
              <CalendarClock className="h-3.5 w-3.5" />
              Endtermin
            </label>
            <input
              type="date"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddTodo()}
              className="h-8 flex-1 min-w-0 rounded-md border border-[var(--input)] bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
            />
            {newDueDate && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                title="Endtermin entfernen"
                onClick={() => setNewDueDate("")}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-2">
          {sorted.length === 0 && (
            <p className="text-sm text-[var(--muted-foreground)] text-center py-10">
              Noch keine Todos.
            </p>
          )}
          {sorted.map((todo) => (
            <TodoCard key={todo.id} todo={todo} />
          ))}
        </div>
      </aside>
    </div>
  );
}
