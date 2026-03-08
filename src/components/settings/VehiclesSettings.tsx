"use client";
import { useState } from "react";
import { Plus, Pencil, Trash2, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useDataStore } from "@/lib/store/dataStore";
import type { Vehicle } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const VEHICLE_EMOJIS = ["🚗", "🚙", "🚐", "🏎️", "🛻", "🚕", "🚌", "🚲", "🛵", "🏍️"];

export default function VehiclesSettings() {
  const { vehicles, family, setVehicles } = useDataStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);

  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(VEHICLE_EMOJIS[0]);
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setEditing(null);
    setName("");
    setEmoji(VEHICLE_EMOJIS[0]);
    setDialogOpen(true);
  }

  function openEdit(vehicle: Vehicle) {
    setEditing(vehicle);
    setName(vehicle.name);
    setEmoji(vehicle.icon_emoji);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!family || !name.trim()) return;
    setSaving(true);
    const supabase = createClient();

    if (editing) {
      const { data } = await supabase
        .from("vehicles")
        .update({ name: name.trim(), icon_emoji: emoji })
        .eq("id", editing.id)
        .select();
      const rows = data as Vehicle[] | null;
      if (rows) setVehicles(vehicles.map((v) => (v.id === editing.id ? rows[0] : v)));
    } else {
      const { data } = await supabase
        .from("vehicles")
        .insert({ family_id: family.id, name: name.trim(), icon_emoji: emoji })
        .select();
      const rows = data as Vehicle[] | null;
      if (rows) setVehicles([...vehicles, rows[0]]);
    }

    setSaving(false);
    setDialogOpen(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Fahrzeug wirklich löschen?")) return;
    const supabase = createClient();
    await supabase.from("vehicles").delete().eq("id", id);
    setVehicles(vehicles.filter((v) => v.id !== id));
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/settings">
          <Button variant="ghost" size="icon">
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Fahrzeuge</h1>
      </div>

      <div className="space-y-2">
        {vehicles.map((vehicle) => (
          <div
            key={vehicle.id}
            className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border)] bg-[var(--card)]"
          >
            <span className="text-2xl">{vehicle.icon_emoji}</span>
            <div className="flex-1">
              <p className="font-medium">{vehicle.name}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => openEdit(vehicle)}>
              <Pencil className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleDelete(vehicle.id)}
              className="text-[var(--destructive)] hover:text-[var(--destructive)]"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
        {vehicles.length === 0 && (
          <p className="text-[var(--muted-foreground)] text-sm py-4 text-center">
            Noch keine Fahrzeuge eingetragen.
          </p>
        )}
      </div>

      <Button onClick={openCreate} className="gap-2">
        <Plus className="w-4 h-4" />
        Fahrzeug hinzufügen
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Fahrzeug bearbeiten" : "Neues Fahrzeug"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. VW Golf, Familienauto"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>Symbol</Label>
              <div className="flex gap-2 flex-wrap">
                {VEHICLE_EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEmoji(e)}
                    className={`text-2xl p-1.5 rounded-lg transition-colors ${
                      emoji === e
                        ? "bg-[var(--primary)]/20 ring-2 ring-[var(--primary)]"
                        : "hover:bg-[var(--accent)]"
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
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
