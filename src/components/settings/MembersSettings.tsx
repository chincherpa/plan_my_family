"use client";
import { useState } from "react";
import { Plus, Pencil, Trash2, ChevronLeft, GripVertical } from "lucide-react";
import Link from "next/link";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createClient } from "@/lib/supabase/client";
import { useDataStore } from "@/lib/store/dataStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FamilyMember } from "@/lib/supabase/types";

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6",
];

function SortableMemberRow({
  member,
  onEdit,
  onDelete,
}: {
  member: FamilyMember;
  onEdit: (m: FamilyMember) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: member.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border)] bg-[var(--card)]"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-[var(--muted-foreground)] touch-none"
        type="button"
        tabIndex={-1}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <div
        className="w-8 h-8 rounded-full flex-shrink-0"
        style={{ backgroundColor: member.color }}
      />
      <div className="flex-1 min-w-0">
        <p className="font-medium">{member.name}</p>
        <p className="text-xs text-[var(--muted-foreground)]">
          {member.is_guardian && "Erziehungsberechtigt"}
          {member.is_guardian && member.cannot_be_alone && " · "}
          {member.cannot_be_alone && "Kann nicht alleine sein"}
        </p>
      </div>
      <Button variant="ghost" size="icon" onClick={() => onEdit(member)}>
        <Pencil className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onDelete(member.id)}
        className="text-[var(--destructive)] hover:text-[var(--destructive)]"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}

export default function MembersSettings() {
  const { members, family, setMembers, reorderMembers } = useDataStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [editing, setEditing] = useState<FamilyMember | null>(null);

  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [cannotBeAlone, setCannotBeAlone] = useState(false);
  const [isGuardian, setIsGuardian] = useState(false);
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setEditing(null);
    setName("");
    setColor(PRESET_COLORS[members.length % PRESET_COLORS.length]);
    setCannotBeAlone(false);
    setIsGuardian(false);
    setDialogOpen(true);
  }

  function openEdit(member: FamilyMember) {
    setEditing(member);
    setName(member.name);
    setColor(member.color);
    setCannotBeAlone(member.cannot_be_alone);
    setIsGuardian(member.is_guardian);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!family || !name.trim()) return;
    setSaving(true);
    const supabase = createClient();

    if (editing) {
      const { data } = await supabase
        .from("family_members")
        .update({ name: name.trim(), color, cannot_be_alone: cannotBeAlone, is_guardian: isGuardian })
        .eq("id", editing.id)
        .select();
      const rows = data as FamilyMember[] | null;
      if (rows) setMembers(members.map((m) => (m.id === editing.id ? rows[0] : m)));
    } else {
      const { data } = await supabase
        .from("family_members")
        .insert({
          family_id: family.id,
          name: name.trim(),
          color,
          cannot_be_alone: cannotBeAlone,
          is_guardian: isGuardian,
          sort_order: members.length,
        })
        .select();
      const rows = data as FamilyMember[] | null;
      if (rows) setMembers([...members, rows[0]]);
    }

    setSaving(false);
    setDialogOpen(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Mitglied wirklich löschen?")) return;
    const supabase = createClient();
    await supabase.from("family_members").delete().eq("id", id);
    setMembers(members.filter((m) => m.id !== id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = members.findIndex((m) => m.id === active.id);
    const newIndex = members.findIndex((m) => m.id === over.id);
    const reordered = arrayMove(members, oldIndex, newIndex);
    const orderedIds = reordered.map((m) => m.id);
    reorderMembers(orderedIds);

    const supabase = createClient();
    await Promise.all(
      orderedIds.map((id, i) =>
        supabase.from("family_members").update({ sort_order: i }).eq("id", id)
      )
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/settings">
          <Button variant="ghost" size="icon">
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Familienmitglieder</h1>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={members.map((m) => m.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {members.map((member) => (
              <SortableMemberRow
                key={member.id}
                member={member}
                onEdit={openEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <Button onClick={openCreate} className="gap-2">
        <Plus className="w-4 h-4" />
        Mitglied hinzufügen
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Mitglied bearbeiten" : "Neues Mitglied"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Mama, Papa, Tim"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>Farbe</Label>
              <div className="flex gap-2 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    className="w-8 h-8 rounded-full transition-transform hover:scale-110 focus:outline-none"
                    style={{
                      backgroundColor: c,
                      outline: color === c ? `3px solid ${c}` : "none",
                      outlineOffset: "2px",
                    }}
                    onClick={() => setColor(c)}
                    type="button"
                  />
                ))}
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border-0"
                  title="Eigene Farbe"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Erziehungsberechtigt</Label>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Kann Kinder beaufsichtigen
                </p>
              </div>
              <Switch checked={isGuardian} onCheckedChange={setIsGuardian} />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Kann nicht alleine sein</Label>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Benötigt immer Aufsicht
                </p>
              </div>
              <Switch checked={cannotBeAlone} onCheckedChange={setCannotBeAlone} />
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>
                Abbrechen
              </Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving || !name.trim()}>
                {saving ? "Speichern..." : "Speichern"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
