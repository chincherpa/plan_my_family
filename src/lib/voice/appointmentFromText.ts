import { z } from "zod";

/**
 * Sprache → Termin: Ein transkribierter Text wird von Claude in Titel, Datum
 * und Uhrzeit zerlegt, danach hier streng geprüft und in die Spalten der
 * Tabelle `appointments` übersetzt.
 *
 * Zwei Schemata mit Absicht:
 * - `ExtractionSchema` beschreibt, was Claude liefern darf. Jedes Feld ist
 *   Pflicht, darf aber `null` sein — so sagt das Modell „steht nicht im Text“,
 *   statt etwas zu erfinden.
 * - `checkExtraction` prüft danach Formate, Kalenderdaten und Pflichtfelder.
 *   Structured Outputs garantieren nur die Form, nicht den Inhalt.
 */

/** Die App rechnet in deutscher Ortszeit; der Server kann in UTC laufen. */
export const APP_TIME_ZONE = "Europe/Berlin";

/** Wie der CSV-Import: ohne Ende oder Dauer dauert ein Termin 60 Minuten. */
export const DEFAULT_DURATION_MIN = 60;

export const MAX_TEXT_LENGTH = 2000;

// ── Request-Body ────────────────────────────────────────────────────────────

export const RequestBodySchema = z.object({
  text: z
    .string({ error: '"text" muss ein String sein.' })
    .trim()
    .min(1, '"text" darf nicht leer sein.')
    .max(MAX_TEXT_LENGTH, `"text" darf höchstens ${MAX_TEXT_LENGTH} Zeichen lang sein.`),
});

export type RequestBody = z.infer<typeof RequestBodySchema>;

// ── Antwort von Claude ──────────────────────────────────────────────────────

export const ExtractionSchema = z.object({
  title: z
    .string()
    .nullable()
    .describe("Kurzer Titel des Termins, z. B. 'Zahnarzt'. null, wenn kein Anlass genannt ist."),
  date: z
    .string()
    .nullable()
    .describe("Datum als JJJJ-MM-TT, relative Angaben aufgelöst. null, wenn kein Tag genannt ist."),
  start_time: z
    .string()
    .nullable()
    .describe("Beginn als HH:MM (24 h). null, wenn keine Uhrzeit genannt ist."),
  end_time: z
    .string()
    .nullable()
    .describe("Ende als HH:MM (24 h), nur wenn genannt oder aus einer Dauer ableitbar, sonst null."),
  all_day: z
    .boolean()
    .describe("true nur, wenn der Text ausdrücklich ganztägig meint (z. B. 'den ganzen Tag')."),
  person: z
    .string()
    .nullable()
    .describe("Name des Familienmitglieds, um das es geht — exakt aus der Liste. Sonst null."),
  notes: z.string().nullable().describe("Weitere Details aus dem Text (Ort, Mitbringen …), sonst null."),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

// ── Prüfung ─────────────────────────────────────────────────────────────────

export type RequiredField = "title" | "date" | "start_time";

export interface FieldProblem {
  field: keyof Extraction;
  message: string;
}

export interface CheckedAppointment {
  title: string;
  /** JJJJ-MM-TT, Ortszeit. */
  date: string;
  /** HH:MM, Ortszeit; null bei ganztägigen Terminen. */
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  person: string | null;
  notes: string | null;
  /** UTC-Zeitpunkte für `start_time` / `end_time`. */
  start: Date;
  end: Date;
}

export type CheckResult =
  | { ok: true; appointment: CheckedAppointment }
  | { ok: false; missing: RequiredField[]; invalid: FieldProblem[] };

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function blankToNull(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isRealDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d;
}

/** Versatz der Zeitzone zu UTC in Millisekunden zum Zeitpunkt `utcMs`. */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/**
 * Ortszeit (Datum + Uhrzeit in `timeZone`) → UTC-Zeitpunkt, unabhängig von der
 * Zeitzone des Servers. Zwei Durchläufe, damit Sommer-/Winterzeit stimmt.
 */
export function zonedToUtc(date: string, time: string, seconds = 0, timeZone = APP_TIME_ZONE): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wallAsUtc = Date.UTC(y, mo - 1, d, h, mi, seconds);
  let utc = wallAsUtc - zoneOffsetMs(wallAsUtc, timeZone);
  utc = wallAsUtc - zoneOffsetMs(utc, timeZone);
  return new Date(utc);
}

/** Prüft Claudes Antwort auf Pflichtfelder und gültige Werte. */
export function checkExtraction(raw: Extraction): CheckResult {
  const title = blankToNull(raw.title);
  const date = blankToNull(raw.date);
  const startTime = blankToNull(raw.start_time);
  const endTime = blankToNull(raw.end_time);
  const allDay = raw.all_day;

  const missing: RequiredField[] = [];
  const invalid: FieldProblem[] = [];

  if (!title) missing.push("title");
  if (!date) missing.push("date");
  else if (!isRealDate(date)) invalid.push({ field: "date", message: `"${date}" ist kein gültiges Datum (JJJJ-MM-TT).` });

  if (!allDay) {
    if (!startTime) missing.push("start_time");
    else if (!TIME_RE.test(startTime)) {
      invalid.push({ field: "start_time", message: `"${startTime}" ist keine gültige Uhrzeit (HH:MM).` });
    }
    if (endTime && !TIME_RE.test(endTime)) {
      invalid.push({ field: "end_time", message: `"${endTime}" ist keine gültige Uhrzeit (HH:MM).` });
    }
  }

  if (missing.length > 0 || invalid.length > 0) return { ok: false, missing, invalid };

  let start: Date;
  let end: Date;
  if (allDay) {
    // Wie Formular und Import: 00:00 bis 23:59:59 des Tages.
    start = zonedToUtc(date!, "00:00");
    end = zonedToUtc(date!, "23:59", 59);
  } else {
    start = zonedToUtc(date!, startTime!);
    end = endTime ? zonedToUtc(date!, endTime) : new Date(start.getTime() + DEFAULT_DURATION_MIN * 60_000);
    if (end <= start) {
      return {
        ok: false,
        missing: [],
        invalid: [{ field: "end_time", message: `Ende ${endTime} liegt nicht nach dem Beginn ${startTime}.` }],
      };
    }
  }

  return {
    ok: true,
    appointment: {
      title: title!,
      date: date!,
      startTime: allDay ? null : startTime,
      endTime: allDay ? null : endTime,
      allDay,
      person: blankToNull(raw.person),
      notes: blankToNull(raw.notes),
      start,
      end,
    },
  };
}
