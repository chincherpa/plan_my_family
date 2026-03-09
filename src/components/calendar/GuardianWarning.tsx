"use client";
import { AlertTriangle } from "lucide-react";
import type { GuardianWarning as GuardianWarningType } from "@/lib/utils/guardianCheck";
import { SLOT_HEIGHT } from "@/lib/utils";

interface GuardianWarningProps {
  warning: GuardianWarningType;
  slotStart: Date;
}

export default function GuardianWarning({ warning, slotStart }: GuardianWarningProps) {
  const durationMin =
    (warning.endTime.getTime() - warning.startTime.getTime()) / 60000;
  const heightPx = Math.max((durationMin / 30) * SLOT_HEIGHT, SLOT_HEIGHT);

  const minutesIntoSlot =
    (warning.startTime.getTime() - slotStart.getTime()) / 60000;
  const topOffset = (minutesIntoSlot / 30) * SLOT_HEIGHT;

  return (
    <div
      style={{
        position: "absolute",
        top: `${topOffset}px`,
        left: "0",
        right: "0",
        height: `${heightPx}px`,
        zIndex: 20,
        pointerEvents: "none",
      }}
      className="flex items-center justify-center"
    >
      <div className="flex items-center gap-1 bg-red-500 text-white text-[9px] font-bold px-1 py-0.5 rounded-sm">
        <AlertTriangle className="w-2.5 h-2.5" />
        Kind allein!
      </div>
    </div>
  );
}
