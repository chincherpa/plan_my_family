"use client";
import { useState } from "react";
import { CalendarClock, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useDataStore } from "@/lib/store/dataStore";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import InlineEditText from "./InlineEditText";
import AssigneeSelect from "./AssigneeSelect";
import TodoItemRow from "./TodoItemRow";
import type { Todo, TodoWithItems, TodoItem } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

export default function TodoCard({ todo }: { todo: TodoWithItems }) {
  const { family, updateTodo, removeTodo, addTodoItem } = useDataStore();
  const [newItemTitle, setNewItemTitle] = useState("");

  async function patch(updates: Partial<Todo>) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("todos")
      .update(updates)
      .eq("id", todo.id)
      .select()
      .single();
    if (error || !data) {
      console.error("Todo konnte nicht gespeichert werden.", error);
      return;
    }
    updateTodo(todo.id, data as Todo);
  }

  async function handleRemove() {
    if (todo.items.length > 0 && !confirm(`"${todo.title}" mit ${todo.items.length} Unterpunkt(en) löschen?`)) {
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.from("todos").delete().eq("id", todo.id);
    if (error) {
      console.error("Todo konnte nicht gelöscht werden.", error);
      return;
    }
    removeTodo(todo.id);
  }

  async function handleAddItem() {
    const title = newItemTitle.trim();
    if (!title || !family) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("todo_items")
      .insert({
        todo_id: todo.id,
        family_id: family.id,
        title,
        sort_order: todo.items.length,
      })
      .select()
      .single();
    if (error || !data) {
      console.error("Unterpunkt konnte nicht angelegt werden.", error);
      return;
    }
    addTodoItem(todo.id, data as TodoItem);
    setNewItemTitle("");
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 space-y-1.5",
        todo.is_done && "opacity-60"
      )}
    >
      <div className="group flex items-center gap-2">
        <Checkbox checked={todo.is_done} onCheckedChange={(checked) => patch({ is_done: checked })} />
        <InlineEditText
          value={todo.title}
          done={todo.is_done}
          onSave={(title) => patch({ title })}
          className="flex-1 min-w-0 text-sm font-medium"
        />
        <AssigneeSelect
          compact
          value={todo.assignee_id}
          onChange={(assignee_id) => patch({ assignee_id })}
        />
        <button
          type="button"
          onClick={handleRemove}
          className="shrink-0 opacity-0 group-hover:opacity-100 text-[var(--muted-foreground)] hover:text-[var(--destructive)] transition-opacity"
          title="Todo löschen"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-1.5 pl-6 text-xs text-[var(--muted-foreground)]">
        <CalendarClock className="h-3 w-3 shrink-0" aria-label="Endtermin" />
        <input
          type="date"
          value={todo.due_date ?? ""}
          onChange={(e) => patch({ due_date: e.target.value || null })}
          title="Endtermin"
          className="h-6 rounded-md border border-transparent bg-transparent px-1 text-xs hover:border-[var(--input)] focus-visible:border-[var(--input)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
        />
        {todo.due_date && (
          <button
            type="button"
            onClick={() => patch({ due_date: null })}
            className="shrink-0 text-[var(--muted-foreground)] hover:text-[var(--destructive)]"
            title="Endtermin entfernen"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {todo.items.length > 0 && (
        <div className="space-y-0.5">
          {todo.items.map((item) => (
            <TodoItemRow key={item.id} todoId={todo.id} item={item} />
          ))}
        </div>
      )}

      <div className="pl-6">
        <Input
          value={newItemTitle}
          onChange={(e) => setNewItemTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAddItem()}
          onBlur={() => newItemTitle.trim() && handleAddItem()}
          placeholder="Unterpunkt hinzufügen …"
          className="h-6 px-1.5 py-0 text-xs border-none shadow-none bg-transparent placeholder:text-[var(--muted-foreground)]/60"
        />
      </div>
    </div>
  );
}
