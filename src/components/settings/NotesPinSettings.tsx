"use client";
import { useState } from "react";
import { KeyRound } from "lucide-react";
import { changeNotesPin } from "@/lib/notes/actions";
import { PIN_MAX_LENGTH, PIN_MIN_LENGTH, isValidPin, notesErrorMessage } from "@/lib/notes/logic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * PIN des Notizen-Bereichs ändern. Die Datenbank (notes_change_pin) lässt das
 * nur zu, wenn das angemeldete Mitglied erziehungsberechtigt ist und die
 * aktuelle PIN stimmt.
 */
export default function NotesPinSettings() {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [repeatPin, setRepeatPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const digitsOnly = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setter(e.target.value.replace(/\D/g, ""));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!isValidPin(newPin)) {
      setMessage({ kind: "error", text: notesErrorMessage("invalid_pin") });
      return;
    }
    if (newPin !== repeatPin) {
      setMessage({ kind: "error", text: "Die neuen PINs stimmen nicht überein." });
      return;
    }
    setSaving(true);
    const result = await changeNotesPin(currentPin, newPin);
    setSaving(false);
    if ("error" in result) {
      setMessage({
        kind: "error",
        text: result.error === "wrong_pin" ? "Die aktuelle PIN ist falsch." : notesErrorMessage(result.error),
      });
      return;
    }
    setCurrentPin("");
    setNewPin("");
    setRepeatPin("");
    setMessage({ kind: "success", text: "PIN geändert." });
  }

  const pinInput = {
    type: "password",
    inputMode: "numeric" as const,
    autoComplete: "off",
    maxLength: PIN_MAX_LENGTH,
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] space-y-3"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
          <KeyRound className="w-5 h-5 text-[var(--primary)]" />
        </div>
        <div>
          <p className="font-medium">Notizen-PIN</p>
          <p className="text-sm text-[var(--muted-foreground)]">
            Nur für Erwachsene · {PIN_MIN_LENGTH}–{PIN_MAX_LENGTH} Ziffern · Standard 0000
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="notes-pin-current">Aktuelle PIN</Label>
          <Input id="notes-pin-current" {...pinInput} value={currentPin} onChange={digitsOnly(setCurrentPin)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="notes-pin-new">Neue PIN</Label>
          <Input id="notes-pin-new" {...pinInput} value={newPin} onChange={digitsOnly(setNewPin)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="notes-pin-repeat">Wiederholen</Label>
          <Input id="notes-pin-repeat" {...pinInput} value={repeatPin} onChange={digitsOnly(setRepeatPin)} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={saving || !currentPin || !newPin || !repeatPin}>
          {saving ? "Speichern …" : "PIN ändern"}
        </Button>
        {message && (
          <p
            className={
              message.kind === "error" ? "text-sm text-[var(--destructive)]" : "text-sm text-[var(--primary)]"
            }
          >
            {message.text}
          </p>
        )}
      </div>
    </form>
  );
}
