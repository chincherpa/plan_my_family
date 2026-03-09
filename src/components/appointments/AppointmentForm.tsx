"use client";
import { useState, useEffect } from "react";
import { Trash2, Repeat, Car, Users, Clock, AlertTriangle } from "lucide-react";
import { RRule } from "rrule";
import { createClient } from "@/lib/supabase/client";
import { useDataStore } from "@/lib/store/dataStore";
import { useCalendarStore } from "@/lib/store/calendarStore";
import { checkVehicleConflict } from "@/lib/utils/conflicts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AppointmentWithParticipants } from "@/lib/supabase/types";
import { hexToRgba } from "@/lib/utils";

type RecurrenceFreq = "none" | "daily" | "weekly" | "monthly" | "yearly";

const pad = (n: number) => String(n).padStart(2, "0");

function snapTo15Min(date: Date): Date {
  const snapped = new Date(date);
  snapped.setMinutes(Math.round(snapped.getMinutes() / 15) * 15, 0, 0);
  return snapped;
}

/** "YYYY-MM-DD" */
function toDatePart(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "HH:MM" — always snapped to 15 min */
function toTimePart(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Combine "YYYY-MM-DD" + "HH:MM" → ISO string */
function combine(datePart: string, timePart: string): string {
  return `${datePart}T${timePart}`;
}

const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 15, 30, 45]) {
    TIME_OPTIONS.push(`${pad(h)}:${pad(m)}`);
  }
}

function DateTimePicker({
  value,
  onChange,
}: {
  value: string; // "YYYY-MM-DDTHH:MM"
  onChange: (v: string) => void;
}) {
  const [datePart, timePart] = value ? value.split("T") : ["", "00:00"];
  return (
    <div className="flex gap-1.5">
      <input
        type="date"
        value={datePart}
        onChange={(e) => onChange(combine(e.target.value, timePart))}
        className="flex-1 min-w-0 rounded-md border border-[var(--input)] bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
      />
      <select
        value={timePart}
        onChange={(e) => onChange(combine(datePart, e.target.value))}
        className="w-24 rounded-md border border-[var(--input)] bg-[var(--background)] px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
      >
        {TIME_OPTIONS.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
    </div>
  );
}

interface AppointmentFormProps {
  onClose: () => void;
}

export default function AppointmentForm({ onClose }: AppointmentFormProps) {
  const { members, vehicles, appointments, family, addAppointment, updateAppointment, removeAppointment } =
    useDataStore();
  const { formInitialDate, formMemberId, selectedAppointmentId } = useCalendarStore();

  const existingAppt = selectedAppointmentId
    ? appointments.find((a) => a.id === selectedAppointmentId)
    : null;

  // Form state
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [ownerId, setOwnerId] = useState<string>("");
  const [isAllFamily, setIsAllFamily] = useState(false);
  const [isAllDay, setIsAllDay] = useState(false);
  const [allDayStartDate, setAllDayStartDate] = useState(() => toDatePart(new Date()));
  const [allDayEndDate, setAllDayEndDate] = useState(() => toDatePart(new Date()));
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [travelBefore, setTravelBefore] = useState(0);
  const [travelAfter, setTravelAfter] = useState(0);
  const [vehicleId, setVehicleId] = useState<string>("none");
  const [participants, setParticipants] = useState<string[]>([]);
  const [supervisorIds, setSupervisorIds] = useState<string[]>([]);
  const [isEvent, setIsEvent] = useState(false);
  const [recurrence, setRecurrence] = useState<RecurrenceFreq>("none");
  const [saving, setSaving] = useState(false);
  const [vehicleConflict, setVehicleConflict] = useState<AppointmentWithParticipants | null>(null);
  const [vehicleConflicts, setVehicleConflicts] = useState<Record<string, AppointmentWithParticipants>>({});

  // Initialize from existing or new
  useEffect(() => {
    if (existingAppt) {
      setTitle(existingAppt.title);
      setNotes(existingAppt.notes ?? "");
      setOwnerId(existingAppt.owner_id ?? "");
      setIsAllFamily(existingAppt.is_all_family);
      setIsEvent(existingAppt.is_event ?? false);
      const allDay = existingAppt.is_all_day ?? false;
      setIsAllDay(allDay);
      const s = new Date(existingAppt.start_time);
      const e = new Date(existingAppt.end_time);
      if (allDay) {
        setAllDayStartDate(toDatePart(s));
        setAllDayEndDate(toDatePart(e));
      } else {
        setStartTime(combine(toDatePart(s), toTimePart(s)));
        setEndTime(combine(toDatePart(e), toTimePart(e)));
        setAllDayStartDate(toDatePart(s));
        setAllDayEndDate(toDatePart(e));
      }
      setTravelBefore(existingAppt.travel_before_min);
      setTravelAfter(existingAppt.travel_after_min);
      setVehicleId(existingAppt.vehicle_id ?? "none");
      setParticipants(existingAppt.participants.map((p) => p.member_id));
      setSupervisorIds(
        existingAppt.participants.filter((p) => p.is_supervisor).map((p) => p.member_id)
      );

      if (existingAppt.recurrence_rule) {
        try {
          const rule = RRule.fromString(existingAppt.recurrence_rule);
          if (rule.options.freq === RRule.DAILY) setRecurrence("daily");
          else if (rule.options.freq === RRule.WEEKLY) setRecurrence("weekly");
          else if (rule.options.freq === RRule.MONTHLY) setRecurrence("monthly");
          else if (rule.options.freq === RRule.YEARLY) setRecurrence("yearly");
          else setRecurrence("none");
        } catch {
          setRecurrence("none");
        }
      }
    } else {
      const now = snapTo15Min(formInitialDate ?? new Date());
      const end = new Date(now);
      end.setHours(now.getHours() + 1);
      setStartTime(combine(toDatePart(now), toTimePart(now)));
      setEndTime(combine(toDatePart(end), toTimePart(end)));
      setOwnerId(formMemberId && formMemberId !== "all" && formMemberId !== "events" ? formMemberId : members[0]?.id ?? "");
      setIsAllFamily(formMemberId === "all");
      setIsEvent(formMemberId === "events");
      const dateStr = toDatePart(formInitialDate ?? new Date());
      setAllDayStartDate(dateStr);
      setAllDayEndDate(dateStr);
    }
  }, [existingAppt, formInitialDate, formMemberId, members]);

  // Check conflicts for all vehicles when times change
  useEffect(() => {
    if (!startTime || !endTime) {
      setVehicleConflicts({});
      setVehicleConflict(null);
      return;
    }
    const conflicts: Record<string, AppointmentWithParticipants> = {};
    for (const v of vehicles) {
      const conflict = checkVehicleConflict(
        v.id,
        new Date(startTime),
        new Date(endTime),
        travelBefore,
        travelAfter,
        appointments,
        existingAppt?.id
      );
      if (conflict) conflicts[v.id] = conflict;
    }
    setVehicleConflicts(conflicts);
    setVehicleConflict(vehicleId !== "none" ? (conflicts[vehicleId] ?? null) : null);
  }, [vehicleId, startTime, endTime, travelBefore, travelAfter, appointments, existingAppt, vehicles]);

  function buildRRule(freq: RecurrenceFreq, from: Date): string | null {
    if (freq === "none") return null;
    const freqMap = {
      daily: RRule.DAILY,
      weekly: RRule.WEEKLY,
      monthly: RRule.MONTHLY,
      yearly: RRule.YEARLY,
    };
    const rule = new RRule({
      freq: freqMap[freq],
      dtstart: from,
    });
    return rule.toString();
  }

  async function handleSave() {
    if (!family || !title.trim()) return;
    if (isAllDay && !allDayStartDate) return;
    if (!isAllDay && (!startTime || !endTime)) return;
    setSaving(true);

    const supabase = createClient();
    let startDate: Date;
    let endDate: Date;
    if (isAllDay) {
      startDate = new Date(`${allDayStartDate}T00:00:00`);
      endDate = new Date(`${allDayEndDate || allDayStartDate}T23:59:59`);
    } else {
      startDate = new Date(startTime);
      endDate = new Date(endTime);
    }

    const apptData = {
      family_id: family.id,
      title: title.trim(),
      notes: notes || null,
      owner_id: isAllFamily ? null : ownerId || null,
      is_all_family: isAllFamily,
      is_event: isEvent,
      is_all_day: isAllDay,
      start_time: startDate.toISOString(),
      end_time: endDate.toISOString(),
      travel_before_min: isEvent || isAllDay ? 0 : travelBefore,
      travel_after_min: isEvent || isAllDay ? 0 : travelAfter,
      vehicle_id: isAllDay || vehicleId === "none" ? null : vehicleId,
      recurrence_rule: buildRRule(recurrence, startDate),
    };

    if (existingAppt) {
      const { data } = await supabase
        .from("appointments")
        .update(apptData)
        .eq("id", existingAppt.id)
        .select()
        .single();

      if (data) {
        // Update participants
        await supabase
          .from("appointment_participants")
          .delete()
          .eq("appointment_id", existingAppt.id);

        if (participants.length > 0) {
          await supabase.from("appointment_participants").insert(
            participants.map((memberId) => ({
              appointment_id: existingAppt.id,
              member_id: memberId,
              is_supervisor: supervisorIds.includes(memberId),
            }))
          );
        }

        const { data: fullData } = await supabase
          .from("appointments")
          .select("*, participants:appointment_participants(*)")
          .eq("id", existingAppt.id)
          .single();

        if (fullData) updateAppointment(existingAppt.id, fullData as AppointmentWithParticipants);
      }
    } else {
      const { data: insertedData } = await supabase
        .from("appointments")
        .insert(apptData)
        .select()
        .single();

      const data = insertedData as { id: string } | null;

      if (data && participants.length > 0) {
        await supabase.from("appointment_participants").insert(
          participants.map((memberId) => ({
            appointment_id: data.id,
            member_id: memberId,
            is_supervisor: supervisorIds.includes(memberId),
          }))
        );
      }

      if (data) {
        const { data: fullData } = await supabase
          .from("appointments")
          .select("*, participants:appointment_participants(*)")
          .eq("id", data.id)
          .single();

        if (fullData) addAppointment(fullData as AppointmentWithParticipants);
      }
    }

    setSaving(false);
    onClose();
  }

  async function handleDelete() {
    if (!existingAppt || !confirm("Termin wirklich löschen?")) return;
    const supabase = createClient();
    await supabase.from("appointments").delete().eq("id", existingAppt.id);
    removeAppointment(existingAppt.id);
    onClose();
  }

  function toggleParticipant(memberId: string) {
    setParticipants((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  }

  function toggleSupervisor(memberId: string) {
    setSupervisorIds((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  }

  const dependentMembers = members.filter((m) => m.cannot_be_alone);
  const showSupervisorSelect =
    dependentMembers.length > 0 && participants.some((pid) => dependentMembers.some((d) => d.id === pid));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existingAppt ? "Termin bearbeiten" : "Neuer Termin"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Title */}
          <div className="space-y-1.5">
            <Label>Titel *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Termintitel"
              autoFocus
            />
          </div>

          {/* All-day toggle */}
          <div className="flex items-center justify-between">
            <Label>Ganztägig</Label>
            <Switch checked={isAllDay} onCheckedChange={setIsAllDay} />
          </div>

          {/* Event toggle */}
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5">
              <span>🎉</span>
              Ereignis (Geburtstag, Feiertag …)
            </Label>
            <Switch checked={isEvent} onCheckedChange={setIsEvent} />
          </div>

          {/* All family toggle */}
          {!isEvent && (
            <div className="flex items-center justify-between">
              <Label>Familienausflug / Alle</Label>
              <Switch checked={isAllFamily} onCheckedChange={setIsAllFamily} />
            </div>
          )}

          {/* Owner selection */}
          {!isEvent && !isAllFamily && (
            <div className="space-y-1.5">
              <Label>Termin für</Label>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Person wählen" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block w-3 h-3 rounded-full"
                          style={{ backgroundColor: m.color }}
                        />
                        {m.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Time */}
          {isAllDay ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Von</Label>
                <input
                  type="date"
                  value={allDayStartDate}
                  onChange={(e) => setAllDayStartDate(e.target.value)}
                  className="w-full rounded-md border border-[var(--input)] bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Bis</Label>
                <input
                  type="date"
                  value={allDayEndDate}
                  min={allDayStartDate}
                  onChange={(e) => setAllDayEndDate(e.target.value)}
                  className="w-full rounded-md border border-[var(--input)] bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Von</Label>
                <DateTimePicker value={startTime} onChange={setStartTime} />
              </div>
              <div className="space-y-1.5">
                <Label>Bis</Label>
                <DateTimePicker value={endTime} onChange={setEndTime} />
              </div>
            </div>
          )}

          {/* Travel times */}
          {!isEvent && !isAllDay && <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                Anfahrt (min)
              </Label>
              <Input
                type="number"
                min={0}
                max={240}
                value={travelBefore}
                onChange={(e) => setTravelBefore(parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                Rückfahrt (min)
              </Label>
              <Input
                type="number"
                min={0}
                max={240}
                value={travelAfter}
                onChange={(e) => setTravelAfter(parseInt(e.target.value) || 0)}
              />
            </div>
          </div>}

          {/* Vehicle */}
          {!isEvent && !isAllDay && vehicles.length > 0 && (
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1">
                <Car className="w-3.5 h-3.5" />
                Fahrzeug
              </Label>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Kein Fahrzeug" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Kein Fahrzeug</SelectItem>
                  {vehicles.map((v) => {
                    const conflict = vehicleConflicts[v.id];
                    return (
                      <SelectItem key={v.id} value={v.id} disabled={!!conflict}>
                        <span className="flex items-center justify-between gap-3 w-full">
                          <span>{v.icon_emoji} {v.name}</span>
                          {conflict && (
                            <span className="text-xs text-orange-500 font-medium">
                              Belegt: {conflict.title}
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {vehicleConflict && (
                <p className="text-xs text-orange-600 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Fahrzeug ist von „{vehicleConflict.title}" belegt!
                </p>
              )}
            </div>
          )}

          {/* Participants */}
          {!isEvent && members.length > 1 && (
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                Weitere Teilnehmer
              </Label>
              <div className="flex flex-wrap gap-2">
                {members
                  .filter((m) => m.id !== ownerId)
                  .map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleParticipant(m.id)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium transition-all"
                      style={{
                        backgroundColor: participants.includes(m.id)
                          ? hexToRgba(m.color, 0.2)
                          : "var(--muted)",
                        color: participants.includes(m.id) ? m.color : "var(--muted-foreground)",
                        border: `1.5px solid ${participants.includes(m.id) ? m.color : "transparent"}`,
                      }}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: m.color }}
                      />
                      {m.name}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Supervision for dependent members */}
          {showSupervisorSelect && (
            <div className="space-y-1.5 p-3 bg-orange-50 dark:bg-orange-950/20 rounded-md border border-orange-200 dark:border-orange-900">
              <Label className="flex items-center gap-1 text-orange-700 dark:text-orange-400">
                <AlertTriangle className="w-3.5 h-3.5" />
                Aufsicht für {dependentMembers.filter((d) => participants.includes(d.id)).map((d) => d.name).join(", ")}
              </Label>
              <p className="text-xs text-[var(--muted-foreground)]">
                Wähle, wer die Aufsicht übernimmt:
              </p>
              <div className="flex flex-wrap gap-2">
                {members
                  .filter((m) => m.is_guardian && participants.includes(m.id))
                  .map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleSupervisor(m.id)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium border transition-all"
                      style={{
                        backgroundColor: supervisorIds.includes(m.id) ? m.color : "transparent",
                        color: supervisorIds.includes(m.id) ? "#fff" : m.color,
                        borderColor: m.color,
                      }}
                    >
                      {m.name}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Recurrence */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1">
              <Repeat className="w-3.5 h-3.5" />
              Wiederholung
            </Label>
            <Select value={recurrence} onValueChange={(v) => setRecurrence(v as RecurrenceFreq)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Kein Wiederholung</SelectItem>
                <SelectItem value="daily">Täglich</SelectItem>
                <SelectItem value="weekly">Wöchentlich</SelectItem>
                <SelectItem value="monthly">Monatlich</SelectItem>
                <SelectItem value="yearly">Jährlich</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notizen</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optionale Notizen..."
              rows={2}
              className="w-full rounded-md border border-[var(--input)] bg-transparent px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            {existingAppt && (
              <Button variant="destructive" size="icon" onClick={handleDelete} type="button">
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
            <Button variant="outline" className="flex-1" onClick={onClose} type="button">
              Abbrechen
            </Button>
            <Button
              className="flex-1"
              onClick={handleSave}
              disabled={saving || !title.trim() || (isAllDay ? !allDayStartDate : (!startTime || !endTime))}
            >
              {saving ? "Speichern..." : "Speichern"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
