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
  /** true: nur auswerten und Vorschau liefern, nichts speichern. */
  preview: z.boolean({ error: '"preview" muss true oder false sein.' }).optional(),
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
    if (endTime === startTime) {
      return {
        ok: false,
        missing: [],
        invalid: [{ field: "end_time", message: `Ende ${endTime} liegt nicht nach dem Beginn ${startTime}.` }],
      };
    }
    if (endTime && end <= start) {
      // Ende vor dem Beginn → über Mitternacht, endet am Folgetag („22 bis 1 Uhr“).
      const [y, m, d] = date!.split("-").map(Number);
      const nextDay = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
      end = zonedToUtc(nextDay, endTime);
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

// ── Fragen an den Kalender ──────────────────────────────────────────────────

/**
 * - appointment: normale Termine (kein Ereignis, kein Jahrestag)
 * - event: Ereignisse wie Feiertage oder Ferien
 * - birthday: Jahrestage der Art „Geburtstag“
 * - anniversary: die übrigen Jahrestage (Hochzeitstag, Gedenktag, …)
 * - any: alles
 */
export const QUERY_CATEGORIES = ["any", "appointment", "event", "birthday", "anniversary"] as const;
export type QueryCategory = (typeof QUERY_CATEGORIES)[number];

export const MAX_QUERY_LIMIT = 10;
const DEFAULT_QUERY_LIMIT = 5;

export const QuerySchema = z.object({
  category: z
    .enum(QUERY_CATEGORIES)
    .describe(
      "birthday = Geburtstage, anniversary = andere Jahrestage (Hochzeitstag, Gedenktag), appointment = normale Termine, event = Ereignisse (Feiertage, Ferien), any = allgemein ('Was steht an?')."
    ),
  person: z
    .string()
    .nullable()
    .describe("Familienmitglied, auf das sich die Frage bezieht — exakt aus der Liste. Sonst null."),
  search: z
    .string()
    .nullable()
    .describe("Stichwort aus dem Titel ('Zahnarzt') oder Name außerhalb der Liste ('Oma Erika'). Sonst null."),
  from_date: z.string().nullable().describe("Beginn des gefragten Zeitraums als JJJJ-MM-TT. null = ab jetzt."),
  to_date: z.string().nullable().describe("Ende des gefragten Zeitraums (inklusive) als JJJJ-MM-TT. null = offen."),
  // Bewusst ohne .int(): das SDK hängt dann riesige Min/Max-Grenzen an die Beschreibung.
  // checkQuery macht eine Ganzzahl im Bereich 1–10 daraus.
  limit: z.number().describe("Anzahl Treffer als ganze Zahl von 1 bis 10: 1 bei 'der nächste …', sonst 5 bis 10."),
});

/** Was Claude bei jedem Satz liefert: Absicht, Termin-Felder und Frage. */
export const InterpretationSchema = z.object({
  intent: z
    .enum(["create", "query", "unclear"])
    .describe(
      "create = neuen Termin anlegen, query = nach bestehenden Einträgen fragen, unclear = weder noch."
    ),
  ...ExtractionSchema.shape,
  query: QuerySchema.nullable().describe("Nur bei intent 'query', sonst null."),
});

export type Interpretation = z.infer<typeof InterpretationSchema>;

/** Geprüfte Frage, so wie sie an den Client geht. */
export interface VoiceQuery {
  category: QueryCategory;
  /** Name des Familienmitglieds, auf das sich die Frage bezieht. */
  person: string | null;
  person_id: string | null;
  /** Stichwort im Titel (auch ein Name, der kein Familienmitglied ist). */
  search: string | null;
  /** JJJJ-MM-TT; null = ab jetzt. */
  from_date: string | null;
  /** JJJJ-MM-TT, inklusive; null = offen. */
  to_date: string | null;
  limit: number;
}

export type QueryCheckResult =
  | { ok: true; query: VoiceQuery }
  | { ok: false; invalid: { field: string; message: string }[] };

/** Prüft die Frage von Claude und ordnet den Personennamen einem Familienmitglied zu. */
export function checkQuery(
  raw: z.infer<typeof QuerySchema> | null,
  members: { id: string; name: string }[]
): QueryCheckResult {
  if (!raw) {
    return { ok: false, invalid: [{ field: "query", message: "Die Frage konnte nicht ausgewertet werden." }] };
  }

  const invalid: { field: string; message: string }[] = [];
  const fromDate = blankToNull(raw.from_date);
  const toDate = blankToNull(raw.to_date);
  for (const [field, value] of [["from_date", fromDate], ["to_date", toDate]] as const) {
    if (value && !isRealDate(value)) {
      invalid.push({ field, message: `"${value}" ist kein gültiges Datum (JJJJ-MM-TT).` });
    }
  }
  if (invalid.length === 0 && fromDate && toDate && toDate < fromDate) {
    invalid.push({ field: "to_date", message: `Das Ende ${toDate} liegt vor dem Beginn ${fromDate}.` });
  }
  if (invalid.length > 0) return { ok: false, invalid };

  // Ein Name, der kein Familienmitglied ist (Oma Erika), wird zum Suchbegriff im Titel.
  const personName = blankToNull(raw.person);
  const member = personName
    ? members.find((m) => m.name.localeCompare(personName, "de", { sensitivity: "base" }) === 0)
    : undefined;
  const search = blankToNull(raw.search) ?? (personName && !member ? personName : null);

  const limit = Number.isFinite(raw.limit)
    ? Math.min(MAX_QUERY_LIMIT, Math.max(1, Math.trunc(raw.limit)))
    : DEFAULT_QUERY_LIMIT;

  return {
    ok: true,
    query: {
      category: raw.category,
      person: member?.name ?? null,
      person_id: member?.id ?? null,
      search,
      from_date: fromDate,
      to_date: toDate,
      limit,
    },
  };
}
