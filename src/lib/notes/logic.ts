import type { Note } from "@/lib/supabase/types";

/** Fehlercodes der RPCs notes_* (Migration 025) plus Netzwerk-/Antwortfehler. */
export type NotesErrorCode =
  | "wrong_pin"
  | "locked"
  | "no_family"
  | "not_guardian"
  | "invalid_pin"
  | "empty"
  | "too_long"
  | "not_found"
  | "unknown";

const KNOWN_CODES = new Set<string>([
  "wrong_pin",
  "locked",
  "no_family",
  "not_guardian",
  "invalid_pin",
  "empty",
  "too_long",
  "not_found",
]);

export const NOTE_TITLE_MAX = 200;
export const NOTE_BODY_MAX = 20000;
export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 8;

export function notesErrorCode(value: unknown): NotesErrorCode {
  return typeof value === "string" && KNOWN_CODES.has(value) ? (value as NotesErrorCode) : "unknown";
}

export function notesErrorMessage(code: NotesErrorCode): string {
  switch (code) {
    case "wrong_pin":
      return "Die PIN ist falsch.";
    case "locked":
      return "Zu viele Fehlversuche. Bitte in ein paar Minuten erneut versuchen.";
    case "no_family":
      return "Kein Familienkonto gefunden.";
    case "not_guardian":
      return "Die PIN dürfen nur Erwachsene ändern.";
    case "invalid_pin":
      return `Die PIN muss aus ${PIN_MIN_LENGTH} bis ${PIN_MAX_LENGTH} Ziffern bestehen.`;
    case "empty":
      return "Die Notiz braucht einen Titel oder Text.";
    case "too_long":
      return `Titel höchstens ${NOTE_TITLE_MAX}, Text höchstens ${NOTE_BODY_MAX} Zeichen.`;
    case "not_found":
      return "Die Notiz gibt es nicht mehr.";
    default:
      return "Aktion fehlgeschlagen. Bitte erneut versuchen.";
  }
}

export function isValidPin(pin: string): boolean {
  return new RegExp(`^[0-9]{${PIN_MIN_LENGTH},${PIN_MAX_LENGTH}}$`).test(pin);
}

/** Validiert die Eingaben vor dem Speichern; null = ok. */
export function validateNote(title: string, body: string): NotesErrorCode | null {
  if (!title.trim() && !body.trim()) return "empty";
  if (title.trim().length > NOTE_TITLE_MAX || body.length > NOTE_BODY_MAX) return "too_long";
  return null;
}

/** Wichtige zuerst, dann zuletzt geändert zuerst. */
export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort(
    (a, b) =>
      Number(b.is_important) - Number(a.is_important) || b.updated_at.localeCompare(a.updated_at)
  );
}

export function upsertNote(notes: Note[], note: Note): Note[] {
  const exists = notes.some((n) => n.id === note.id);
  return sortNotes(exists ? notes.map((n) => (n.id === note.id ? note : n)) : [...notes, note]);
}

/** Volltextsuche über Titel und Text, Groß-/Kleinschreibung egal. */
export function filterNotes(notes: Note[], query: string): Note[] {
  const q = query.trim().toLocaleLowerCase("de");
  if (!q) return notes;
  return notes.filter(
    (n) => n.title.toLocaleLowerCase("de").includes(q) || n.body.toLocaleLowerCase("de").includes(q)
  );
}
