"use client";
import { useState } from "react";
import { UtensilsCrossed } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useDataStore } from "@/lib/store/dataStore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Meal } from "@/lib/supabase/types";

interface MealEditDialogProps {
  /** Local date "YYYY-MM-DD" */
  date: string;
  meal: Meal | null;
  onClose: () => void;
}

export default function MealEditDialog({ date, meal, onClose }: MealEditDialogProps) {
  const { family, upsertMeal } = useDataStore();
  const [lunch, setLunch] = useState(meal?.lunch ?? "");
  const [dinner, setDinner] = useState(meal?.dinner ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dateLabel = new Date(`${date}T12:00:00`).toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  async function handleSave() {
    if (!family) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: saveError } = await supabase
      .from("meals")
      .upsert(
        {
          family_id: family.id,
          date,
          lunch: lunch.trim() || null,
          dinner: dinner.trim() || null,
        },
        { onConflict: "family_id,date" }
      )
      .select()
      .single();

    setSaving(false);
    if (saveError || !data) {
      setError("Essensplan konnte nicht gespeichert werden.");
      return;
    }
    upsertMeal(data as Meal);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UtensilsCrossed className="w-4 h-4" />
            Essensplan — {dateLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>🥗 Mittag</Label>
            <Input
              value={lunch}
              onChange={(e) => setLunch(e.target.value)}
              placeholder="z.B. Nudeln mit Tomatensoße"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>🍲 Abend</Label>
            <Input
              value={dinner}
              onChange={(e) => setDinner(e.target.value)}
              placeholder="z.B. Brotzeit"
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
          </div>

          {error && (
            <p className="text-sm text-[var(--destructive)] bg-[var(--destructive)]/10 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose} type="button">
              Abbrechen
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              {saving ? "Speichern..." : "Speichern"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
