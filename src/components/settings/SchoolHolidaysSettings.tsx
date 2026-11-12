"use client";
import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useDataStore } from "@/lib/store/dataStore";
import type { SchoolHoliday } from "@/lib/supabase/types";
import { localDateStr } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const dateInputClass =
  "w-full rounded-md border border-[var(--input)] bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]";

/** "YYYY-MM-DD" → "29.07.2027" */
function formatDay(dateKey: string): string {
  const [y, m, d] = dateKey.split("-");
  return `${d}.${m}.${y}`;
}

function dayCount(start: string, end: string): number {
  const ms = new Date(`${end}T12:00:00`).getTime() - new Date(`${start}T12:00:00`).getTime();
  return Math.round(ms / 86400000) + 1;
}

export default function SchoolHolidaysSettings() {
  const { schoolHolidays, family, setSchoolHolidays } = useDataStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SchoolHoliday | null>(null);
  const [showPast, setShowPast] = useState(false);

  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = localDateStr(new Date());
  const pastCount = schoolHolidays.filter((h) => h.end_date < today).length;
  // Ferien sind bundeslandabhängig und werden von Hand gepflegt → erinnern, wenn nichts ansteht
  const inOneYear = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return localDateStr(d);
  }, []);
  const noUpcoming = !schoolHolidays.some((h) => h.end_date >= today && h.start_date <= inOneYear);
  const visible = useMemo(
    () => (showPast ? schoolHolidays : schoolHolidays.filter((h) => h.end_date >= today)),
    [schoolHolidays, showPast, today]
  );

  const rangeInvalid = !!startDate && !!endDate && endDate < startDate;
  const canSave = !!name.trim() && !!startDate && !!endDate && !rangeInvalid;

  function openCreate() {
    setError(null);
    setEditing(null);
    setName("");
    setStartDate("");
    setEndDate("");
    setDialogOpen(true);
  }

  function openEdit(holiday: SchoolHoliday) {
    setError(null);
    setEditing(holiday);
    setName(holiday.name);
    setStartDate(holiday.start_date);
    setEndDate(holiday.end_date);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!family || !canSave) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const values = { name: name.trim(), start_date: startDate, end_date: endDate };

    if (editing) {
      const { data, error: saveError } = await supabase
        .from("school_holidays")
        .update(values)
        .eq("id", editing.id)
        .select();
      const rows = data as SchoolHoliday[] | null;
      if (saveError || !rows?.[0]) {
        setError(saveError?.message ?? "Ferien konnten nicht gespeichert werden.");
        setSaving(false);
        return;
      }
      setSchoolHolidays(schoolHolidays.map((h) => (h.id === editing.id ? rows[0] : h)));
    } else {
      const { data, error: saveError } = await supabase
        .from("school_holidays")
        .insert({ family_id: family.id, ...values })
        .select();
      const rows = data as SchoolHoliday[] | null;
      if (saveError || !rows?.[0]) {
        setError(saveError?.message ?? "Ferien konnten nicht angelegt werden.");
        setSaving(false);
        return;
      }
      setSchoolHolidays([...schoolHolidays, rows[0]]);
    }

    setSaving(false);
    setDialogOpen(false);
  }

  async function handleDelete(holiday: SchoolHoliday) {
    if (!confirm(`„${holiday.name}“ wirklich löschen?`)) return;
    setError(null);
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("school_holidays").delete().eq("id", holiday.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setSchoolHolidays(schoolHolidays.filter((h) => h.id !== holiday.id));
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-3 py-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Link href="/settings">
            <Button variant="ghost" size="icon">
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Schulferien</h1>
        </div>

        <p className="text-sm text-[var(--muted-foreground)]">
          Ferien erscheinen im Kalender als ganztägiger Hinweis. Serientermine mit „Findet nicht in
          Schulferien statt“ entfallen an diesen Tagen und zählen dort nicht mit.
        </p>

        {noUpcoming && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            Für die nächsten 12 Monate sind keine Ferien eingetragen. Ohne sie finden Serien mit
            „Findet nicht in Schulferien statt“ auch in den Ferien statt.
          </p>
        )}

        {pastCount > 0 && (
          <div className="flex items-center gap-2">
            <Switch checked={showPast} onCheckedChange={setShowPast} />
            <Label>Vergangene Ferien anzeigen ({pastCount})</Label>
          </div>
        )}

        <div className="space-y-2">
          {visible.map((holiday) => {
            const isPast = holiday.end_date < today;
            const isNow = holiday.start_date <= today && today <= holiday.end_date;
            return (
              <div
                key={holiday.id}
                className={`flex items-center gap-3 p-3 rounded-xl border bg-[var(--card)] ${
                  isNow ? "border-teal-600" : "border-[var(--border)]"
                } ${isPast ? "opacity-60" : ""}`}
              >
                <span className="text-2xl">🏖️</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{holiday.name}</p>
                  <p className="text-sm text-[var(--muted-foreground)] tabular">
                    {formatDay(holiday.start_date)} – {formatDay(holiday.end_date)} ·{" "}
                    {dayCount(holiday.start_date, holiday.end_date)} Tage
                    {isNow && " · läuft gerade"}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => openEdit(holiday)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(holiday)}
                  className="text-[var(--destructive)] hover:text-[var(--destructive)]"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            );
          })}
          {visible.length === 0 && (
            <p className="text-[var(--muted-foreground)] text-sm py-4 text-center">
              Keine {pastCount > 0 && !showPast ? "kommenden " : ""}Ferien eingetragen.
            </p>
          )}
        </div>

        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          Ferien hinzufügen
        </Button>

        {error && !dialogOpen && <p className="text-sm text-[var(--destructive)]">{error}</p>}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Ferien bearbeiten" : "Neue Ferien"}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {error && <p className="text-sm text-[var(--destructive)]">{error}</p>}
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="z.B. Herbstferien 2027"
                  maxLength={100}
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Von</Label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      if (!endDate || endDate < e.target.value) setEndDate(e.target.value);
                    }}
                    className={dateInputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Bis einschließlich</Label>
                  <input
                    type="date"
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(e) => setEndDate(e.target.value)}
                    className={dateInputClass}
                  />
                </div>
              </div>
              {rangeInvalid && (
                <p className="text-xs text-[var(--destructive)]">Das Ende muss am oder nach dem Beginn liegen.</p>
              )}

              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>
                  Abbrechen
                </Button>
                <Button className="flex-1" onClick={handleSave} disabled={saving || !canSave}>
                  {saving ? "Speichern..." : "Speichern"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
