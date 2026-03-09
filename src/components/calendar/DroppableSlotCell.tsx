"use client";
import { useDroppable } from "@dnd-kit/core";
import { ReactNode } from "react";

interface DroppableSlotCellProps {
  id: string;
  data: { slotStart: Date; memberId: string };
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export function DroppableSlotCell({ id, data, children, className, style, onClick }: DroppableSlotCellProps) {
  const { setNodeRef, isOver } = useDroppable({ id, data });

  return (
    <div
      ref={setNodeRef}
      className={`${className ?? ""} ${isOver ? "bg-[var(--primary)]/20 ring-1 ring-inset ring-[var(--primary)]/40" : ""}`}
      style={style}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
