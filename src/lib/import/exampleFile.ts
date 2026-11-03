import { IMPORT_FORMAT, IMPORT_VERSION } from "@/lib/import/appointmentImport";
import { localDateStr } from "@/lib/utils";
import type { FamilyMember, Vehicle } from "@/lib/supabase/types";

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/**
 * Beispieldatei mit den echten Namen der Familie, deren Termine in der kommenden
 * Woche liegen. Sie zeigt jedes Feature einmal und lässt sich unverändert
 * importieren (alle Titel beginnen mit „Beispiel“, damit man sie leicht wieder löscht).
 */
export function buildExampleFile(
  members: FamilyMember[],
  vehicles: Vehicle[],
  today: Date = new Date()
): string {
  const first = members[0]?.name ?? "Anna";
  const second = members[1]?.name ?? first;
  const vehicle = vehicles[0]?.name;

  const daysToMonday = ((8 - today.getDay()) % 7) || 7;
  const monday = addDays(today, daysToMonday);
  const day = (offset: number) => localDateStr(addDays(monday, offset));

  const example = {
    format: IMPORT_FORMAT,
    version: IMPORT_VERSION,
    description:
      "Beispiel für den Termin-Import. Zeiten sind lokale Zeiten (JJJJ-MM-TTTHH:MM), reine Datumsangaben sind ganztägig.",
    appointments: [
      {
        title: "Beispiel: Zahnarzt",
        start: `${day(1)}T09:00`,
        end: `${day(1)}T10:00`,
        owner: first,
        participants: [second],
        notes: "Versichertenkarte mitnehmen",
        travelBefore: 15,
        travelAfter: 15,
        ...(vehicle ? { vehicle } : {}),
      },
      {
        title: "Beispiel: Training",
        start: `${day(0)}T17:00`,
        duration: 90,
        owner: second,
        participants: [{ name: first, supervisor: true }],
        repeat: { freq: "weekly", days: ["MO", "WE"], until: day(28), skip: [day(7)] },
      },
      {
        title: "Beispiel: Müllabfuhr",
        start: `${day(3)}T07:00`,
        duration: 15,
        everyone: true,
        repeat: "biweekly",
      },
      {
        title: "Beispiel: Wochenendausflug",
        start: day(5),
        end: day(6),
        everyone: true,
      },
      {
        title: "Beispiel: Geburtstag Oma",
        start: day(9),
        event: true,
        repeat: "yearly",
      },
    ],
  };

  return JSON.stringify(example, null, 2) + "\n";
}
