"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowRightLeft, ChevronRight, Copy, MoveRight, Pencil, Trash2 } from "lucide-react";
import { useDataStore } from "@/lib/store/dataStore";
import { useCalendarStore } from "@/lib/store/calendarStore";
import {
  deleteOccurrence,
  duplicateOccurrence,
  isFirstOccurrence,
  isSeriesOccurrence,
  moveOccurrence,
  type ActionResult,
  type EditScope,
  type UndoFn,
} from "@/lib/appointments/actions";
import { allDayEnd, type AppointmentOccurrence } from "@/lib/utils/recurrence";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { localDateStr } from "@/lib/utils";

type MenuHandler = (e: React.MouseEvent, occ: AppointmentOccurrence) => void;

const AppointmentMenuContext = createContext<MenuHandler | null>(null);

/** Right-click handler for appointment elements; undefined outside the provider. */
export function useAppointmentMenu(): MenuHandler | undefined {
  return useContext(AppointmentMenuContext) ?? undefined;
}

type PendingAction = { kind: "delete" } | { kind: "move" } | { kind: "owner"; ownerId: string };

interface Toast {
  message: string;
  undo?: UndoFn;
  error?: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");
const timeStr = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

const itemClass =
  "flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-[var(--accent)] data-[disabled]:pointer-events-none data-[disabled]:opacity-50";
const contentClass =
  "z-50 min-w-[12rem] rounded-lg border border-[var(--border)] bg-[var(--popover)] p-1 text-[var(--popover-foreground)] shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95";

/**
 * Context menu for calendar appointments (right click): open, move, hand over
 * to another member, duplicate, delete. Series ask for the scope first.
 */
export function AppointmentMenuProvider({ children }: { children: React.ReactNode }) {
  const members = useDataStore((s) => s.members);
  const appointments = useDataStore((s) => s.appointments);
  const schoolHolidays = useDataStore((s) => s.schoolHolidays);
  const openForm = useCalendarStore((s) => s.openForm);

  const [menu, setMenu] = useState<{ occ: AppointmentOccurrence; x: number; y: number } | null>(null);
  /** Occurrence the dialogs work on (outlives the menu) */
  const [target, setTarget] = useState<AppointmentOccurrence | null>(null);
  const [scopeFor, setScopeFor] = useState<PendingAction | null>(null);
  const [moveScope, setMoveScope] = useState<EditScope | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((t: Toast | null) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t);
    if (t) toastTimer.current = setTimeout(() => setToast(null), 6000);
  }, []);
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const handler = useCallback<MenuHandler>((e, occ) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ occ, x: e.clientX, y: e.clientY });
  }, []);

  function report(result: ActionResult, success: string, undo?: UndoFn) {
    showToast(result.ok ? { message: success, undo } : { message: result.error, error: true });
  }

  /** Start an action; series occurrences ask for the scope first. */
  function start(occ: AppointmentOccurrence, action: PendingAction) {
    setTarget(occ);
    if (isSeriesOccurrence(occ.appointment)) setScopeFor(action);
    else void run(occ, action, "single");
  }

  async function run(occ: AppointmentOccurrence, action: PendingAction, scope: EditScope) {
    const appt = occ.appointment;
    if (action.kind === "move") {
      setMoveScope(scope);
      return;
    }
    if (action.kind === "owner") {
      const result = await moveOccurrence(
        appt,
        occ.occurrenceStart,
        { start: occ.occurrenceStart, end: occ.occurrenceEnd, ownerId: action.ownerId },
        scope
      );
      const name = members.find((m) => m.id === action.ownerId)?.name ?? "Mitglied";
      // moveOccurrence meldet „verschoben“; hier geht es ums Übergeben
      report(
        result.ok ? result : { ok: false, error: "Termin konnte nicht übergeben werden." },
        `„${appt.title}“ an ${name} übergeben`
      );
      return;
    }
    const { result, undo } = await deleteOccurrence(appt, occ.occurrenceStart, scope);
    report(result, `„${appt.title}“ gelöscht`, undo);
  }

  async function duplicate(occ: AppointmentOccurrence) {
    const result = await duplicateOccurrence(occ.appointment, occ.occurrenceStart, occ.occurrenceEnd);
    report(result, `„${occ.appointment.title}“ dupliziert`);
  }

  const occ = menu?.occ;
  const appt = occ?.appointment;
  // Anniversaries carry fields the generic actions do not copy → form only
  const editable = !!appt && !appt.anniversary_kind;

  return (
    <AppointmentMenuContext.Provider value={handler}>
      {children}

      <DropdownMenu.Root open={!!menu} onOpenChange={(open) => !open && setMenu(null)}>
        <DropdownMenu.Trigger asChild>
          <span
            aria-hidden
            className="pointer-events-none fixed h-0 w-0"
            style={{ left: menu?.x ?? 0, top: menu?.y ?? 0 }}
          />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={2}
            collisionPadding={8}
            className={contentClass}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            {occ && appt && (
              <>
                <DropdownMenu.Label className="truncate px-2 py-1 text-xs font-semibold text-[var(--muted-foreground)] max-w-[16rem]">
                  {appt.title}
                </DropdownMenu.Label>
                <DropdownMenu.Item
                  className={itemClass}
                  onSelect={() =>
                    openForm({ appointmentId: appt.id, occurrenceStart: occ.occurrenceStart })
                  }
                >
                  <Pencil className="h-4 w-4" /> Bearbeiten
                </DropdownMenu.Item>
                {editable && (
                  <>
                    <DropdownMenu.Item className={itemClass} onSelect={() => start(occ, { kind: "move" })}>
                      <MoveRight className="h-4 w-4" /> Verschieben …
                    </DropdownMenu.Item>
                    <DropdownMenu.Sub>
                      <DropdownMenu.SubTrigger className={itemClass}>
                        <ArrowRightLeft className="h-4 w-4" /> An Mitglied
                        <ChevronRight className="ml-auto h-4 w-4" />
                      </DropdownMenu.SubTrigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.SubContent className={contentClass} sideOffset={4} collisionPadding={8}>
                          {members.map((m) => (
                            <DropdownMenu.Item
                              key={m.id}
                              className={itemClass}
                              disabled={!appt.is_all_family && m.id === appt.owner_id}
                              onSelect={() => start(occ, { kind: "owner", ownerId: m.id })}
                            >
                              <span
                                className="h-3 w-3 shrink-0 rounded-full"
                                style={{ backgroundColor: m.color }}
                              />
                              {m.name}
                            </DropdownMenu.Item>
                          ))}
                        </DropdownMenu.SubContent>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Sub>
                    <DropdownMenu.Item className={itemClass} onSelect={() => void duplicate(occ)}>
                      <Copy className="h-4 w-4" /> Duplizieren
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator className="my-1 h-px bg-[var(--border)]" />
                    <DropdownMenu.Item
                      className={`${itemClass} text-[var(--destructive)]`}
                      onSelect={() => start(occ, { kind: "delete" })}
                    >
                      <Trash2 className="h-4 w-4" /> Löschen
                    </DropdownMenu.Item>
                  </>
                )}
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {target && scopeFor && (
        <SeriesScopeDialog
          action={scopeFor}
          first={isFirstOccurrence(target.appointment, target.occurrenceStart, appointments, schoolHolidays)}
          onCancel={() => setScopeFor(null)}
          onChoose={(scope) => {
            const action = scopeFor;
            setScopeFor(null);
            void run(target, action, scope);
          }}
        />
      )}

      {target && moveScope && (
        <MoveDialog
          occ={target}
          scope={moveScope}
          onClose={() => setMoveScope(null)}
          onDone={(result) => report(result, `„${target.appointment.title}“ verschoben`)}
        />
      )}

      {toast && (
        <div
          role="status"
          className={`fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-lg border px-4 py-2 text-sm shadow-lg ${
            toast.error
              ? "border-[var(--destructive)] bg-[var(--card)] text-[var(--destructive)]"
              : "border-[var(--border)] bg-[var(--card)]"
          }`}
        >
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              type="button"
              className="font-semibold text-[var(--primary)] hover:underline"
              onClick={async () => {
                const undo = toast.undo!;
                showToast(null);
                const result = await undo();
                if (!result.ok) showToast({ message: result.error, error: true });
              }}
            >
              Rückgängig
            </button>
          )}
          <button
            type="button"
            aria-label="Meldung schließen"
            className="opacity-60 hover:opacity-100"
            onClick={() => showToast(null)}
          >
            ×
          </button>
        </div>
      )}
    </AppointmentMenuContext.Provider>
  );
}

function SeriesScopeDialog({
  action,
  first,
  onCancel,
  onChoose,
}: {
  action: PendingAction;
  first: boolean;
  onCancel: () => void;
  onChoose: (scope: EditScope) => void;
}) {
  const del = action.kind === "delete";
  const verb = del ? "löschen" : action.kind === "move" ? "verschieben" : "übergeben";
  const options: { scope: EditScope; label: string }[] = [
    { scope: "single", label: "Nur diesen Termin" },
    ...(first ? [] : [{ scope: "following" as EditScope, label: "Diesen & alle folgenden" }]),
    { scope: "series", label: "Alle Termine der Serie" },
  ];
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Serientermin {verb}</DialogTitle>
          <DialogPrimitive.Description className="text-sm text-[var(--muted-foreground)]">
            {del
              ? "Welche Termine sollen gelöscht werden? Nur ein einzelner Termin lässt sich rückgängig machen."
              : action.kind === "move"
                ? "Für mehrere Termine gelten nur Uhrzeit und Mitglied – das Datum bleibt."
                : "Welche Termine sollen übergeben werden?"}
          </DialogPrimitive.Description>
        </DialogHeader>
        <div className="grid gap-2">
          {options.map((o) => (
            <Button
              key={o.scope}
              variant={del && o.scope !== "single" ? "destructive" : "outline"}
              onClick={() => onChoose(o.scope)}
            >
              {o.label}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MoveDialog({
  occ,
  scope,
  onClose,
  onDone,
}: {
  occ: AppointmentOccurrence;
  scope: EditScope;
  onClose: () => void;
  onDone: (result: ActionResult) => void;
}) {
  const members = useDataStore((s) => s.members);
  const appt = occ.appointment;
  const allDay = appt.is_all_day;
  const durationMs = occ.occurrenceEnd.getTime() - occ.occurrenceStart.getTime();
  const dateLocked = isSeriesOccurrence(appt) && scope !== "single";

  const [date, setDate] = useState(localDateStr(occ.occurrenceStart));
  const [startT, setStartT] = useState(timeStr(occ.occurrenceStart));
  const [endT, setEndT] = useState(timeStr(occ.occurrenceEnd));
  const ownerOrig = appt.is_all_family ? "" : appt.owner_id ?? "";
  const [ownerId, setOwnerId] = useState(ownerOrig);
  const [saving, setSaving] = useState(false);

  function changeStart(v: string) {
    // Keep the duration while shifting the start
    const s = new Date(`${date}T${v}`);
    if (!isNaN(s.getTime())) setEndT(timeStr(new Date(s.getTime() + durationMs)));
    setStartT(v);
  }

  const start = allDay ? new Date(`${date}T00:00:00`) : new Date(`${date}T${startT}`);
  let end: Date;
  if (allDay) {
    end = allDayEnd(start, occ.occurrenceStart, occ.occurrenceEnd);
  } else {
    end = new Date(`${date}T${endT}`);
    // End before start → ends on the next day (overnight appointment)
    if (end <= start) end = new Date(end.getTime() + 86400000);
  }
  const invalid = isNaN(start.getTime()) || isNaN(end.getTime());

  async function save() {
    if (invalid) return;
    setSaving(true);
    const result = await moveOccurrence(
      appt,
      occ.occurrenceStart,
      { start, end, ownerId: ownerId || null },
      scope
    );
    setSaving(false);
    onDone(result);
    if (result.ok) onClose();
  }

  const inputClass =
    "w-full rounded-md border border-[var(--input)] bg-transparent px-3 py-2 text-sm tabular focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)] disabled:opacity-50";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Verschieben</DialogTitle>
          <DialogPrimitive.Description className="truncate text-sm text-[var(--muted-foreground)]">
            {appt.title}
          </DialogPrimitive.Description>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="move-date">Datum</Label>
            <input
              id="move-date"
              type="date"
              value={date}
              disabled={dateLocked}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
            {dateLocked && (
              <span className="text-xs text-[var(--muted-foreground)]">
                Datum lässt sich nur für einen einzelnen Termin ändern.
              </span>
            )}
          </div>
          {!allDay && (
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label htmlFor="move-start">Beginn</Label>
                <input
                  id="move-start"
                  type="time"
                  step={300}
                  value={startT}
                  onChange={(e) => changeStart(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="move-end">Ende</Label>
                <input
                  id="move-end"
                  type="time"
                  step={300}
                  value={endT}
                  onChange={(e) => setEndT(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label>Mitglied</Label>
            <Select value={ownerId || "keep"} onValueChange={(v) => setOwnerId(v === "keep" ? "" : v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {!ownerOrig && (
                  <SelectItem value="keep">{appt.is_all_family ? "Ganze Familie" : "Unverändert"}</SelectItem>
                )}
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <span className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: m.color }} />
                      {m.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={() => void save()} disabled={invalid || saving}>
            {saving ? "Speichern …" : "Verschieben"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
