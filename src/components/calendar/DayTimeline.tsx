"use client";
import { useMemo, useSyncExternalStore } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Car, Repeat } from "lucide-react";
import { useDataStore } from "@/lib/store/dataStore";
import { assignLanes } from "@/lib/utils/lanes";
import { formatTime, hexToRgba, localDateStr, readableTextColor } from "@/lib/utils";
import type { AppointmentOccurrence } from "@/lib/utils/recurrence";
import { placementsFor, type Column, type DayData } from "./model";

const noopSubscribe = () => () => {};

/** false during SSR and hydration, true afterwards — without an extra effect render. */
function useIsClient(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

export const TIME_GUTTER = "w-11 sm:w-14";

/** Vertical drag distance in px → minutes, snapped to 15 */
export function snapShiftMin(deltaY: number, hourHeight: number): number {
  return Math.round(deltaY / (hourHeight / 60) / 15) * 15;
}

interface DayTimelineProps {
  data: DayData;
  columns: Column[];
  startHour: number;
  endHour: number;
  hourHeight: number;
  now: Date;
  conflictKeys: Set<string>;
  onSlotClick: (start: Date, columnId: string) => void;
  onOpen: (occ: AppointmentOccurrence) => void;
}

interface Placed {
  occ: AppointmentOccurrence;
  isOwner: boolean;
  /** Visible extent in minutes from window start, travel included */
  start: number;
  end: number;
}

export default function DayTimeline({
  data,
  columns,
  startHour,
  endHour,
  hourHeight,
  now,
  conflictKeys,
  onSlotClick,
  onOpen,
}: DayTimelineProps) {
  const pxPerMin = hourHeight / 60;
  const windowStart = useMemo(() => {
    const d = new Date(data.day);
    d.setHours(startHour, 0, 0, 0);
    return d;
  }, [data.day, startHour]);
  const windowMinutes = (endHour - startHour) * 60;
  const height = windowMinutes * pxPerMin;

  const toMin = (d: Date) =>
    Math.min(Math.max((d.getTime() - windowStart.getTime()) / 60000, 0), windowMinutes);

  const byColumn = useMemo(() => {
    const map = new Map<string, Placed[]>();
    for (const occ of data.timed) {
      for (const { columnId, isOwner } of placementsFor(occ, columns)) {
        const start = toMin(occ.travelStart);
        const end = toMin(occ.travelEnd);
        if (end <= start) continue;
        const list = map.get(columnId) ?? [];
        list.push({ occ, isOwner, start, end });
        map.set(columnId, list);
      }
    }
    return map;
    // toMin only depends on windowStart / windowMinutes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.timed, columns, windowStart, windowMinutes]);

  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  const nowMin = (now.getTime() - windowStart.getTime()) / 60000;
  // The now-line depends on the wall clock, which differs between server and
  // client render — only draw it after hydration.
  const isClient = useIsClient();
  const showNow = isClient && nowMin >= 0 && nowMin <= windowMinutes;

  return (
    <div className="relative flex" style={{ height }}>
      {/* Hour labels */}
      <div className={`${TIME_GUTTER} relative shrink-0`}>
        {hours.map((h, i) => (
          <span
            key={h}
            className="absolute right-2 -translate-y-1/2 text-[11px] text-[var(--muted-foreground)] tabular"
            style={{ top: i * hourHeight }}
          >
            {i === 0 || i === hours.length - 1 ? "" : `${String(h).padStart(2, "0")}`}
          </span>
        ))}
      </div>

      <div className="relative flex flex-1 gap-1 min-w-0">
        {/* Hour lines */}
        {hours.map((h, i) => (
          <div
            key={h}
            className="pointer-events-none absolute inset-x-0 border-t border-[var(--gridline)]"
            style={{ top: i * hourHeight }}
          />
        ))}

        {columns.map((col) => (
          <TimelineColumn
            key={col.id}
            dayKey={localDateStr(data.day)}
            column={col}
            placed={byColumn.get(col.id) ?? []}
            warnings={data.warnings.filter((w) => w.memberId === col.id)}
            toMin={toMin}
            pxPerMin={pxPerMin}
            height={height}
            windowStart={windowStart}
            conflictKeys={conflictKeys}
            onSlotClick={onSlotClick}
            onOpen={onOpen}
          />
        ))}

        {showNow && (
          <div
            className="pointer-events-none absolute inset-x-0 z-30 flex items-center"
            style={{ top: nowMin * pxPerMin }}
          >
            <div className="-ml-1.5 h-3 w-3 rounded-full bg-[var(--now)]" />
            <div className="h-0.5 flex-1 bg-[var(--now)]" />
          </div>
        )}
      </div>
    </div>
  );
}

function TimelineColumn({
  dayKey,
  column,
  placed,
  warnings,
  toMin,
  pxPerMin,
  height,
  windowStart,
  conflictKeys,
  onSlotClick,
  onOpen,
}: {
  dayKey: string;
  column: Column;
  placed: Placed[];
  warnings: DayData["warnings"];
  toMin: (d: Date) => number;
  pxPerMin: number;
  height: number;
  windowStart: Date;
  conflictKeys: Set<string>;
  onSlotClick: (start: Date, columnId: string) => void;
  onOpen: (occ: AppointmentOccurrence) => void;
}) {
  // Several timelines can be on screen (hero + expanded day) — ids must be unique
  const { setNodeRef, isOver } = useDroppable({
    id: `col-${dayKey}-${column.id}`,
    data: { columnId: column.id },
  });
  const lanes = useMemo(() => assignLanes(placed), [placed]);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const minutes = Math.floor((e.clientY - rect.top) / pxPerMin / 30) * 30;
    onSlotClick(new Date(windowStart.getTime() + minutes * 60000), column.id);
  }

  return (
    <div
      ref={setNodeRef}
      onClick={handleClick}
      className={`relative flex-1 min-w-0 cursor-pointer rounded-lg border border-[var(--gridline)] transition-colors ${
        isOver ? "bg-[var(--primary)]/10" : "bg-[var(--lane)]/60 hover:bg-[var(--lane-alt)]"
      }`}
      style={{ height }}
    >
      {warnings.map((w) => {
        const top = toMin(w.startTime) * pxPerMin;
        const h = (toMin(w.endTime) - toMin(w.startTime)) * pxPerMin;
        if (h <= 0) return null;
        return (
          <div
            key={`gw-${w.startTime.getTime()}`}
            className="guardian-gap pointer-events-none absolute inset-x-0 z-20 rounded-lg border-l-[3px] border-[var(--destructive)]"
            style={{ top, height: h }}
          >
            <span className="m-1 inline-block rounded bg-[var(--destructive)] px-1 text-[10px] font-semibold leading-4 text-white">
              ohne Aufsicht
            </span>
          </div>
        );
      })}

      {placed.map((p) => {
        const lane = lanes.get(p)!;
        return (
          <TimelineBlock
            key={`${p.occ.key}-${column.id}`}
            placed={p}
            columnId={`${dayKey}-${column.id}`}
            lane={lane.lane}
            lanes={lane.lanes}
            toMin={toMin}
            pxPerMin={pxPerMin}
            hasConflict={conflictKeys.has(p.occ.key)}
            onOpen={onOpen}
          />
        );
      })}
    </div>
  );
}

function TimelineBlock({
  placed,
  columnId,
  lane,
  lanes,
  toMin,
  pxPerMin,
  hasConflict,
  onOpen,
}: {
  placed: Placed;
  columnId: string;
  lane: number;
  lanes: number;
  toMin: (d: Date) => number;
  pxPerMin: number;
  hasConflict: boolean;
  onOpen: (occ: AppointmentOccurrence) => void;
}) {
  const { members, vehicles } = useDataStore();
  const { occ, isOwner } = placed;
  const appt = occ.appointment;
  const owner = members.find((m) => m.id === appt.owner_id);
  const color = appt.is_all_family ? "#6366f1" : owner?.color ?? "#6366f1";
  const vehicle = vehicles.find((v) => v.id === appt.vehicle_id);

  // Rule-generated occurrences must not be dragged: the update would
  // rewrite the series' base appointment. Participant copies are read-only.
  const canDrag = isOwner && !appt.recurrence_rule;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `appt-${occ.key}-${columnId}`,
    data: occ,
    disabled: !canDrag,
  });

  const top = placed.start * pxPerMin;
  const blockTop = toMin(occ.occurrenceStart) * pxPerMin;
  const blockBottom = toMin(occ.occurrenceEnd) * pxPerMin;
  const travelBefore = blockTop - top;
  const travelAfter = placed.end * pxPerMin - blockBottom;
  const blockHeight = Math.max(blockBottom - blockTop, 18);
  const width = 100 / lanes;

  const shiftMin = isDragging && transform ? snapShiftMin(transform.y, pxPerMin * 60) : 0;
  const targetStart = new Date(occ.occurrenceStart.getTime() + shiftMin * 60000);
  const targetEnd = new Date(occ.occurrenceEnd.getTime() + shiftMin * 60000);

  return (
    <div
      ref={setNodeRef}
      {...(canDrag ? listeners : {})}
      {...(canDrag ? attributes : {})}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(occ);
      }}
      className="absolute flex flex-col px-0.5"
      style={{
        top,
        left: `${lane * width}%`,
        width: `${width}%`,
        zIndex: isDragging ? 50 : 10,
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.85 : 1,
        cursor: canDrag ? (isDragging ? "grabbing" : "grab") : "pointer",
        // Long-press drag on touch (TouchSensor delay) — plain swipes still scroll
        touchAction: "manipulation",
      }}
      title={[
        `${appt.title} · ${formatTime(occ.occurrenceStart)}–${formatTime(occ.occurrenceEnd)}`,
        appt.travel_before_min > 0 &&
          `Hinfahrt: Abfahrt ${formatTime(occ.travelStart)} → Ankunft ${formatTime(occ.occurrenceStart)}`,
        appt.travel_after_min > 0 &&
          `Rückfahrt: Abfahrt ${formatTime(occ.occurrenceEnd)} → Ankunft ${formatTime(occ.travelEnd)}`,
      ]
        .filter(Boolean)
        .join("\n")}
    >
      {isDragging && (
        <div className="pointer-events-none absolute bottom-full left-0 mb-1 whitespace-nowrap rounded bg-[var(--foreground)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--background)] tabular shadow-lg">
          {formatTime(targetStart)}–{formatTime(targetEnd)}
        </div>
      )}
      {travelBefore > 0 && (
        <div
          className="travel-block-pattern rounded-t-md text-[9px] leading-3 px-1 overflow-hidden"
          style={{ height: travelBefore, backgroundColor: hexToRgba(color, 0.15), color }}
        >
          {travelBefore >= 12 && `↓ ${appt.travel_before_min}′`}
        </div>
      )}
      <div
        className={`relative overflow-hidden rounded-md px-1.5 py-1 text-[11px] leading-tight shadow-sm ${
          isDragging ? "shadow-xl ring-2 ring-white/40" : ""
        } ${hasConflict ? "ring-2 ring-[var(--warning)]" : ""}`}
        style={
          isOwner
            ? { height: blockHeight, backgroundColor: color, color: readableTextColor(color) }
            : {
                height: blockHeight,
                backgroundColor: hexToRgba(color, 0.14),
                border: `1.5px dashed ${color}`,
                color: "var(--foreground)",
              }
        }
      >
        <div className="flex items-start gap-1">
          <span className="font-semibold break-words line-clamp-2 flex-1 min-w-0">{appt.title}</span>
          {occ.isRecurringInstance && <Repeat className="w-3 h-3 shrink-0 opacity-70" />}
        </div>
        {blockHeight > 40 && (
          <div className="opacity-80 tabular truncate">
            {formatTime(occ.occurrenceStart)}–{formatTime(occ.occurrenceEnd)}
          </div>
        )}
        {vehicle && blockHeight > 56 && (
          <div className="mt-0.5 flex items-center gap-1 opacity-80 truncate">
            {hasConflict && <Car className="w-3 h-3 shrink-0" />}
            {vehicle.icon_emoji} {vehicle.name}
          </div>
        )}
      </div>
      {travelAfter > 0 && (
        <div
          className="travel-block-pattern rounded-b-md text-[9px] leading-3 px-1 overflow-hidden"
          style={{ height: travelAfter, backgroundColor: hexToRgba(color, 0.15), color }}
        >
          {travelAfter >= 12 && `↓ ${appt.travel_after_min}′`}
        </div>
      )}
    </div>
  );
}
