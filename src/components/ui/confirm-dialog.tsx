"use client";
import { Trash2 } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** App-styled replacement for window.confirm(). */
export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Löschen",
  cancelLabel = "Abbrechen",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="items-center gap-3 text-center sm:items-start sm:text-left">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--destructive)]/15 text-[var(--destructive)]">
            <Trash2 className="h-5 w-5" />
          </span>
          <DialogTitle className="leading-snug">{title}</DialogTitle>
          <DialogPrimitive.Description className="text-sm text-[var(--muted-foreground)]">
            {description ?? "Das kann nicht rückgängig gemacht werden."}
          </DialogPrimitive.Description>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            variant="destructive"
            autoFocus
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
