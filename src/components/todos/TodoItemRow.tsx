"use client";
import { useState } from "react";
import { X } from "lucide-react";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { createClient } from "@/lib/supabase/client";
import { useDataStore } from "@/lib/store/dataStore";
import { Checkbox } from "@/components/ui/checkbox";
import InlineEditText from "./InlineEditText";
import AssigneeSelect from "./AssigneeSelect";
import type { TodoItem } from "@/lib/supabase/types";

export default function TodoItemRow({
  todoId,
  item,
  onError,
}: {
  todoId: string;
  item: TodoItem;
  onError: (message: string) => void;
}) {
  const { updateTodoItem, removeTodoItem } = useDataStore();
  const [confirmOpen, setConfirmOpen] = useState(false);

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
      onError("Unterpunkt konnte nicht gespeichert werden.");
      return;
    }
    updateTodoItem(todoId, item.id, data as TodoItem);
  }

  async function handleRemove() {
    const supabase = createClient();
    const { error } = await supabase.from("todo_items").delete().eq("id", item.id);
    if (error) {
      console.error("Unterpunkt konnte nicht gelöscht werden.", error);
      onError("Unterpunkt konnte nicht gelöscht werden.");
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
        onClick={() => setConfirmOpen(true)}
        className="shrink-0 opacity-0 group-hover:opacity-100 text-[var(--muted-foreground)] hover:text-[var(--destructive)] transition-opacity"
        title="Unterpunkt entfernen"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`„${item.title}“ löschen?`}
        description="Der Unterpunkt wird dauerhaft gelöscht."
        onConfirm={handleRemove}
      />
    </div>
  );
}
