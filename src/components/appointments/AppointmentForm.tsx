"use client";
import { useState, useMemo } from "react";
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
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AppointmentWithParticipants } from "@/lib/supabase/types";
import { hexToRgba } from "@/lib/utils";
import { occurrenceDateKey } from "@/lib/utils/recurrence";

type RecurrenceFreq = "none" | "daily" | "weekly" | "monthly" | "yearly";
type EditScope = "single" | "series";

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
  const { formInitialDate, formMemberId, formOccurrenceStart, selectedAppointmentId } =
    useCalendarStore();

  const existingAppt = selectedAppointmentId
    ? appointments.find((a) => a.id === selectedAppointmentId)
    : null;

  // Editing an occurrence of a recurring series (id points at the parent)
  const isSeriesInstance = !!existingAppt?.recurrence_rule;

  // Initial values from the existing appointment or the clicked slot.
  // The form is remounted on every open, so plain initializers suffice
  // (and user edits survive background data refreshes while it is open).
  const [initial] = useState(() => {
    if (existingAppt) {
      const s = new Date(existingAppt.start_time);
      const e = new Date(existingAppt.end_time);
      return {
        startTime: combine(toDatePart(s), toTimePart(s)),
        endTime: combine(toDatePart(e), toTimePart(e)),
        allDayStartDate: toDatePart(s),
        allDayEndDate: toDatePart(e),
        ownerId: existingAppt.owner_id ?? "",
      };
    }
    const now = snapTo15Min(formInitialDate ?? new Date());
    const end = new Date(now);
    end.setHours(now.getHours() + 1);
    return {
      startTime: combine(toDatePart(now), toTimePart(now)),
      endTime: combine(toDatePart(end), toTimePart(end)),
      allDayStartDate: toDatePart(now),
      allDayEndDate: toDatePart(now),
      ownerId:
        formMemberId && formMemberId !== "all" && formMemberId !== "events"
          ? formMemberId
          : members[0]?.id ?? "",
    };
  });

  // Form state
  const [title, setTitle] = useState(existingAppt?.title ?? "");
  const [notes, setNotes] = useState(existingAppt?.notes ?? "");
  const [ownerId, setOwnerId] = useState<string>(initial.ownerId);
  const [isAllFamily, setIsAllFamily] = useState(
    existingAppt ? existingAppt.is_all_family : formMemberId === "all"
  );
  const [isAllDay, setIsAllDay] = useState(existingAppt?.is_all_day ?? false);
  const [allDayStartDate, setAllDayStartDate] = useState(initial.allDayStartDate);
  const [allDayEndDate, setAllDayEndDate] = useState(initial.allDayEndDate);
  const [startTime, setStartTime] = useState(initial.startTime);
  const [endTime, setEndTime] = useState(initial.endTime);
  const [travelBefore, setTravelBefore] = useState(existingAppt?.travel_before_min ?? 0);
  const [travelAfter, setTravelAfter] = useState(existingAppt?.travel_after_min ?? 0);
  const [vehicleId, setVehicleId] = useState<string>(existingAppt?.vehicle_id ?? "none");
  const [participants, setParticipants] = useState<string[]>(
    () => existingAppt?.participants.map((p) => p.member_id) ?? []
  );
  const [supervisorIds, setSupervisorIds] = useState<string[]>(
    () => existingAppt?.participants.filter((p) => p.is_supervisor).map((p) => p.member_id) ?? []
  );
  const [isEvent, setIsEvent] = useState(
    existingAppt ? existingAppt.is_event ?? false : formMemberId === "events"
  );
  const [recurrence, setRecurrence] = useState<RecurrenceFreq>(() => {
    if (!existingAppt?.recurrence_rule) return "none";
    try {
      const freq = RRule.fromString(existingAppt.recurrence_rule).options.freq;
      if (freq === RRule.DAILY) return "daily";
      if (freq === RRule.WEEKLY) return "weekly";
      if (freq === RRule.MONTHLY) return "monthly";
      if (freq === RRule.YEARLY) return "yearly";
      return "none";
    } catch {
      return "none";
    }
  });
  const [editScope, setEditScope] = useState<EditScope>("single");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Conflicts per vehicle for the currently selected times (derived, not state)
  const vehicleConflicts = useMemo(() => {
    if (!startTime || !endTime) return {};
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
    return conflicts;
  }, [startTime, endTime, travelBefore, travelAfter, appointments, existingAppt, vehicles]);
  const vehicleConflict = vehicleId !== "none" ? vehicleConflicts[vehicleId] ?? null : null;

  // Keep end after start: shifting the start moves the end along, preserving duration
  function handleStartChange(v: string) {
    if (startTime && endTime) {
      const prevStart = new Date(startTime);
      const prevEnd = new Date(endTime);
      const durationMs = Math.max(prevEnd.getTime() - prevStart.getTime(), 15 * 60000);
      const newEnd = new Date(new Date(v).getTime() + durationMs);
      setEndTime(combine(toDatePart(newEnd), toTimePart(newEnd)));
    }
    setStartTime(v);
  }

  const timesInvalid =
    !isAllDay && !!startTime && !!endTime && new Date(endTime) <= new Date(startTime);

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
    if (!isAllDay && (!startTime || !endTime || timesInvalid)) return;
    setFormError(null);

    let startDate: Date;
    let endDate: Date;
    if (isAllDay) {
      const endDatePart =
        allDayEndDate && allDayEndDate >= allDayStartDate ? allDayEndDate : allDayStartDate;
      startDate = new Date(`${allDayStartDate}T00:00:00`);
      endDate = new Date(`${endDatePart}T23:59:59`);
    } else {
      startDate = new Date(startTime);
      endDate = new Date(endTime);
    }

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      setFormError("Ungültiges Datum oder Uhrzeit.");
      return;
    }
    if (endDate <= startDate) {
      setFormError("Das Ende muss nach dem Beginn liegen.");
      return;
    }

    setSaving(true);
    const supabase = createClient();

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

    try {
      if (existingAppt && isSeriesInstance && editScope === "single" && formOccurrenceStart) {
        // "Only this occurrence": insert an exception row; the parent's
        // expansion skips the original date via exception_date
        const { data: insertedData, error } = await supabase
          .from("appointments")
          .insert({
            ...apptData,
            recurrence_rule: null,
            recurrence_parent_id: existingAppt.id,
            exception_date: occurrenceDateKey(formOccurrenceStart),
          })
          .select()
          .single();

        const data = insertedData as { id: string } | null;
        if (error || !data) {
          setFormError(error?.message ?? "Termin konnte nicht gespeichert werden.");
          return;
        }

        if (participants.length > 0) {
          const { error: partError } = await supabase.from("appointment_participants").insert(
            participants.map((memberId) => ({
              appointment_id: data.id,
              member_id: memberId,
              is_supervisor: supervisorIds.includes(memberId),
            }))
          );
          if (partError) {
            setFormError("Teilnehmer konnten nicht gespeichert werden.");
            return;
          }
        }

        const { data: fullData } = await supabase
          .from("appointments")
          .select("*, participants:appointment_participants(*)")
          .eq("id", data.id)
          .single();

        if (fullData) addAppointment(fullData as AppointmentWithParticipants);
      } else if (existingAppt) {
        if (isSeriesInstance && editScope === "series") {
          // Whole series: keep the series anchored at its original start
          // date, apply only time-of-day + duration from the form
          const seriesStart = new Date(existingAppt.start_time);
          seriesStart.setHours(startDate.getHours(), startDate.getMinutes(), 0, 0);
          const seriesEnd = new Date(
            seriesStart.getTime() + (endDate.getTime() - startDate.getTime())
          );
          apptData.start_time = seriesStart.toISOString();
          apptData.end_time = seriesEnd.toISOString();
          apptData.recurrence_rule = buildRRule(recurrence, seriesStart);
        }

        const { data, error } = await supabase
          .from("appointments")
          .update(apptData)
          .eq("id", existingAppt.id)
          .select()
          .single();

        if (error || !data) {
          setFormError(error?.message ?? "Termin konnte nicht gespeichert werden.");
          return;
        }

        // Update participants
        await supabase
          .from("appointment_participants")
          .delete()
          .eq("appointment_id", existingAppt.id);

        if (participants.length > 0) {
          const { error: partError } = await supabase.from("appointment_participants").insert(
            participants.map((memberId) => ({
              appointment_id: existingAppt.id,
              member_id: memberId,
              is_supervisor: supervisorIds.includes(memberId),
            }))
          );
          if (partError) {
            setFormError("Teilnehmer konnten nicht gespeichert werden.");
            return;
          }
        }

        const { data: fullData } = await supabase
          .from("appointments")
          .select("*, participants:appointment_participants(*)")
          .eq("id", existingAppt.id)
          .single();

        if (fullData) updateAppointment(existingAppt.id, fullData as AppointmentWithParticipants);
      } else {
        const { data: insertedData, error } = await supabase
          .from("appointments")
          .insert(apptData)
          .select()
          .single();

        const data = insertedData as { id: string } | null;
        if (error || !data) {
          setFormError(error?.message ?? "Termin konnte nicht erstellt werden.");
          return;
        }

        if (participants.length > 0) {
          const { error: partError } = await supabase.from("appointment_participants").insert(
            participants.map((memberId) => ({
              appointment_id: data.id,
              member_id: memberId,
              is_supervisor: supervisorIds.includes(memberId),
            }))
          );
          if (partError) {
            setFormError("Teilnehmer konnten nicht gespeichert werden.");
            return;
          }
        }

        const { data: fullData } = await supabase
          .from("appointments")
          .select("*, participants:appointment_participants(*)")
          .eq("id", data.id)
          .single();

        if (fullData) addAppointment(fullData as AppointmentWithParticipants);
      }
    } finally {
      setSaving(false);
    }

    onClose();
  }

  async function handleDelete() {
    if (!existingAppt) return;
    const supabase = createClient();

    // Occurrence of a series → insert a deletion marker for this date only
    if (isSeriesInstance && editScope === "single" && formOccurrenceStart) {
      const durationMs =
        new Date(existingAppt.end_time).getTime() - new Date(existingAppt.start_time).getTime();
      const { data, error } = await supabase
        .from("appointments")
        .insert({
          family_id: existingAppt.family_id,
          title: existingAppt.title,
          start_time: formOccurrenceStart.toISOString(),
          end_time: new Date(formOccurrenceStart.getTime() + durationMs).toISOString(),
          recurrence_parent_id: existingAppt.id,
          exception_date: occurrenceDateKey(formOccurrenceStart),
          is_deleted: true,
        })
        .select()
        .single();
      if (error || !data) {
        setFormError("Termin konnte nicht gelöscht werden.");
        return;
      }
      addAppointment({ ...(data as AppointmentWithParticipants), participants: [] });
      onClose();
      return;
    }

    // Modified series instance → keep the row as deletion marker,
    // otherwise the original occurrence would reappear
    if (existingAppt.recurrence_parent_id) {
      const { error } = await supabase
        .from("appointments")
        .update({ is_deleted: true })
        .eq("id", existingAppt.id);
      if (error) {
        setFormError("Termin konnte nicht gelöscht werden.");
        return;
      }
      updateAppointment(existingAppt.id, { is_deleted: true });
      onClose();
      return;
    }

    // Single appointment or whole series
    if (isSeriesInstance) {
      await supabase.from("appointments").delete().eq("recurrence_parent_id", existingAppt.id);
    }
    const { error } = await supabase.from("appointments").delete().eq("id", existingAppt.id);
    if (error) {
      setFormError("Termin konnte nicht gelöscht werden.");
      return;
    }
    appointments
      .filter((a) => a.recurrence_parent_id === existingAppt.id)
      .forEach((a) => removeAppointment(a.id));
    removeAppointment(existingAppt.id);
    onClose();
  }

  function toggleParticipant(memberId: string) {
    setParticipants((prev) =>
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
          {/* Scope for recurring series */}
          {isSeriesInstance && (
            <div className="space-y-1">
              <div className="flex rounded-md border border-[var(--border)] overflow-hidden text-sm">
                <button
                  type="button"
                  onClick={() => setEditScope("single")}
                  className={`flex-1 px-3 py-1.5 font-medium transition-colors ${
                    editScope === "single"
                      ? "bg-[var(--primary)] text-white"
                      : "bg-transparent text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                  }`}
                >
                  Nur dieser Termin
                </button>
                <button
                  type="button"
                  onClick={() => setEditScope("series")}
                  className={`flex-1 px-3 py-1.5 font-medium transition-colors border-l border-[var(--border)] ${
                    editScope === "series"
                      ? "bg-[var(--primary)] text-white"
                      : "bg-transparent text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                  }`}
                >
                  Ganze Serie
                </button>
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">
                {editScope === "single"
                  ? "Änderungen und Löschen betreffen nur dieses Vorkommen."
                  : "Änderungen gelten für alle Termine der Serie (Uhrzeit, Dauer, Details)."}
              </p>
            </div>
          )}

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
                <DateTimePicker value={startTime} onChange={handleStartChange} />
              </div>
              <div className="space-y-1.5">
                <Label>Bis</Label>
                <DateTimePicker value={endTime} onChange={setEndTime} />
              </div>
              {timesInvalid && (
                <p className="col-span-2 text-xs text-[var(--destructive)] flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Das Ende muss nach dem Beginn liegen.
                </p>
              )}
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
                  Fahrzeug ist von „{vehicleConflict.title}“ belegt!
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
          {showSupervisorSelect && (() => {
            const ownerMember = members.find((m) => m.id === ownerId);
            return (
              <div className="p-3 bg-orange-50 dark:bg-orange-950/20 rounded-md border border-orange-200 dark:border-orange-900">
                <p className="text-sm flex items-center gap-1.5 text-orange-700 dark:text-orange-400">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Aufsicht für {dependentMembers.filter((d) => participants.includes(d.id)).map((d) => d.name).join(", ")}:{" "}
                  <span className="font-semibold">{ownerMember?.name ?? "–"}</span>
                </p>
              </div>
            );
          })()}

          {/* Recurrence — hidden when editing a single occurrence of a series */}
          {!(isSeriesInstance && editScope === "single") && (
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
                <SelectItem value="none">Keine Wiederholung</SelectItem>
                <SelectItem value="daily">Täglich</SelectItem>
                <SelectItem value="weekly">Wöchentlich</SelectItem>
                <SelectItem value="monthly">Monatlich</SelectItem>
                <SelectItem value="yearly">Jährlich</SelectItem>
              </SelectContent>
            </Select>
          </div>
          )}

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

          {formError && (
            <p className="text-sm text-[var(--destructive)] bg-[var(--destructive)]/10 rounded-md px-3 py-2">
              {formError}
            </p>
          )}

          {/* Actions */}
          {confirmDelete ? (
            <div className="flex flex-col gap-2 pt-2 rounded-lg border border-[var(--destructive)]/40 bg-[var(--destructive)]/5 p-3">
              <p className="text-sm font-medium text-[var(--destructive)]">
                {isSeriesInstance && editScope === "single"
                  ? "Nur diesen Termin der Serie löschen?"
                  : isSeriesInstance
                  ? "Ganze Serie inklusive aller Ausnahmen löschen?"
                  : "Termin wirklich löschen?"}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(false)} type="button">
                  Abbrechen
                </Button>
                <Button variant="destructive" className="flex-1" onClick={handleDelete} type="button">
                  Löschen
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 pt-2">
              {existingAppt && (
                <Button variant="destructive" size="icon" onClick={() => setConfirmDelete(true)} type="button">
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
              <Button variant="outline" className="flex-1" onClick={onClose} type="button">
                Abbrechen
              </Button>
              <Button
                className="flex-1"
                onClick={handleSave}
                disabled={saving || !title.trim() || (isAllDay ? !allDayStartDate : (!startTime || !endTime || timesInvalid))}
              >
                {saving ? "Speichern..." : "Speichern"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
