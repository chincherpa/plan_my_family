"use client";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useDataStore } from "@/lib/store/dataStore";
import { Checkbox } from "@/components/ui/checkbox";
import InlineEditText from "./InlineEditText";
import AssigneeSelect from "./AssigneeSelect";
import type { TodoItem } from "@/lib/supabase/types";

export default function TodoItemRow({ todoId, item }: { todoId: string; item: TodoItem }) {
  const { updateTodoItem, removeTodoItem } = useDataStore();

  async function patch(updates: Partial<TodoItem>) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("todo_items")
      .update(updates)
      .eq("id", item.id)
      .select()
      .single();
    if (error || !data) {
      console.error("Unterpunkt konnte nicht gespeichert werden.", error);
      return;
    }
    updateTodoItem(todoId, item.id, data as TodoItem);
  }

  async function handleRemove() {
    const supabase = createClient();
    const { error } = await supabase.from("todo_items").delete().eq("id", item.id);
    if (error) {
      console.error("Unterpunkt konnte nicht gelöscht werden.", error);
      return;
    }
    removeTodoItem(todoId, item.id);
  }

  return (
    <div className="group flex items-center gap-2 pl-6 pr-1 py-1 rounded hover:bg-[var(--accent)]/50">
      <Checkbox checked={item.is_done} onCheckedChange={(checked) => patch({ is_done: checked })} />
      <InlineEditText
        value={item.title}
        done={item.is_done}
        onSave={(title) => patch({ title })}
        className="flex-1 min-w-0 text-xs"
      />
      <AssigneeSelect
        compact
        value={item.assignee_id}
        onChange={(assignee_id) => patch({ assignee_id })}
      />
      <button
        type="button"
        onClick={handleRemove}
        className="shrink-0 opacity-0 group-hover:opacity-100 text-[var(--muted-foreground)] hover:text-[var(--destructive)] transition-opacity"
        title="Unterpunkt entfernen"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
