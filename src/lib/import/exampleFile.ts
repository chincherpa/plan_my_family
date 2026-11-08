import { CSV_COLUMNS } from "@/lib/import/appointmentImport";
import { localDateStr } from "@/lib/utils";
import type { FamilyMember, Vehicle } from "@/lib/supabase/types";

/** Semikolon: das Standard-Trennzeichen von Excel im deutschsprachigen Raum. */
export const TEMPLATE_DELIMITER = ";";

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function csvCell(value: string): string {
  return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * CSV-Vorlage mit den echten Namen der Familie: Kopfzeile plus Beispieltermine in der
 * kommenden Woche, die jedes Feature einmal zeigen und sich unverändert importieren
 * lassen (alle Titel beginnen mit „Beispiel“, damit man sie leicht wieder löscht).
 * Mit BOM, damit Excel Umlaute richtig anzeigt.
 */
export function buildTemplateCsv(
  members: FamilyMember[],
  vehicles: Vehicle[],
  today: Date = new Date()
): string {
  const first = members[0]?.name ?? "Anna";
  const second = members[1]?.name ?? first;
  const vehicle = vehicles[0]?.name ?? "";

  const daysToMonday = ((8 - today.getDay()) % 7) || 7;
  const monday = addDays(today, daysToMonday);
  const day = (offset: number) => localDateStr(addDays(monday, offset));

  const examples: Record<string, string>[] = [
    {
      title: "Beispiel: Zahnarzt",
      start: `${day(1)}T09:00`,
      end: `${day(1)}T10:00`,
      owner: first,
      participants: second,
      notes: "Versichertenkarte mitnehmen",
      vehicle,
      travelBefore: "15",
      travelAfter: "15",
    },
    {
      title: "Beispiel: Training",
      start: `${day(0)}T17:00`,
      duration: "90",
      owner: second,
      participants: `${first}*`,
      repeat: "weekly",
      repeatDays: "MO|WE",
      repeatUntil: day(28),
      repeatSkip: day(7),
    },
    {
      title: "Beispiel: Müllabfuhr",
      start: `${day(3)}T07:00`,
      duration: "15",
      everyone: "ja",
      repeat: "biweekly",
    },
    {
      title: "Beispiel: Wochenendausflug",
      start: day(5),
      end: day(6),
      everyone: "ja",
    },
    {
      title: "Beispiel: Geburtstag Oma",
      start: day(9),
      event: "ja",
      repeat: "yearly",
    },
  ];

  const lines = [
    CSV_COLUMNS.join(TEMPLATE_DELIMITER),
    ...examples.map((row) => CSV_COLUMNS.map((c) => csvCell(row[c] ?? "")).join(TEMPLATE_DELIMITER)),
  ];
  return "﻿" + lines.join("\r\n") + "\r\n";
}
