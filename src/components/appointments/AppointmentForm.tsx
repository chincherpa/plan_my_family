"use client";
import { useState, useMemo, useRef } from "react";
import { Trash2, Copy, Repeat, Car, Users, Clock, AlertTriangle } from "lucide-react";
import { RRule, Weekday, type ByWeekday } from "rrule";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AppointmentWithParticipants } from "@/lib/supabase/types";
import { hexToRgba, startOfDay } from "@/lib/utils";
import { buildRecurrenceRule, occurrenceDateKey } from "@/lib/utils/recurrence";
import { isSchoolHoliday } from "@/lib/utils/schoolHolidays";
import { Checkbox } from "@/components/ui/checkbox";

type RecurrenceFreq =
  | "none"
  | "daily"
  | "weekdays"
  | "weekend"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "yearly"
  | "custom";

const WEEKDAYS_DE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
/** rrule weekday numbers: Mon=0 … Sun=6 */
const MON_TO_FRI = [0, 1, 2, 3, 4];
const SAT_SUN = [5, 6];
/** Checkboxes for "Benutzerdefiniert", in rrule numbering (Mon=0 … Sun=6) */
const CUSTOM_WEEKDAYS: [number, string][] = [
  [0, "Mo"],
  [1, "Di"],
  [2, "Mi"],
  [3, "Do"],
  [4, "Fr"],
  [5, "Sa"],
  [6, "So"],
];

/** Weekdays written explicitly into the rule (BYDAY), rrule numbering; null if none. */
function explicitWeekdays(rule: RRule): number[] | null {
  const raw = rule.origOptions.byweekday;
  if (raw == null) return null;
  const list: ByWeekday[] = Array.isArray(raw) ? raw : [raw];
  return list.map((w) =>
    typeof w === "number" ? w : typeof w === "string" ? Weekday.fromStr(w).weekday : w.weekday
  );
}

function sameDays(a: number[], b: number[]): boolean {
  return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}
/** single = this one, following = this and all later ones, series = all */
type EditScope = "single" | "following" | "series";
/** "none" only exists for legacy series saved without end; new rules always end */
type RecurrenceEnd = "count" | "until" | "none";

const DEFAULT_COUNT = 10;
const MAX_COUNT = 500;

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
      <TimeSelect value={timePart} onChange={(t) => onChange(combine(datePart, t))} />
    </div>
  );
}

/**
 * Custom list instead of a native <select>: browsers scroll the native list so
 * the selected time sits at the very bottom, we want it centered.
 */
function TimeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  function focusItem(item: HTMLElement | null | undefined) {
    if (item instanceof HTMLButtonElement) item.focus({ preventScroll: true });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-24 rounded-md border border-[var(--input)] bg-[var(--background)] px-2 py-2 text-left text-sm tabular focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
        >
          {value}
        </button>
      </PopoverTrigger>
      <PopoverContent
        ref={listRef}
        className="relative max-h-64 w-24 overflow-y-auto p-1"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          const list = listRef.current;
          const item = list?.querySelector<HTMLElement>('[data-selected="true"]');
          if (!list || !item) return;
          list.scrollTop = item.offsetTop - list.clientHeight / 2 + item.offsetHeight / 2;
          focusItem(item);
        }}
        onKeyDown={(e) => {
          const current = document.activeElement as HTMLElement | null;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            focusItem(current?.nextElementSibling as HTMLElement | null);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            focusItem(current?.previousElementSibling as HTMLElement | null);
          }
        }}
      >
        {TIME_OPTIONS.map((t) => (
          <button
            key={t}
            type="button"
            data-selected={t === value}
            onClick={() => {
              onChange(t);
              setOpen(false);
            }}
            className={`flex w-full rounded-sm px-2 py-1.5 text-left text-sm tabular hover:bg-[var(--accent)] focus-visible:bg-[var(--accent)] focus-visible:outline-none ${
              t === value ? "bg-[var(--primary)]/15 font-semibold text-[var(--primary)]" : ""
            }`}
          >
            {t}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

interface AppointmentFormProps {
  onClose: () => void;
}

export default function AppointmentForm({ onClose }: AppointmentFormProps) {
  const {
    members,
    vehicles,
    appointments,
    schoolHolidays,
    family,
    addAppointment,
    updateAppointment,
    removeAppointment,
  } = useDataStore();
  const { formInitialDate, formMemberId, formOccurrenceStart, selectedAppointmentId } =
    useCalendarStore();

  const storedAppt = selectedAppointmentId
    ? appointments.find((a) => a.id === selectedAppointmentId) ?? null
    : null;

  // Duplicate mode: the form keeps all values of the source appointment but
  // saves them as a new appointment / series (no update, no delete).
  const [duplicating, setDuplicating] = useState(false);
  const existingAppt = duplicating ? null : storedAppt;

  // Editing an occurrence of a recurring series (id points at the parent)
  const isSeriesInstance = !!existingAppt?.recurrence_rule;

  // Initial values from the existing appointment or the clicked slot.
  // The form is remounted on every open, so plain initializers suffice
  // (and user edits survive background data refreshes while it is open).
  const [initial] = useState(() => {
    if (existingAppt) {
      let s = new Date(existingAppt.start_time);
      let e = new Date(existingAppt.end_time);
      if (existingAppt.recurrence_rule && formOccurrenceStart) {
        // Show the clicked occurrence, not the first one of the series
        const durationMs = e.getTime() - s.getTime();
        const seriesStart = s;
        s = new Date(formOccurrenceStart);
        s.setHours(seriesStart.getHours(), seriesStart.getMinutes(), 0, 0);
        e = new Date(s.getTime() + durationMs);
      }
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
  const [participants, setParticipants] = useState<string[]>(() =>
    existingAppt
      ? existingAppt.is_all_family && existingAppt.participants.length === 0
        ? members.map((m) => m.id) // legacy all-family row: everyone
        : existingAppt.participants.map((p) => p.member_id)
      : formMemberId === "all"
      ? members.map((m) => m.id)
      : []
  );
  const [supervisorIds, setSupervisorIds] = useState<string[]>(
    () => existingAppt?.participants.filter((p) => p.is_supervisor).map((p) => p.member_id) ?? []
  );
  const [isEvent, setIsEvent] = useState(
    existingAppt ? existingAppt.is_event ?? false : formMemberId === "events"
  );
  const [initialRecurrence] = useState<{ freq: RecurrenceFreq; days: number[] }>(() => {
    const none = { freq: "none" as RecurrenceFreq, days: [] };
    if (!existingAppt?.recurrence_rule) return none;
    try {
      const rule = RRule.fromString(existingAppt.recurrence_rule);
      const { freq, interval, byweekday } = rule.options;
      if (freq === RRule.DAILY) return { ...none, freq: "daily" };
      if (freq === RRule.WEEKLY) {
        if (interval === 2) return { ...none, freq: "biweekly" };
        if (byweekday && sameDays(byweekday, MON_TO_FRI)) return { ...none, freq: "weekdays" };
        if (byweekday && sameDays(byweekday, SAT_SUN)) return { ...none, freq: "weekend" };
        // Explicit BYDAY (e.g. Mo/Mi/Fr) → custom; plain weekly uses the start's weekday
        const explicit = explicitWeekdays(rule);
        if (explicit?.length) return { freq: "custom", days: [...new Set(explicit)].sort() };
        return { ...none, freq: "weekly" };
      }
      if (freq === RRule.MONTHLY) return { ...none, freq: "monthly" };
      if (freq === RRule.YEARLY) return { ...none, freq: "yearly" };
      return none;
    } catch {
      return none;
    }
  });
  const [recurrence, setRecurrence] = useState<RecurrenceFreq>(initialRecurrence.freq);
  /** Selected weekdays for "Benutzerdefiniert" (rrule numbering), all off by default */
  const [customDays, setCustomDays] = useState<number[]>(initialRecurrence.days);
  const [skipSchoolHolidays, setSkipSchoolHolidays] = useState(
    existingAppt?.skip_school_holidays ?? false
  );
  // End of the recurrence: after N occurrences or on a date
  const [initialEnd] = useState<{ mode: RecurrenceEnd; count: number; until: string }>(() => {
    const fallback = { mode: "count" as RecurrenceEnd, count: DEFAULT_COUNT, until: "" };
    if (!existingAppt?.recurrence_rule) return fallback;
    try {
      const { count, until } = RRule.fromString(existingAppt.recurrence_rule).options;
      if (count) return { ...fallback, count };
      if (until) return { ...fallback, mode: "until", until: toDatePart(until) };
      return { ...fallback, mode: "none" };
    } catch {
      return fallback;
    }
  });
  const [recurrenceEnd, setRecurrenceEnd] = useState<RecurrenceEnd>(initialEnd.mode);
  const [recurrenceCount, setRecurrenceCount] = useState(initialEnd.count);
  const [recurrenceUntil, setRecurrenceUntil] = useState(initialEnd.until);
  const [editScope, setEditScope] = useState<EditScope>("single");

  // Clicked occurrence is the first of its series → "following" equals "series"
  const isFirstOccurrence = useMemo(() => {
    if (!existingAppt?.recurrence_rule || !formOccurrenceStart) return true;
    try {
      // Regeln sind auf lokalen Mittag verankert → nach lokalem Tag vergleichen
      return !RRule.fromString(existingAppt.recurrence_rule).before(
        startOfDay(formOccurrenceStart),
        false
      );
    } catch {
      return true;
    }
  }, [existingAppt, formOccurrenceStart]);
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
        existingAppt?.id,
        schoolHolidays
      );
      if (conflict) conflicts[v.id] = conflict;
    }
    return conflicts;
  }, [startTime, endTime, travelBefore, travelAfter, appointments, existingAppt, vehicles, schoolHolidays]);
  const vehicleConflict = vehicleId !== "none" ? vehicleConflicts[vehicleId] ?? null : null;

  // Title suggestions from known appointments (new appointments only).
  // One entry per title, newest occurrence wins as the template.
  const [titleFocused, setTitleFocused] = useState(false);
  const [suggestionIdx, setSuggestionIdx] = useState(-1);
  const knownTitles = useMemo(() => {
    const byTitle = new Map<string, AppointmentWithParticipants>();
    for (const a of appointments) {
      if (a.is_deleted || !a.title.trim()) continue;
      const key = a.title.trim().toLowerCase();
      const prev = byTitle.get(key);
      if (!prev || a.start_time > prev.start_time) byTitle.set(key, a);
    }
    return [...byTitle.values()];
  }, [appointments]);
  const suggestions = useMemo(() => {
    const q = title.trim().toLowerCase();
    if (storedAppt || !titleFocused || !q) return [];
    return knownTitles
      .filter((a) => {
        const t = a.title.trim().toLowerCase();
        return t.includes(q) && t !== q;
      })
      .sort((a, b) => {
        const as = a.title.trim().toLowerCase().startsWith(q) ? 0 : 1;
        const bs = b.title.trim().toLowerCase().startsWith(q) ? 0 : 1;
        return as - bs || a.title.localeCompare(b.title, "de");
      })
      .slice(0, 6);
  }, [title, titleFocused, knownTitles, storedAppt]);

  /** Take title + details of a known appointment; date/time of the new one stay */
  function applySuggestion(tpl: AppointmentWithParticipants) {
    setTitle(tpl.title);
    setNotes(tpl.notes ?? "");
    setIsEvent(tpl.is_event ?? false);
    setIsAllFamily(tpl.is_all_family);
    if (tpl.owner_id && members.some((m) => m.id === tpl.owner_id)) setOwnerId(tpl.owner_id);
    setParticipants(
      tpl.is_all_family
        ? members.map((m) => m.id)
        : tpl.participants.map((p) => p.member_id).filter((id) => members.some((m) => m.id === id))
    );
    setSupervisorIds(tpl.participants.filter((p) => p.is_supervisor).map((p) => p.member_id));
    setTravelBefore(tpl.travel_before_min ?? 0);
    setTravelAfter(tpl.travel_after_min ?? 0);
    setVehicleId(tpl.vehicle_id && vehicles.some((v) => v.id === tpl.vehicle_id) ? tpl.vehicle_id : "none");

    const durationMs = new Date(tpl.end_time).getTime() - new Date(tpl.start_time).getTime();
    setIsAllDay(tpl.is_all_day);
    if (tpl.is_all_day) {
      const days = Math.max(Math.floor(durationMs / 86400000), 0);
      const end = new Date(`${allDayStartDate}T00:00:00`);
      end.setDate(end.getDate() + days);
      setAllDayEndDate(toDatePart(end));
    } else if (durationMs > 0) {
      const end = new Date(new Date(startTime).getTime() + durationMs);
      setEndTime(combine(toDatePart(end), toTimePart(end)));
    }
    setSuggestionIdx(-1);
    setTitleFocused(false);
  }

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

  const firstDatePart = isAllDay ? allDayStartDate : startTime.split("T")[0];
  const customDaysMissing = recurrence === "custom" && customDays.length === 0;
  const recurrenceInvalid =
    customDaysMissing ||
    (recurrence !== "none" &&
      recurrenceEnd === "until" &&
      (!recurrenceUntil || recurrenceUntil < firstDatePart));

  function buildRRule(freq: RecurrenceFreq, from: Date, countOverride?: number): string | null {
    if (freq === "none") return null;
    return buildRecurrenceRule({
      freq,
      start: from,
      customDays,
      end:
        recurrenceEnd === "count"
          ? { mode: "count", count: Math.min(Math.max(countOverride ?? recurrenceCount, 1), MAX_COUNT) }
          : recurrenceEnd === "until"
            ? { mode: "until", date: new Date(`${recurrenceUntil}T23:59:59`) }
            : { mode: "none" },
    });
  }

  // Weekday of the (first) occurrence, for labels like "Jeden Montag"
  const formStart = isAllDay
    ? allDayStartDate && new Date(`${allDayStartDate}T00:00:00`)
    : startTime && new Date(startTime);
  const weekdayName =
    formStart && !isNaN(formStart.getTime()) ? WEEKDAYS_DE[formStart.getDay()] : null;

  /**
   * Cut the series off before the clicked occurrence: the rule gets an UNTIL
   * on the previous day, later exception rows are dropped. Never called for
   * the first occurrence (that is a whole-series operation).
   */
  async function endSeriesBefore(
    supabase: ReturnType<typeof createClient>,
    parent: AppointmentWithParticipants,
    occStart: Date
  ): Promise<boolean> {
    const rule = RRule.fromString(parent.recurrence_rule!);
    const until = new Date(occStart);
    until.setDate(until.getDate() - 1);
    until.setHours(23, 59, 59, 0);
    const cut = new RRule({ ...rule.origOptions, count: null, until }).toString();
    const cutKey = occurrenceDateKey(occStart);

    // Exceptions first: modified instances render regardless of the rule, so
    // leftovers after a successful cut would duplicate the new series.
    // If the cut fails afterwards, the series simply keeps running.
    const { error: delError } = await supabase
      .from("appointments")
      .delete()
      .eq("recurrence_parent_id", parent.id)
      .gte("exception_date", cutKey);
    if (delError) return false;
    appointments
      .filter(
        (a) =>
          a.recurrence_parent_id === parent.id && !!a.exception_date && a.exception_date >= cutKey
      )
      .forEach((a) => removeAppointment(a.id));

    const { error } = await supabase
      .from("appointments")
      .update({ recurrence_rule: cut })
      .eq("id", parent.id);
    if (error) return false;
    updateAppointment(parent.id, { recurrence_rule: cut });
    return true;
  }

  async function handleSave() {
    if (!family || !title.trim()) return;
    if (isAllDay && !allDayStartDate) return;
    if (!isAllDay && (!startTime || !endTime || timesInvalid)) return;
    if (customDaysMissing) {
      setFormError("Bitte mindestens einen Wochentag für die Wiederholung wählen.");
      return;
    }
    if (recurrenceInvalid) {
      setFormError("Das Enddatum der Wiederholung muss am oder nach dem ersten Termin liegen.");
      return;
    }
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
    const scope: EditScope =
      editScope === "following" && isFirstOccurrence ? "series" : editScope;

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
      // Only meaningful for series; a single appointment is never hidden
      skip_school_holidays: recurrence !== "none" && skipSchoolHolidays,
    };

    try {
      if (existingAppt && isSeriesInstance && scope === "following" && formOccurrenceStart) {
        // "This and following": cut the old series off, start a new one here
        let count: number | undefined;
        if (
          recurrenceEnd === "count" &&
          initialEnd.mode === "count" &&
          recurrenceCount === initialEnd.count
        ) {
          // Count untouched → keep the total, minus what stays in the old series
          // Compare by local date: rrule works in UTC, so across a DST switch the
          // clicked occurrence's rrule date can lie an hour before formOccurrenceStart
          const cutKey = occurrenceDateKey(formOccurrenceStart);
          // Occurrences in school holidays did not count for a skipping series
          const kept = RRule.fromString(existingAppt.recurrence_rule!)
            .between(startOfDay(new Date(existingAppt.start_time)), formOccurrenceStart, true)
            .map(occurrenceDateKey)
            .filter(
              (key) =>
                key < cutKey &&
                !(existingAppt.skip_school_holidays && isSchoolHoliday(key, schoolHolidays))
            ).length;
          count = Math.max(recurrenceCount - kept, 1);
        }
        const { data, error } = await supabase.rpc("save_appointment_with_participants", {
          appointment_data: { ...apptData, recurrence_rule: buildRRule(recurrence, startDate, count) },
          participant_data: participants.map((memberId) => ({
            member_id: memberId,
            is_supervisor: supervisorIds.includes(memberId),
          })),
        });
        const appointment = data as AppointmentWithParticipants | null;
        if (error || !appointment) {
          console.error("Termin konnte nicht gespeichert werden.", error);
          setFormError("Termin konnte nicht gespeichert werden.");
          return;
        }
        if (!(await endSeriesBefore(supabase, existingAppt, formOccurrenceStart))) {
          // Roll back the new series so nothing is duplicated
          await supabase.from("appointments").delete().eq("id", appointment.id);
          setFormError("Serie konnte nicht geteilt werden.");
          return;
        }
        addAppointment(appointment);
      } else if (existingAppt && isSeriesInstance && scope === "single" && formOccurrenceStart) {
        // "Only this occurrence": insert an exception row; the parent's
        // expansion skips the original date via exception_date
        const { data, error } = await supabase.rpc("save_appointment_with_participants", {
          appointment_data: {
            ...apptData,
            recurrence_rule: null,
            recurrence_parent_id: existingAppt.id,
            exception_date: occurrenceDateKey(formOccurrenceStart),
          },
          participant_data: participants.map((memberId) => ({
            member_id: memberId,
            is_supervisor: supervisorIds.includes(memberId),
          })),
        });
        const appointment = data as AppointmentWithParticipants | null;
        if (error || !appointment) {
          console.error("Termin konnte nicht gespeichert werden.", error);
          setFormError("Termin konnte nicht gespeichert werden.");
          return;
        }
        addAppointment(appointment);
      } else if (existingAppt) {
        if (isSeriesInstance && scope === "series") {
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

        const { data, error } = await supabase.rpc("save_appointment_with_participants", {
          appointment_data: apptData,
          participant_data: participants.map((memberId) => ({
            member_id: memberId,
            is_supervisor: supervisorIds.includes(memberId),
          })),
          existing_appointment_id: existingAppt.id,
        });
        const appointment = data as AppointmentWithParticipants | null;
        if (error || !appointment) {
          console.error("Termin konnte nicht gespeichert werden.", error);
          setFormError("Termin konnte nicht gespeichert werden.");
          return;
        }
        updateAppointment(existingAppt.id, appointment);
      } else {
        const { data, error } = await supabase.rpc("save_appointment_with_participants", {
          appointment_data: apptData,
          participant_data: participants.map((memberId) => ({
            member_id: memberId,
            is_supervisor: supervisorIds.includes(memberId),
          })),
        });
        const appointment = data as AppointmentWithParticipants | null;
        if (error || !appointment) {
          console.error("Termin konnte nicht erstellt werden.", error);
          setFormError("Termin konnte nicht erstellt werden.");
          return;
        }
        addAppointment(appointment);
      }
    } finally {
      setSaving(false);
    }

    onClose();
  }

  /**
   * Switch to duplicate mode. For a series the chosen scope decides what is
   * copied: "Nur dieser" → a single appointment on the clicked date,
   * "Dieser & folgende" → a series starting at the clicked date,
   * "Alle" → a series starting at the original series start.
   */
  function handleDuplicate() {
    if (!storedAppt) return;
    if (isSeriesInstance) {
      if (editScope === "single") {
        setRecurrence("none");
      } else if (editScope === "series") {
        const seriesDate = toDatePart(new Date(storedAppt.start_time));
        if (isAllDay) {
          const days = Math.round(
            (new Date(`${allDayEndDate}T00:00:00`).getTime() -
              new Date(`${allDayStartDate}T00:00:00`).getTime()) /
              86400000
          );
          const end = new Date(`${seriesDate}T00:00:00`);
          end.setDate(end.getDate() + Math.max(days, 0));
          setAllDayStartDate(seriesDate);
          setAllDayEndDate(toDatePart(end));
        }
        handleStartChange(combine(seriesDate, startTime.split("T")[1] ?? "00:00"));
      }
    }
    // Legacy endless rule: new series always get an end
    if (recurrenceEnd === "none") setRecurrenceEnd("count");
    setEditScope("single");
    setConfirmDelete(false);
    setFormError(null);
    setDuplicating(true);
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

    // This and all following occurrences → end the series the day before
    if (isSeriesInstance && editScope === "following" && !isFirstOccurrence && formOccurrenceStart) {
      if (!(await endSeriesBefore(supabase, existingAppt, formOccurrenceStart))) {
        setFormError("Termine konnten nicht gelöscht werden.");
        return;
      }
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

  function handleAllFamilyChange(checked: boolean) {
    setIsAllFamily(checked);
    // "Alle" → everyone takes part; back to a single owner → owner is not an extra participant
    setParticipants(
      checked ? members.map((m) => m.id) : (prev) => prev.filter((id) => id !== ownerId)
    );
  }

  function toggleParticipant(memberId: string) {
    setParticipants((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  }

  const dependentMembers = members.filter((m) => m.cannot_be_alone);
  const showSupervisorSelect =
    !isAllFamily &&
    dependentMembers.length > 0 &&
    participants.some((pid) => dependentMembers.some((d) => d.id === pid));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {duplicating
              ? recurrence !== "none"
                ? "Serie duplizieren"
                : "Termin duplizieren"
              : existingAppt
              ? "Termin bearbeiten"
              : "Neuer Termin"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {duplicating && storedAppt && (
            <p className="flex items-start gap-2 rounded-md border border-[var(--primary)]/30 bg-[var(--primary)]/10 px-3 py-2 text-xs text-[var(--foreground)]">
              <Copy className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--primary)]" />
              <span>
                Kopie von „{storedAppt.title}“. Passe Datum, Uhrzeit und Details an – beim
                Speichern wird ein neuer {recurrence !== "none" ? "Serientermin" : "Termin"} angelegt,
                das Original bleibt unverändert.
              </span>
            </p>
          )}

          {/* Scope for recurring series: applies to saving and deleting */}
          {isSeriesInstance && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-[var(--muted-foreground)]">
                Auf welche Termine anwenden?
              </p>
              <div className="flex rounded-md border border-[var(--border)] overflow-hidden text-sm">
                {(
                  [
                    ["single", "Nur dieser"],
                    ...(isFirstOccurrence ? [] : [["following", "Dieser & folgende"]]),
                    ["series", "Alle"],
                  ] as [EditScope, string][]
                ).map(([value, label], i) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setEditScope(value)}
                    className={`flex-1 px-3 py-1.5 font-medium transition-colors ${
                      i > 0 ? "border-l border-[var(--border)]" : ""
                    } ${
                      editScope === value
                        ? "bg-[var(--primary)] text-white"
                        : "bg-transparent text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">
                {editScope === "single"
                  ? "Ändern und Löschen betrifft nur dieses Vorkommen."
                  : editScope === "following"
                  ? "Ändern und Löschen betrifft dieses und alle späteren Vorkommen. Frühere bleiben unverändert."
                  : "Ändern und Löschen betrifft die ganze Serie. Beim Ändern gelten Uhrzeit, Dauer und Details."}
              </p>
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <Label>Titel *</Label>
            <div className="relative">
              <Input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setSuggestionIdx(-1);
                }}
                onFocus={() => setTitleFocused(true)}
                onBlur={() => setTitleFocused(false)}
                onKeyDown={(e) => {
                  if (!suggestions.length) return;
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSuggestionIdx((i) => (i + 1) % suggestions.length);
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSuggestionIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
                  } else if (e.key === "Enter" && suggestionIdx >= 0) {
                    e.preventDefault();
                    applySuggestion(suggestions[suggestionIdx]);
                  } else if (e.key === "Escape") {
                    e.stopPropagation();
                    setTitleFocused(false);
                  }
                }}
                placeholder="Termintitel"
                autoComplete="off"
                autoFocus
              />
              {suggestions.length > 0 && (
                <ul
                  role="listbox"
                  className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--popover)] p-1 shadow-md"
                >
                  {suggestions.map((s, i) => (
                    <li
                      key={s.id}
                      role="option"
                      aria-selected={i === suggestionIdx}
                      // mousedown fires before the input's blur closes the list
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applySuggestion(s);
                      }}
                      className={`cursor-pointer rounded-sm px-2 py-1.5 text-sm hover:bg-[var(--accent)] ${
                        i === suggestionIdx ? "bg-[var(--accent)]" : ""
                      }`}
                    >
                      {s.title}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Toggles: all-day, event, all family — one row */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-2">
              <Label>Ganztägig</Label>
              <Switch checked={isAllDay} onCheckedChange={setIsAllDay} />
            </div>

            <div className="flex items-center gap-2">
              <Label className="flex items-center gap-1.5" title="Geburtstag, Feiertag …">
                <span>🎉</span>
                Ereignis
              </Label>
              <Switch checked={isEvent} onCheckedChange={setIsEvent} />
            </div>

            {!isEvent && (
              <div className="flex items-center gap-2">
                <Label>Familienausflug / Alle</Label>
                <Switch checked={isAllFamily} onCheckedChange={handleAllFamilyChange} />
              </div>
            )}
          </div>

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
                {isAllFamily ? "Teilnehmer (zum Abwählen anklicken)" : "Weitere Teilnehmer"}
              </Label>
              <div className="flex flex-wrap gap-2">
                {members
                  .filter((m) => isAllFamily || m.id !== ownerId)
                  .map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleParticipant(m.id)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium transition-all disabled:cursor-default"
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
            // Only guardians (owner or participants) can supervise
            const supervisors = members.filter(
              (m) => m.is_guardian && (m.id === ownerId || participants.includes(m.id))
            );
            return (
              <div className="p-3 bg-orange-50 dark:bg-orange-950/20 rounded-md border border-orange-200 dark:border-orange-900">
                <p className="text-sm flex items-center gap-1.5 text-orange-700 dark:text-orange-400">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {supervisors.length > 0 ? "Aufsicht" : "Keine Aufsicht"} für{" "}
                  {dependentMembers.filter((d) => participants.includes(d.id)).map((d) => d.name).join(", ")}:{" "}
                  <span className="font-semibold">
                    {supervisors.length > 0 ? supervisors.map((s) => s.name).join(", ") : "kein Erziehungsberechtigter dabei"}
                  </span>
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
                <SelectItem value="weekdays">Mo. bis Fr.</SelectItem>
                <SelectItem value="weekend">Sa. und So.</SelectItem>
                <SelectItem value="weekly">
                  {weekdayName ? `Jeden ${weekdayName}` : "Wöchentlich"}
                </SelectItem>
                <SelectItem value="biweekly">
                  {weekdayName ? `Jeden zweiten ${weekdayName}` : "Alle 2 Wochen"}
                </SelectItem>
                <SelectItem value="monthly">Monatlich</SelectItem>
                <SelectItem value="yearly">Jährlich</SelectItem>
                <SelectItem value="custom">Benutzerdefiniert</SelectItem>
              </SelectContent>
            </Select>

            {recurrence === "custom" && (
              <div className="space-y-1 pt-1">
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {CUSTOM_WEEKDAYS.map(([day, label]) => (
                    <label key={day} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <Checkbox
                        checked={customDays.includes(day)}
                        onCheckedChange={(checked) =>
                          setCustomDays((prev) =>
                            checked ? [...prev, day].sort() : prev.filter((d) => d !== day)
                          )
                        }
                        aria-label={label}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                {customDaysMissing && (
                  <p className="text-xs text-[var(--destructive)]">
                    Mindestens einen Wochentag wählen.
                  </p>
                )}
              </div>
            )}

            {recurrence !== "none" && (
              <label className="flex items-center gap-2 pt-1 text-sm cursor-pointer">
                <Checkbox checked={skipSchoolHolidays} onCheckedChange={setSkipSchoolHolidays} />
                Findet nicht in Schulferien statt
              </label>
            )}

            {recurrence !== "none" && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <Select
                  value={recurrenceEnd}
                  onValueChange={(v) => {
                    setRecurrenceEnd(v as RecurrenceEnd);
                    if (v === "until" && !recurrenceUntil && firstDatePart) {
                      // Prefill: three months after the first occurrence
                      const d = new Date(`${firstDatePart}T00:00:00`);
                      d.setMonth(d.getMonth() + 3);
                      setRecurrenceUntil(toDatePart(d));
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="count">Nach Anzahl</SelectItem>
                    <SelectItem value="until">Bis Datum</SelectItem>
                    {initialEnd.mode === "none" && !duplicating && (
                      <SelectItem value="none">Unbegrenzt (bisher)</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {recurrenceEnd === "count" && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={MAX_COUNT}
                      value={recurrenceCount}
                      onChange={(e) =>
                        setRecurrenceCount(
                          Math.min(Math.max(parseInt(e.target.value) || 1, 1), MAX_COUNT)
                        )
                      }
                    />
                    <span className="text-sm text-[var(--muted-foreground)]">Termine</span>
                  </div>
                )}
                {recurrenceEnd === "until" && (
                  <input
                    type="date"
                    value={recurrenceUntil}
                    min={firstDatePart}
                    onChange={(e) => setRecurrenceUntil(e.target.value)}
                    className="w-full rounded-md border border-[var(--input)] bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
                  />
                )}
              </div>
            )}
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
                  : isSeriesInstance && editScope === "following" && !isFirstOccurrence
                  ? "Diesen und alle folgenden Termine der Serie löschen?"
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
              {existingAppt && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleDuplicate}
                  type="button"
                  title={
                    isSeriesInstance && editScope !== "single"
                      ? "Serie duplizieren"
                      : "Termin duplizieren"
                  }
                  aria-label="Duplizieren"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              )}
              <Button variant="outline" className="flex-1" onClick={onClose} type="button">
                Abbrechen
              </Button>
              <Button
                className="flex-1"
                onClick={handleSave}
                disabled={saving || !title.trim() || (isAllDay ? !allDayStartDate : (!startTime || !endTime || timesInvalid)) || recurrenceInvalid}
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
