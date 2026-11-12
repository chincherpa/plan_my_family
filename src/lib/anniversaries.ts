import type { AnniversaryKind, AppointmentWithParticipants } from "@/lib/supabase/types";
import { startOfDay } from "@/lib/utils";
import { buildRecurrenceRule } from "@/lib/utils/recurrence";

/**
 * Jahrestage sind ganztägige Ereignis-Serien (is_event, is_all_day,
 * FREQ=YEARLY) in `appointments`, markiert über `anniversary_kind`.
 * Siehe supabase/migrations/016_anniversaries.sql.
 */

export interface AnniversaryKindInfo {
  label: string;
  emoji: string;
  /** Platzhalter für die Bezeichnung im Formular */
  placeholder: string;
  /** "wird 40", "25. Hochzeitstag", … */
  countLabel: (n: number) => string;
}

export const ANNIVERSARY_KINDS: Record<AnniversaryKind, AnniversaryKindInfo> = {
  birthday: {
    label: "Geburtstag",
    emoji: "🎂",
    placeholder: "z.B. Oma Erika",
    countLabel: (n) => `wird ${n}`,
  },
  wedding: {
    label: "Hochzeitstag",
    emoji: "💍",
    placeholder: "z.B. Mama & Papa",
    countLabel: (n) => `${n}. Hochzeitstag`,
  },
  relationship: {
    label: "Kennenlerntag",
    emoji: "❤️",
    placeholder: "z.B. Anna & Tom",
    countLabel: (n) => `${n} ${n === 1 ? "Jahr" : "Jahre"}`,
  },
  memorial: {
    label: "Gedenktag",
    emoji: "🕯️",
    placeholder: "z.B. Opa Heinz",
    countLabel: (n) => `${n}. Jahrestag`,
  },
  other: {
    label: "Sonstiges",
    emoji: "🎉",
    placeholder: "z.B. Einzug ins Haus",
    countLabel: (n) => `${n} ${n === 1 ? "Jahr" : "Jahre"}`,
  },
};

export const ANNIVERSARY_KIND_ORDER: AnniversaryKind[] = [
  "birthday",
  "wedding",
  "relationship",
  "memorial",
  "other",
];

export const MONTHS_DE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

/**
 * Platzhalterjahr für Jahrestage ohne bekanntes Jahr. Ein Schaltjahr, damit
 * auch der 29. Februar ein gültiges Datum ergibt.
 */
export const UNKNOWN_YEAR_ANCHOR = 2000;

export interface Anniversary {
  appointment: AppointmentWithParticipants;
  kind: AnniversaryKind;
  title: string;
  /** 1–12 */
  month: number;
  /** 1–31 */
  day: number;
  /** Ursprungsjahr, null wenn unbekannt */
  year: number | null;
  /**
   * true für jährliche Ereignisse, die vor der Jahrestage-Funktion im
   * Kalender angelegt wurden (ohne anniversary_kind). Ihr Startjahr ist das
   * Anlagejahr, nicht das Ursprungsjahr — daher kein Alter.
   */
  isLegacy: boolean;
}

export interface UpcomingAnniversary {
  anniversary: Anniversary;
  /** Nächstes Vorkommen (lokale Mitternacht), heute eingeschlossen */
  date: Date;
  daysUntil: number;
  /** Jubiläumszahl beim nächsten Vorkommen, null wenn das Jahr unbekannt ist */
  count: number | null;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Offene jährliche Serie (ohne COUNT/UNTIL)? */
function isOpenYearlyRule(rule: string | null): boolean {
  if (!rule) return false;
  return /FREQ=YEARLY/.test(rule) && !/COUNT=|UNTIL=/.test(rule);
}

function guessKind(title: string): AnniversaryKind {
  if (/geburtstag|bday|birthday/i.test(title)) return "birthday";
  if (/hochzeit/i.test(title)) return "wedding";
  return "other";
}

/** Appointment → Jahrestag, oder null wenn es keiner ist. */
export function toAnniversary(appt: AppointmentWithParticipants): Anniversary | null {
  if (appt.is_deleted || appt.recurrence_parent_id) return null;
  const isMarked = appt.anniversary_kind != null;
  if (!isMarked && !(appt.is_event && isOpenYearlyRule(appt.recurrence_rule))) return null;

  const start = new Date(appt.start_time);
  return {
    appointment: appt,
    kind: appt.anniversary_kind ?? guessKind(appt.title),
    title: appt.title,
    month: start.getMonth() + 1,
    day: start.getDate(),
    year: isMarked && appt.anniversary_year_known ? start.getFullYear() : null,
    isLegacy: !isMarked,
  };
}

export function collectAnniversaries(appointments: AppointmentWithParticipants[]): Anniversary[] {
  return appointments.map(toAnniversary).filter((a): a is Anniversary => a !== null);
}

/** Datum des Jahrestags im gegebenen Jahr; 29.2. fällt in Nicht-Schaltjahren auf den 28.2. */
export function dateInYear(a: Pick<Anniversary, "month" | "day">, year: number): Date {
  const day = Math.min(a.day, daysInMonth(year, a.month));
  return new Date(year, a.month - 1, day);
}

export function nextOccurrence(a: Anniversary, today: Date): Date {
  const base = startOfDay(today);
  let year = base.getFullYear();
  // Liegt das Ursprungsjahr in der Zukunft, beginnt die Serie erst dort.
  if (a.year !== null && a.year > year) year = a.year;
  let date = dateInYear(a, year);
  if (date < base) date = dateInYear(a, year + 1);
  return date;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function daysBetween(from: Date, to: Date): number {
  // Runden fängt die Stunde bei Sommer-/Winterzeitwechseln ab.
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / MS_PER_DAY);
}

export function anniversaryCount(a: Anniversary, date: Date): number | null {
  if (a.year === null) return null;
  const n = date.getFullYear() - a.year;
  return n > 0 ? n : null;
}

/** Alle Jahrestage, sortiert nach nächstem Vorkommen (heute zuerst). */
export function upcomingAnniversaries(
  anniversaries: Anniversary[],
  today: Date
): UpcomingAnniversary[] {
  return anniversaries
    .map((anniversary) => {
      const date = nextOccurrence(anniversary, today);
      return {
        anniversary,
        date,
        daysUntil: daysBetween(today, date),
        count: anniversaryCount(anniversary, date),
      };
    })
    .sort(
      (x, y) =>
        x.daysUntil - y.daysUntil ||
        x.anniversary.title.localeCompare(y.anniversary.title, "de")
    );
}

export function formatDaysUntil(days: number): string {
  if (days === 0) return "heute";
  if (days === 1) return "morgen";
  if (days === 2) return "übermorgen";
  if (days < 7) return `in ${days} Tagen`;
  if (days < 14) return "in 1 Woche";
  if (days < 60) return `in ${Math.floor(days / 7)} Wochen`;
  return `in ${Math.round(days / 30.44)} Monaten`;
}

export function formatDayMonth(a: Pick<Anniversary, "month" | "day">): string {
  return `${a.day}. ${MONTHS_DE[a.month - 1]}`;
}

export interface AnniversaryInput {
  kind: AnniversaryKind;
  title: string;
  day: number;
  month: number;
  year: number | null;
  notes: string | null;
}

/** Fehlermeldung oder null, wenn die Eingabe gültig ist. */
export function validateAnniversary(input: AnniversaryInput, today: Date): string | null {
  if (!input.title.trim()) return "Bitte eine Bezeichnung eingeben.";
  if (input.month < 1 || input.month > 12) return "Ungültiger Monat.";
  if (input.year !== null) {
    if (!Number.isInteger(input.year) || input.year < 1800 || input.year > today.getFullYear() + 50) {
      return "Ungültiges Jahr.";
    }
  }
  const maxDay = daysInMonth(input.year ?? UNKNOWN_YEAR_ANCHOR, input.month);
  if (input.day < 1 || input.day > maxDay) {
    return input.month === 2 && input.day === 29
      ? `${input.year} war kein Schaltjahr.`
      : "Diesen Tag gibt es im gewählten Monat nicht.";
  }
  return null;
}

/**
 * Die Spalten, mit denen ein Jahrestag in `appointments` landet.
 *
 * DTSTART liegt bewusst auf 12:00 UTC statt lokaler Mitternacht:
 * expandAppointments setzt die Uhrzeit jedes Vorkommens auf die von
 * start_time (00:00 lokal) — ausgehend vom Mittag bleibt das Datum dabei
 * stabil, auch wenn Ursprungs- und Zieljahr unterschiedlich zur Sommerzeit
 * stehen (Ende März / Ende Oktober).
 *
 * Für den 29. Februar ergibt BYMONTH=2;BYMONTHDAY=-1 den letzten Februartag,
 * sonst würde der Jahrestag nur in Schaltjahren erscheinen.
 */
export function anniversaryRecord(input: AnniversaryInput) {
  const year = input.year ?? UNKNOWN_YEAR_ANCHOR;
  const start = new Date(year, input.month - 1, input.day, 0, 0, 0);
  const end = new Date(year, input.month - 1, input.day, 23, 59, 59);
  const recurrence_rule = buildRecurrenceRule({
    freq: "yearly",
    start,
    end: { mode: "none" },
  });

  return {
    title: input.title.trim(),
    notes: input.notes?.trim() || null,
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    recurrence_rule,
    is_event: true,
    is_all_day: true,
    is_all_family: false,
    owner_id: null,
    vehicle_id: null,
    travel_before_min: 0,
    travel_after_min: 0,
    anniversary_kind: input.kind,
    anniversary_year_known: input.year !== null,
  };
}

/** Emoji + Jubiläumszahl für die Kalenderanzeige eines Vorkommens. */
export function anniversaryBadge(
  appt: AppointmentWithParticipants,
  occurrenceStart: Date
): { emoji: string; count: number | null } | null {
  if (!appt.anniversary_kind) return null;
  const emoji = ANNIVERSARY_KINDS[appt.anniversary_kind].emoji;
  if (!appt.anniversary_year_known) return { emoji, count: null };
  const n = occurrenceStart.getFullYear() - new Date(appt.start_time).getFullYear();
  return { emoji, count: n > 0 ? n : null };
}
