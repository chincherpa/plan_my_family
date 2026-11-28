"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Lock, LockOpen, Pencil, Plus, Search, Star, StickyNote, Trash2 } from "lucide-react";
import type { Note } from "@/lib/supabase/types";
import { deleteNote, listNotes, saveNote, setNoteImportant } from "@/lib/notes/actions";
import {
  NOTE_BODY_MAX,
  NOTE_TITLE_MAX,
  PIN_MAX_LENGTH,
  filterNotes,
  notesErrorMessage,
  sortNotes,
  upsertNote,
  validateNote,
  type NotesErrorCode,
} from "@/lib/notes/logic";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ConfirmDialog from "@/components/ui/confirm-dialog";

/** Nach so langer Untätigkeit sperrt sich der Bereich wieder (Wandtablet). */
const IDLE_LOCK_MS = 5 * 60 * 1000;

const dateFormat = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default function NotesView() {
  // Die PIN lebt nur im Speicher dieser Seite: Wer die Seite verlässt, muss sie
  // beim nächsten Mal erneut eingeben.
  const [pin, setPin] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);

  const lock = useCallback(() => {
    setPin(null);
    setNotes([]);
  }, []);

  // Inaktivitäts-Sperre
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!pin) return;
    const reset = () => {
      clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(lock, IDLE_LOCK_MS);
    };
    reset();
    const events = ["pointerdown", "keydown", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true, capture: true }));
    return () => {
      clearTimeout(idleTimer.current);
      events.forEach((e) => window.removeEventListener(e, reset, { capture: true }));
    };
  }, [pin, lock]);

  if (!pin) {
    return (
      <PinGate
        onUnlock={(enteredPin, loaded) => {
          setNotes(sortNotes(loaded));
          setPin(enteredPin);
        }}
      />
    );
  }

  return <NotesList pin={pin} notes={notes} setNotes={setNotes} onLock={lock} />;
}

function PinGate({ onUnlock }: { onUnlock: (pin: string, notes: Note[]) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value || checking) return;
    setChecking(true);
    setError(null);
    const result = await listNotes(value);
    setChecking(false);
    if ("error" in result) {
      setError(notesErrorMessage(result.error));
      setValue("");
      return;
    }
    onUnlock(value, result.data);
  }

  return (
    <div className="h-full overflow-y-auto">
      <form
        onSubmit={submit}
        className="mx-auto mt-16 flex max-w-xs flex-col items-center gap-4 px-3 text-center"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary)]/10">
          <Lock className="h-6 w-6 text-[var(--primary)]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notizen</h1>
          <p className="text-sm text-[var(--muted-foreground)]">Bitte PIN eingeben</p>
        </div>
        <Input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          maxLength={PIN_MAX_LENGTH}
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
          aria-label="PIN"
          className="h-12 text-center text-2xl tracking-[0.5em]"
        />
        {error && <p className="text-sm text-[var(--destructive)]">{error}</p>}
        <Button type="submit" className="w-full" disabled={!value || checking}>
          {checking ? "Prüfe …" : "Entsperren"}
        </Button>
      </form>
    </div>
  );
}

function NotesList({
  pin,
  notes,
  setNotes,
  onLock,
}: {
  pin: string;
  notes: Note[];
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  onLock: () => void;
}) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Note | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleting, setDeleting] = useState<Note | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Fehler anzeigen; bei geänderter PIN oder Sperre zurück zur PIN-Abfrage. */
  const handleError = useCallback(
    (code: NotesErrorCode) => {
      if (code === "wrong_pin" || code === "locked") {
        onLock();
        return;
      }
      setError(notesErrorMessage(code));
    },
    [onLock]
  );

  async function toggleImportant(note: Note) {
    setError(null);
    const next = !note.is_important;
    setNotes((list) => upsertNote(list, { ...note, is_important: next }));
    const result = await setNoteImportant(pin, note.id, next);
    if ("error" in result) {
      setNotes((list) => upsertNote(list, note));
      handleError(result.error);
      return;
    }
    setNotes((list) => upsertNote(list, result.data));
  }

  async function confirmDelete(note: Note) {
    setError(null);
    const result = await deleteNote(pin, note.id);
    if ("error" in result && result.error !== "not_found") {
      handleError(result.error);
      return;
    }
    setNotes((list) => list.filter((n) => n.id !== note.id));
  }

  const visible = filterNotes(notes, query);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-4 px-3 py-5 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Notizen</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onLock} className="gap-2" title="Bereich sperren">
              <LockOpen className="h-4 w-4" />
              <span className="hidden sm:inline">Sperren</span>
            </Button>
            <Button
              onClick={() => {
                setError(null);
                setIsCreating(true);
              }}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Neue Notiz
            </Button>
          </div>
        </div>

        {notes.length > 0 && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Notizen durchsuchen …"
              className="pl-9"
              aria-label="Notizen durchsuchen"
            />
          </div>
        )}

        {error && <p className="text-sm text-[var(--destructive)]">{error}</p>}

        {notes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-[var(--muted-foreground)]">
            <StickyNote className="h-8 w-8" />
            <p className="text-sm">Noch keine Notizen.</p>
          </div>
        ) : visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">Keine Treffer.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {visible.map((note) => (
              <li
                key={note.id}
                className={cn(
                  "flex flex-col gap-2 rounded-xl border bg-[var(--card)] p-4",
                  note.is_important
                    ? "border-amber-400 ring-1 ring-amber-400/50"
                    : "border-[var(--border)]"
                )}
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(note)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="break-words font-medium">
                      {note.title || <span className="text-[var(--muted-foreground)]">Ohne Titel</span>}
                    </p>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="-mr-2 -mt-2 shrink-0"
                    onClick={() => toggleImportant(note)}
                    title={note.is_important ? "Nicht mehr wichtig" : "Als wichtig markieren"}
                    aria-pressed={note.is_important}
                  >
                    <Star
                      className={cn(
                        "h-4 w-4",
                        note.is_important ? "fill-amber-400 text-amber-500" : "text-[var(--muted-foreground)]"
                      )}
                    />
                  </Button>
                </div>
                {note.body && (
                  <button
                    type="button"
                    onClick={() => setEditing(note)}
                    className="line-clamp-6 whitespace-pre-wrap break-words text-left text-sm text-[var(--muted-foreground)]"
                  >
                    {note.body}
                  </button>
                )}
                <div className="mt-auto flex items-center justify-between pt-1">
                  <span className="text-xs text-[var(--muted-foreground)]">
                    {dateFormat.format(new Date(note.updated_at))}
                  </span>
                  <div className="flex">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(note)} title="Bearbeiten">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleting(note)}
                      title="Löschen"
                      className="text-[var(--destructive)] hover:text-[var(--destructive)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <NoteEditor
        key={editing?.id ?? (isCreating ? "new" : "closed")}
        open={isCreating || editing !== null}
        note={editing}
        pin={pin}
        onClose={() => {
          setEditing(null);
          setIsCreating(false);
        }}
        onSaved={(saved) => setNotes((list) => upsertNote(list, saved))}
        onError={handleError}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Notiz „${deleting?.title || "Ohne Titel"}“ löschen?`}
        onConfirm={() => deleting && confirmDelete(deleting)}
      />
    </div>
  );
}

function NoteEditor({
  open,
  note,
  pin,
  onClose,
  onSaved,
  onError,
}: {
  open: boolean;
  note: Note | null;
  pin: string;
  onClose: () => void;
  onSaved: (note: Note) => void;
  onError: (code: NotesErrorCode) => void;
}) {
  const [title, setTitle] = useState(note?.title ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [important, setImportant] = useState(note?.is_important ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const invalid = validateNote(title, body);
    if (invalid) {
      setError(notesErrorMessage(invalid));
      return;
    }
    setSaving(true);
    setError(null);
    const result = await saveNote(pin, { title: title.trim(), body, is_important: important }, note?.id ?? null);
    setSaving(false);
    if ("error" in result) {
      if (result.error === "wrong_pin" || result.error === "locked") {
        onClose();
        onError(result.error);
        return;
      }
      setError(notesErrorMessage(result.error));
      return;
    }
    onSaved(result.data);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{note ? "Notiz bearbeiten" : "Neue Notiz"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="note-title">Titel</Label>
            <Input
              id="note-title"
              value={title}
              maxLength={NOTE_TITLE_MAX}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z. B. WLAN-Zugang, Geschenkideen"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note-body">Text</Label>
            <textarea
              id="note-body"
              value={body}
              maxLength={NOTE_BODY_MAX}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className="w-full resize-y rounded-md border border-[var(--input)] bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
            />
          </div>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={important} onCheckedChange={setImportant} />
            Als wichtig markieren
          </label>
          {error && <p className="text-sm text-[var(--destructive)]">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Abbrechen
            </Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? "Speichern …" : "Speichern"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
