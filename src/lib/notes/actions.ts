import { createClient } from "@/lib/supabase/client";
import type { Note } from "@/lib/supabase/types";
import { notesErrorCode, type NotesErrorCode } from "./logic";

/**
 * Wrapper um die RPCs notes_* (Migration 025). Jeder Aufruf schickt die PIN
 * mit — die Datenbank prüft sie jedes Mal, die Tabelle selbst ist für den
 * Client nicht lesbar.
 */
export type NotesResult<T> = { data: T } | { error: NotesErrorCode };

type RpcPayload = { error?: string; notes?: Note[]; note?: Note; ok?: boolean } | null;

async function call<T>(
  run: (supabase: ReturnType<typeof createClient>) => PromiseLike<{ data: unknown; error: unknown }>,
  pick: (payload: NonNullable<RpcPayload>) => T | undefined
): Promise<NotesResult<T>> {
  try {
    const { data, error } = await run(createClient());
    if (error) {
      console.error("Notizen-RPC fehlgeschlagen", error);
      return { error: "unknown" };
    }
    const payload = data as RpcPayload;
    if (!payload) return { error: "unknown" };
    if (payload.error) return { error: notesErrorCode(payload.error) };
    const value = pick(payload);
    return value === undefined ? { error: "unknown" } : { data: value };
  } catch (error) {
    console.error("Notizen-RPC fehlgeschlagen", error);
    return { error: "unknown" };
  }
}

export function listNotes(pin: string) {
  return call((s) => s.rpc("notes_list", { pin }), (p) => p.notes);
}

export function saveNote(
  pin: string,
  note: { title: string; body: string; is_important: boolean },
  noteId: string | null
) {
  return call(
    (s) => s.rpc("notes_save", { pin, note_data: note, note_id: noteId }),
    (p) => p.note
  );
}

export function setNoteImportant(pin: string, noteId: string, important: boolean) {
  return call(
    (s) => s.rpc("notes_set_important", { pin, note_id: noteId, important }),
    (p) => p.note
  );
}

export function deleteNote(pin: string, noteId: string) {
  return call((s) => s.rpc("notes_delete", { pin, note_id: noteId }), (p) => p.ok);
}

export function changeNotesPin(currentPin: string, newPin: string) {
  return call(
    (s) => s.rpc("notes_change_pin", { current_pin: currentPin, new_pin: newPin }),
    (p) => p.ok
  );
}
