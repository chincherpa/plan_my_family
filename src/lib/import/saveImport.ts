import type { createClient } from "@/lib/supabase/client";
import { skippedOccurrence, type ResolvedEntry } from "@/lib/import/appointmentImport";
import type { AppointmentWithParticipants } from "@/lib/supabase/types";
import { occurrenceDateKey } from "@/lib/utils/recurrence";

type Client = ReturnType<typeof createClient>;

export interface ImportFailure {
  /** Position in der Datei (1-basiert). */
  index: number;
  title: string;
  message: string;
}

export interface ImportOutcome {
  saved: AppointmentWithParticipants[];
  failures: ImportFailure[];
}

/**
 * Speichert die importierbaren Zeilen. Jeder Termin geht einzeln über dieselbe
 * RPC wie das Terminformular (Termin + Teilnehmer in einer Transaktion); ein
 * fehlgeschlagener Termin stoppt den Rest nicht, sondern landet in `failures`.
 *
 * Ausgefallene Serientermine werden wie beim „Nur diesen Termin löschen“ im
 * Formular als Löschmarker-Zeilen angelegt.
 */
export async function saveResolvedEntries(
  supabase: Client,
  rows: ResolvedEntry[],
  onProgress: (done: number, total: number) => void,
  concurrency = 4
): Promise<ImportOutcome> {
  const saved: AppointmentWithParticipants[] = [];
  const failures: ImportFailure[] = [];
  let next = 0;
  let done = 0;

  async function saveOne(row: ResolvedEntry) {
    const { entry, appointment, participants } = row;
    if (!appointment || !participants) return;

    const { data, error } = await supabase.rpc("save_appointment_with_participants", {
      appointment_data: appointment,
      participant_data: participants,
    });
    const parent = data as AppointmentWithParticipants | null;
    if (error || !parent) {
      console.error("Termin konnte nicht gespeichert werden.", error);
      failures.push({
        index: entry.index,
        title: entry.title,
        message: "Termin konnte nicht gespeichert werden.",
      });
      return;
    }
    saved.push(parent);

    const skipDates = entry.recurrence?.skipDates ?? [];
    if (skipDates.length === 0) return;

    const markers = skipDates.map((key) => {
      const occurrence = skippedOccurrence(key, entry.start, entry.end);
      return {
        family_id: appointment.family_id,
        title: entry.title,
        start_time: occurrence.start.toISOString(),
        end_time: occurrence.end.toISOString(),
        recurrence_parent_id: parent.id,
        exception_date: occurrenceDateKey(occurrence.start),
        is_deleted: true,
      };
    });
    const { data: markerRows, error: markerError } = await supabase
      .from("appointments")
      .insert(markers)
      .select();
    if (markerError || !markerRows) {
      console.error("Ausfalltermine konnten nicht gespeichert werden.", markerError);
      failures.push({
        index: entry.index,
        title: entry.title,
        message: "Serie gespeichert, aber die ausgefallenen Termine nicht.",
      });
      return;
    }
    for (const marker of markerRows as AppointmentWithParticipants[]) {
      saved.push({ ...marker, participants: [] });
    }
  }

  async function worker() {
    while (next < rows.length) {
      const row = rows[next++];
      try {
        await saveOne(row);
      } catch (e) {
        console.error("Import fehlgeschlagen.", e);
        failures.push({
          index: row.entry.index,
          title: row.entry.title,
          message: "Termin konnte nicht gespeichert werden.",
        });
      }
      onProgress(++done, rows.length);
    }
  }

  onProgress(0, rows.length);
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, worker));
  failures.sort((a, b) => a.index - b.index);
  return { saved, failures };
}
