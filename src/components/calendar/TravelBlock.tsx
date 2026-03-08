"use client";
import { useDataStore } from "@/lib/store/dataStore";
import { hexToRgba, SLOT_HEIGHT } from "@/lib/utils";
import type { AppointmentOccurrence } from "@/lib/utils/recurrence";

interface TravelBlockProps {
  occurrence: AppointmentOccurrence;
  type: "before" | "after";
  columnId: string;
  slotStart: Date;
}

export default function TravelBlock({ occurrence, type, columnId, slotStart }: TravelBlockProps) {
  const { members } = useDataStore();
  const { appointment, occurrenceStart, occurrenceEnd, travelStart, travelEnd } = occurrence;

  const ownerMember = members.find((m) => m.id === appointment.owner_id);
  const color = ownerMember?.color ?? "#6366f1";

  const blockStart = type === "before" ? travelStart : occurrenceEnd;
  const blockEnd = type === "before" ? occurrenceStart : travelEnd;

  const durationMin = (blockEnd.getTime() - blockStart.getTime()) / 60000;
  const heightPx = Math.max((durationMin / 15) * SLOT_HEIGHT, SLOT_HEIGHT / 2);

  const minutesIntoSlot = (blockStart.getTime() - slotStart.getTime()) / 60000;
  const topOffset = (minutesIntoSlot / 15) * SLOT_HEIGHT;

  const durationLabel =
    type === "before"
      ? `${appointment.travel_before_min} min Anfahrt`
      : `${appointment.travel_after_min} min Rückfahrt`;

  return (
    <div
      style={{
        position: "absolute",
        top: `${topOffset}px`,
        left: "2px",
        right: "2px",
        height: `${heightPx - 1}px`,
        backgroundColor: hexToRgba(color, 0.4),
        borderLeft: `2px solid ${hexToRgba(color, 0.7)}`,
        borderRadius: "2px",
        zIndex: 8,
        overflow: "hidden",
        fontSize: "10px",
        color: color,
        padding: "1px 3px",
      }}
      className="travel-block-pattern"
      title={durationLabel}
    >
      <span className="opacity-90">{type === "before" ? "↑" : "↓"} {durationLabel}</span>
    </div>
  );
}
