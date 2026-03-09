"use client";
import { useDraggable } from "@dnd-kit/core";
import { useCalendarStore } from "@/lib/store/calendarStore";
import { useDataStore } from "@/lib/store/dataStore";
import { hexToRgba, SLOT_HEIGHT } from "@/lib/utils";
import type { AppointmentOccurrence } from "@/lib/utils/recurrence";
import { RepeatIcon } from "lucide-react";

interface AppointmentBlockProps {
  occurrence: AppointmentOccurrence;
  columnId: string;
  memberColor: string;
  slotStart: Date;
  ownerIsDragging?: boolean;
}

export default function AppointmentBlock({
  occurrence,
  columnId,
  memberColor,
  slotStart,
  ownerIsDragging = false,
}: AppointmentBlockProps) {
  const { openForm } = useCalendarStore();
  const { members, vehicles } = useDataStore();
  const { appointment, occurrenceStart, occurrenceEnd } = occurrence;

  const isOwner = appointment.owner_id === columnId || appointment.is_all_family;
  const isParticipant = !isOwner && appointment.participants.some((p) => p.member_id === columnId);

  const ownerMember = members.find((m) => m.id === appointment.owner_id);
  const displayColor = isParticipant ? ownerMember?.color ?? memberColor : memberColor;

  const vehicle = vehicles.find((v) => v.id === appointment.vehicle_id);

  const durationMin = (occurrenceEnd.getTime() - occurrenceStart.getTime()) / 60000;
  const heightPx = Math.max((durationMin / 30) * SLOT_HEIGHT, SLOT_HEIGHT);
  const minutesIntoSlot = (occurrenceStart.getTime() - slotStart.getTime()) / 60000;
  const topOffset = (minutesIntoSlot / 30) * SLOT_HEIGHT;

  // Only the owner's block is draggable; participant view is read-only
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `appt-${occurrence.key}-${columnId}`,
    data: { ...occurrence, fromColumnId: columnId },
    disabled: isParticipant,
  });

  // Hide participant mirror while the owner's block is being dragged
  if (isParticipant && ownerIsDragging) return null;

  const bgColor = isParticipant
    ? hexToRgba(displayColor, 0.06)
    : hexToRgba(displayColor, 0.1);

  return (
    <div
      ref={setNodeRef}
      {...(isParticipant ? {} : listeners)}
      {...(isParticipant ? {} : attributes)}
      style={{
        position: "absolute",
        top: `${topOffset}px`,
        left: "2px",
        right: "2px",
        height: `${heightPx - 2}px`,
        backgroundColor: bgColor,
        borderLeft: `3px solid ${displayColor}`,
        borderRadius: "3px",
        color: displayColor,
        zIndex: isDragging ? 50 : 10,
        opacity: isDragging ? 0.3 : 1,
        cursor: isParticipant ? "pointer" : "grab",
        overflow: "hidden",
        fontSize: "11px",
        lineHeight: "1.2",
        padding: "1px 3px",
      }}
      className={`${isParticipant ? "border border-dashed" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        openForm({ appointmentId: appointment.id });
      }}
    >
      <div className="flex items-start justify-between gap-0.5 overflow-hidden">
        <span className="truncate font-medium">
          {appointment.is_event && <span className="mr-0.5">🎉</span>}
          {appointment.title}
        </span>
        <div className="flex items-center gap-0.5 shrink-0">
          {occurrence.isRecurringInstance && (
            <RepeatIcon className="w-2.5 h-2.5 opacity-70" />
          )}
        </div>
      </div>
      {vehicle && heightPx > 30 && (
        <div className="truncate opacity-80">
          {vehicle.icon_emoji} {vehicle.name}
        </div>
      )}
    </div>
  );
}
