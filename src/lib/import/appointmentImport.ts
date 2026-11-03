/**
 * Termin-Import: Datei lesen → prüfen → Namen zuordnen → speicherfertige Daten.
 *
 * Das Dateiformat ist in docs/termin-import.md beschrieben. Alles hier ist rein
 * funktional (kein Supabase, kein React), damit es sich gut testen lässt.
 *
 * Zeiten arbeiten wie der Rest der App in lokaler Zeit (startOfDay, setHours,
 * localDateStr) — `pnpm test` pinnt TZ=Europe/Berlin.
 */
import { RRule, type Options as RRuleOptions } from "rrule";
import { localDateStr } from "@/lib/utils";
import { occurrenceDateKey } from "@/lib/utils/recurrence";
import type {
  AppointmentWithParticipants,
  FamilyMember,
  Vehicle,
} from "@/lib/supabase/types";

export const IMPORT_FORMAT = "plan-my-family/appointments";
export const IMPORT_VERSION = 1;
export const MAX_IMPORT_ENTRIES = 2000;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

/** Obergrenzen wie im Terminformular. */
const MAX_TRAVEL_MIN = 240;
const DEFAULT_DURATION_MIN = 60;
const MAX_DURATION_MIN = 14 * 24 * 60;

// ───────────────────────────── Datei lesen ─────────────────────────────

export interface ParsedFile {
  items: unknown[];
  /** Fehler, die die ganze Datei betreffen (dann ist `items` leer). */
  fileErrors: string[];
}

/**
 * Akzeptiert drei Schreibweisen desselben Inhalts:
 *  1. `{ "format": …, "appointments": [ … ] }`  (empfohlen)
 *  2. ein nacktes Array `[ { … }, { … } ]`
 *  3. JSON Lines: ein Termin-Objekt pro Zeile (Zeilen mit # oder // werden übersprungen)
 */
export function parseImportText(raw: string): ParsedFile {
  const text = raw.replace(/^﻿/, "").trim();
  if (!text) return { items: [], fileErrors: ["Die Datei ist leer."] };

  let whole: unknown;
  let wholeError: string | null = null;
  try {
    whole = JSON.parse(text);
  } catch (e) {
    wholeError = e instanceof Error ? e.message : String(e);
  }

  if (wholeError === null) return fromJsonValue(whole);

  // Kein gültiges JSON als Ganzes → vielleicht JSON Lines.
  const lines = text.split(/\r?\n/);
  const content = lines
    .map((line, i) => ({ line: line.trim(), no: i + 1 }))
    .filter(({ line }) => line && !line.startsWith("#") && !line.startsWith("//"));
  if (content.length > 1) {
    const items: unknown[] = [];
    const errors: string[] = [];
    for (const { line, no } of content) {
      try {
        items.push(JSON.parse(line));
      } catch {
        errors.push(`Zeile ${no}: kein gültiges JSON.`);
      }
    }
    if (errors.length === 0) return fromJsonValue(items);
    return {
      items: [],
      fileErrors: [
        "Die Datei ist weder gültiges JSON noch gültiges JSON Lines.",
        ...errors.slice(0, 5),
        ...(errors.length > 5 ? [`… und ${errors.length - 5} weitere Zeilen.`] : []),
      ],
    };
  }
  return { items: [], fileErrors: [`Die Datei ist kein gültiges JSON (${wholeError}).`] };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function fromJsonValue(value: unknown): ParsedFile {
  let items: unknown[];
  if (Array.isArray(value)) {
    items = value;
  } else if (isRecord(value) && Array.isArray(value.appointments)) {
    if (value.format !== undefined && value.format !== IMPORT_FORMAT) {
      return {
        items: [],
        fileErrors: [`Unbekanntes Format "${String(value.format)}" (erwartet: "${IMPORT_FORMAT}").`],
      };
    }
    if (typeof value.version === "number" && value.version > IMPORT_VERSION) {
      return {
        items: [],
        fileErrors: [
          `Die Datei hat Version ${value.version}, diese App versteht höchstens Version ${IMPORT_VERSION}.`,
        ],
      };
    }
    items = value.appointments;
  } else if (isRecord(value) && "title" in value) {
    items = [value]; // ein einzelner Termin
  } else {
    return {
      items: [],
      fileErrors: ['Erwartet wird ein Objekt mit dem Feld "appointments" (Liste) oder eine Liste von Terminen.'],
    };
  }
  if (items.length === 0) return { items: [], fileErrors: ["Die Datei enthält keine Termine."] };
  if (items.length > MAX_IMPORT_ENTRIES) {
    return {
      items: [],
      fileErrors: [`Zu viele Termine (${items.length}). Maximal ${MAX_IMPORT_ENTRIES} pro Import.`],
    };
  }
  return { items, fileErrors: [] };
}

// ───────────────────────────── Termin prüfen ─────────────────────────────

export interface ImportRecurrence {
  /** RRULE-String inklusive DTSTART, so wie die App ihn in `recurrence_rule` speichert. */
  rule: string;
  /** Ausgefallene Termine der Serie als lokales "JJJJ-MM-TT". */
  skipDates: string[];
}

/** Ein formal geprüfter Termin; Namen sind noch Text aus der Datei. */
export interface ImportEntry {
  /** 1-basierte Position in der Datei, für Meldungen. */
  index: number;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  event: boolean;
  everyone: boolean;
  owner: string | null;
  participants: { name: string; supervisor: boolean }[];
  notes: string | null;
  travelBefore: number;
  travelAfter: number;
  vehicle: string | null;
  recurrence: ImportRecurrence | null;
  errors: string[];
  warnings: string[];
}

const KNOWN_KEYS = new Set([
  "title", "start", "end", "duration", "allDay", "event", "everyone", "owner",
  "participants", "notes", "travelBefore", "travelAfter", "vehicle", "repeat",
]);

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}(?::?\d{2})?)?$/;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function validDate(y: number, m: number, d: number): boolean {
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

interface Moment {
  date: Date;
  /** Nur ein Datum ohne Uhrzeit angegeben. */
  dateOnly: boolean;
}

/** "2026-11-10" oder "2026-11-10T17:00" (lokal) bzw. mit Z / +01:00 (absolut). */
function parseMoment(value: unknown): Moment | null {
  if (typeof value !== "string") return null;
  const s = value.trim();

  const dateMatch = DATE_RE.exec(s);
  if (dateMatch) {
    const [y, m, d] = [Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3])];
    if (!validDate(y, m, d)) return null;
    return { date: new Date(y, m - 1, d, 0, 0, 0, 0), dateOnly: true };
  }

  const match = DATETIME_RE.exec(s);
  if (!match) return null;
  const [y, m, d, h, min] = match.slice(1, 6).map(Number);
  const sec = match[6] ? Number(match[6]) : 0;
  if (!validDate(y, m, d) || h > 23 || min > 59 || sec > 59) return null;
  const zone = match[7];
  if (!zone) return { date: new Date(y, m - 1, d, h, min, 0, 0), dateOnly: false };
  let offsetMin = 0;
  if (zone !== "Z") {
    const digits = zone.slice(1).replace(":", "");
    const offH = Number(digits.slice(0, 2));
    const offM = digits.length > 2 ? Number(digits.slice(2)) : 0;
    if (offH > 23 || offM > 59) return null;
    offsetMin = (zone[0] === "-" ? -1 : 1) * (offH * 60 + offM);
  }
  return { date: new Date(Date.UTC(y, m - 1, d, h, min, sec) - offsetMin * 60000), dateOnly: false };
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/** Wie das Formular: ganztägige Termine enden um 23:59:59 des letzten Tages. */
function endOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 0);
}

function readInt(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) return null;
  return value;
}

/** Prüft einen rohen Eintrag. Fehler landen in `errors`, der Eintrag ist dann nicht importierbar. */
export function normalizeEntry(raw: unknown, index: number): ImportEntry {
  const entry: ImportEntry = {
    index,
    title: "",
    start: new Date(NaN),
    end: new Date(NaN),
    allDay: false,
    event: false,
    everyone: false,
    owner: null,
    participants: [],
    notes: null,
    travelBefore: 0,
    travelAfter: 0,
    vehicle: null,
    recurrence: null,
    errors: [],
    warnings: [],
  };

  if (!isRecord(raw)) {
    entry.errors.push("Der Eintrag ist kein Objekt.");
    return entry;
  }

  for (const key of Object.keys(raw)) {
    if (!KNOWN_KEYS.has(key)) entry.warnings.push(`Unbekanntes Feld "${key}" wird ignoriert.`);
  }

  // Titel
  if (typeof raw.title !== "string" || !raw.title.trim()) {
    entry.errors.push('"title" fehlt oder ist leer.');
  } else {
    entry.title = raw.title.trim();
  }

  // Schalter
  for (const key of ["allDay", "event", "everyone"] as const) {
    if (raw[key] !== undefined && typeof raw[key] !== "boolean") {
      entry.errors.push(`"${key}" muss true oder false sein.`);
    }
  }
  entry.event = raw.event === true;
  entry.everyone = raw.everyone === true;

  // Zeit
  const startMoment = parseMoment(raw.start);
  if (!startMoment) {
    entry.errors.push('"start" fehlt oder hat kein gültiges Format (JJJJ-MM-TT oder JJJJ-MM-TTTHH:MM).');
  } else {
    const allDay = typeof raw.allDay === "boolean" ? raw.allDay : startMoment.dateOnly;
    entry.allDay = allDay;
    const endGiven = raw.end !== undefined && raw.end !== null;
    const endMoment = endGiven ? parseMoment(raw.end) : null;
    if (endGiven && !endMoment) {
      entry.errors.push('"end" hat kein gültiges Format (JJJJ-MM-TT oder JJJJ-MM-TTTHH:MM).');
    }

    if (allDay) {
      entry.start = startOfLocalDay(startMoment.date);
      entry.end = endOfLocalDay(endMoment ? endMoment.date : startMoment.date);
      if (!endGiven && raw.duration !== undefined) {
        entry.warnings.push('"duration" wird bei ganztägigen Terminen ignoriert.');
      }
      if (entry.end < entry.start) entry.errors.push('"end" liegt vor "start".');
    } else if (startMoment.dateOnly) {
      entry.errors.push('Uhrzeit fehlt in "start" (oder "allDay": true setzen).');
    } else {
      entry.start = startMoment.date;
      if (endMoment) {
        if (endMoment.dateOnly) {
          entry.errors.push('Bei Terminen mit Uhrzeit braucht auch "end" eine Uhrzeit.');
        } else {
          entry.end = endMoment.date;
        }
      } else if (!endGiven) {
        let minutes = DEFAULT_DURATION_MIN;
        if (raw.duration !== undefined) {
          const parsed = readInt(raw.duration, 1, MAX_DURATION_MIN);
          if (parsed === null) {
            entry.errors.push('"duration" muss eine ganze Zahl Minuten sein (1 bis 20160).');
          } else {
            minutes = parsed;
          }
        }
        entry.end = new Date(entry.start.getTime() + minutes * 60000);
      }
      if (!isNaN(entry.end.getTime()) && entry.end <= entry.start) {
        entry.errors.push("Das Ende muss nach dem Beginn liegen.");
      }
    }
  }

  // Personen
  if (raw.owner !== undefined && raw.owner !== null) {
    if (typeof raw.owner !== "string" || !raw.owner.trim()) {
      entry.errors.push('"owner" muss ein Name (Text) sein.');
    } else {
      entry.owner = raw.owner.trim();
    }
  }
  if (raw.participants !== undefined && raw.participants !== null) {
    if (!Array.isArray(raw.participants)) {
      entry.errors.push('"participants" muss eine Liste sein.');
    } else {
      const seen = new Map<string, { name: string; supervisor: boolean }>();
      raw.participants.forEach((p, i) => {
        const name = typeof p === "string" ? p : isRecord(p) ? p.name : undefined;
        const supervisor = isRecord(p) && p.supervisor === true;
        if (typeof name !== "string" || !name.trim()) {
          entry.errors.push(`participants[${i}]: Name fehlt (Text oder {"name": …}).`);
          return;
        }
        const key = nameKey(name);
        const known = seen.get(key);
        if (known) known.supervisor ||= supervisor;
        else seen.set(key, { name: name.trim(), supervisor });
      });
      entry.participants = [...seen.values()];
    }
  }

  // Fahrzeug, Anfahrt, Notizen
  if (raw.vehicle !== undefined && raw.vehicle !== null) {
    if (typeof raw.vehicle !== "string") entry.errors.push('"vehicle" muss ein Name (Text) sein.');
    else if (raw.vehicle.trim()) entry.vehicle = raw.vehicle.trim();
  }
  for (const key of ["travelBefore", "travelAfter"] as const) {
    if (raw[key] === undefined || raw[key] === null) continue;
    const minutes = readInt(raw[key], 0, MAX_TRAVEL_MIN);
    if (minutes === null) entry.errors.push(`"${key}" muss eine ganze Zahl Minuten sein (0 bis ${MAX_TRAVEL_MIN}).`);
    else entry[key] = minutes;
  }
  if (raw.notes !== undefined && raw.notes !== null) {
    if (typeof raw.notes !== "string") entry.errors.push('"notes" muss Text sein.');
    else entry.notes = raw.notes.trim() || null;
  }

  // Zusammenhänge, die das Terminformular genauso erzwingt
  if (entry.event && entry.everyone) {
    entry.warnings.push('"everyone" wird bei Ereignissen ignoriert.');
    entry.everyone = false;
  }
  if ((entry.event || entry.everyone) && (entry.owner || entry.participants.length > 0)) {
    entry.warnings.push(
      entry.event
        ? "Personen werden bei Ereignissen ignoriert."
        : 'Personen werden bei "everyone" ignoriert (der Termin erscheint in der Spalte „Alle“).'
    );
    entry.owner = null;
    entry.participants = [];
  }
  if ((entry.event || entry.allDay) && (entry.travelBefore > 0 || entry.travelAfter > 0)) {
    entry.warnings.push("Anfahrt/Rückfahrt wird bei ganztägigen Terminen und Ereignissen ignoriert.");
    entry.travelBefore = 0;
    entry.travelAfter = 0;
  }
  if ((entry.event || entry.allDay) && entry.vehicle) {
    entry.warnings.push("Das Fahrzeug wird bei ganztägigen Terminen und Ereignissen ignoriert.");
    entry.vehicle = null;
  }

  // Wiederholung (braucht gültigen Start/Ende)
  if (raw.repeat !== undefined && raw.repeat !== null && entry.errors.length === 0) {
    const result = buildRecurrence(raw.repeat, entry.start, entry.end);
    if ("error" in result) {
      entry.errors.push(result.error);
    } else {
      entry.start = result.start;
      entry.end = result.end;
      entry.recurrence = { rule: result.rule, skipDates: result.skipDates };
      entry.warnings.push(...result.warnings);
    }
  }

  return entry;
}

// ───────────────────────────── Wiederholung ─────────────────────────────

const WEEKDAYS = { MO: RRule.MO, TU: RRule.TU, WE: RRule.WE, TH: RRule.TH, FR: RRule.FR, SA: RRule.SA, SU: RRule.SU };

/** Die Voreinstellungen entsprechen den Auswahlpunkten im Terminformular. */
const PRESETS: Record<string, Partial<RRuleOptions>> = {
  daily: { freq: RRule.DAILY },
  weekdays: { freq: RRule.WEEKLY, byweekday: [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR] },
  weekend: { freq: RRule.WEEKLY, byweekday: [RRule.SA, RRule.SU] },
  weekly: { freq: RRule.WEEKLY },
  biweekly: { freq: RRule.WEEKLY, interval: 2 },
  monthly: { freq: RRule.MONTHLY },
  yearly: { freq: RRule.YEARLY },
};

/**
 * DTSTART der Regel: der lokale Mittag des Starttags statt der echten Startzeit.
 *
 * rrule wertet Wochentage in UTC aus, `expandAppointments` übersetzt die Treffer
 * aber in lokale Tage. Bei Terminen kurz nach Mitternacht (und ganztägigen, die
 * um 00:00 beginnen) liegt das UTC-Datum vor dem lokalen — „Mo/Mi“ würde dann
 * als Di/Do angezeigt. Mittags stimmen beide Daten in jeder Zeitzone überein.
 * Die Uhrzeit des Termins kommt ohnehin aus start_time, nicht aus der Regel.
 */
function ruleAnchor(start: Date): Date {
  return new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12, 0, 0, 0);
}

const ALLOWED_FREQS = [RRule.DAILY, RRule.WEEKLY, RRule.MONTHLY, RRule.YEARLY];

type RecurrenceResult =
  | { error: string }
  | { rule: string; start: Date; end: Date; skipDates: string[]; warnings: string[] };

/** Der Anzeige-Tag einer Wiederholung — exakt wie `expandAppointments` ihn bildet. */
function occurrenceStartOf(instant: Date, start: Date): Date {
  const occ = new Date(instant);
  occ.setHours(start.getHours(), start.getMinutes(), 0, 0);
  return occ;
}

function buildRecurrence(repeat: unknown, start: Date, end: Date): RecurrenceResult {
  let base: Partial<RRuleOptions> = {};
  let skipRaw: unknown;
  const warnings: string[] = [];

  const fromRruleString = (text: string): string | null => {
    const cleaned = text.trim().replace(/^RRULE:/i, "");
    if (/DTSTART/i.test(cleaned)) return 'Der RRULE-Text darf kein DTSTART enthalten (der Start kommt aus "start").';
    try {
      base = RRule.parseString(cleaned);
    } catch {
      return `Ungültiger RRULE-Text "${text}".`;
    }
    if (base.freq === undefined || !ALLOWED_FREQS.includes(base.freq)) {
      return "Die Wiederholung muss täglich, wöchentlich, monatlich oder jährlich sein (FREQ=DAILY|WEEKLY|MONTHLY|YEARLY).";
    }
    // Ein reines Datum in UNTIL (JJJJMMTT) meint den ganzen Tag, nicht Mitternacht.
    const until = base.until;
    if (until && until.getUTCHours() === 0 && until.getUTCMinutes() === 0 && until.getUTCSeconds() === 0) {
      base.until = new Date(until.getTime() + 24 * 3600 * 1000 - 1000);
    }
    return null;
  };

  if (typeof repeat === "string") {
    if (repeat.includes("=")) {
      const err = fromRruleString(repeat);
      if (err) return { error: err };
    } else {
      const preset = PRESETS[repeat.trim().toLowerCase()];
      if (!preset) {
        return {
          error: `Unbekannte Wiederholung "${repeat}". Erlaubt: ${Object.keys(PRESETS).join(", ")} oder ein RRULE-Text.`,
        };
      }
      base = { ...preset };
    }
  } else if (isRecord(repeat)) {
    for (const key of Object.keys(repeat)) {
      if (!["freq", "interval", "days", "until", "count", "skip", "rrule"].includes(key)) {
        warnings.push(`Unbekanntes Feld "repeat.${key}" wird ignoriert.`);
      }
    }
    skipRaw = repeat.skip;

    if (repeat.rrule !== undefined) {
      if (typeof repeat.rrule !== "string") return { error: '"repeat.rrule" muss Text sein.' };
      if (repeat.freq !== undefined || repeat.interval !== undefined || repeat.days !== undefined ||
          repeat.until !== undefined || repeat.count !== undefined) {
        return { error: '"repeat.rrule" kann nicht mit freq/interval/days/until/count kombiniert werden.' };
      }
      const err = fromRruleString(repeat.rrule);
      if (err) return { error: err };
    } else {
      if (typeof repeat.freq !== "string" || !PRESETS[repeat.freq.trim().toLowerCase()]) {
        return { error: `"repeat.freq" fehlt oder ist unbekannt. Erlaubt: ${Object.keys(PRESETS).join(", ")}.` };
      }
      const freqName = repeat.freq.trim().toLowerCase();
      base = { ...PRESETS[freqName] };

      if (repeat.interval !== undefined) {
        const interval = readInt(repeat.interval, 1, 99);
        if (interval === null) return { error: '"repeat.interval" muss eine ganze Zahl von 1 bis 99 sein.' };
        if (freqName === "biweekly" && interval !== 2) {
          return { error: '"biweekly" bedeutet alle 2 Wochen — für andere Abstände "weekly" mit "interval" verwenden.' };
        }
        base.interval = interval;
      }
      if (repeat.days !== undefined) {
        if (freqName !== "weekly" && freqName !== "biweekly") {
          return { error: '"repeat.days" ist nur bei freq "weekly" oder "biweekly" möglich.' };
        }
        if (!Array.isArray(repeat.days) || repeat.days.length === 0) {
          return { error: '"repeat.days" muss eine Liste von Wochentagen sein (MO, TU, WE, TH, FR, SA, SU).' };
        }
        const picked = [];
        for (const day of repeat.days) {
          const key = typeof day === "string" ? day.trim().toUpperCase() : "";
          if (!(key in WEEKDAYS)) {
            return { error: `Unbekannter Wochentag "${String(day)}" in "repeat.days" (MO, TU, WE, TH, FR, SA, SU).` };
          }
          picked.push(WEEKDAYS[key as keyof typeof WEEKDAYS]);
        }
        base.byweekday = picked;
      }
      if (repeat.until !== undefined && repeat.count !== undefined) {
        return { error: '"repeat.until" und "repeat.count" können nicht gleichzeitig angegeben werden.' };
      }
      if (repeat.until !== undefined) {
        const until = parseMoment(repeat.until);
        if (!until) return { error: '"repeat.until" hat kein gültiges Datum (JJJJ-MM-TT).' };
        base.until = until.dateOnly ? endOfLocalDay(until.date) : until.date;
      }
      if (repeat.count !== undefined) {
        const count = readInt(repeat.count, 1, 1000);
        if (count === null) return { error: '"repeat.count" muss eine ganze Zahl von 1 bis 1000 sein.' };
        base.count = count;
      }
    }
  } else {
    return { error: '"repeat" muss Text (z. B. "weekly") oder ein Objekt sein.' };
  }

  const durationMs = end.getTime() - start.getTime();
  let rule = new RRule({ ...base, dtstart: ruleAnchor(start) });

  // Passt der Starttag nicht zur Regel (z. B. Donnerstag bei MO/WE), beginnt die
  // Serie am ersten passenden Tag, damit der Termin nicht auf einem Tag liegt,
  // an dem er gar nicht stattfindet.
  const first = rule.after(ruleAnchor(start), true);
  if (!first) return { error: "Die Wiederholung erzeugt keinen einzigen Termin (liegt UNTIL vor dem Start?)." };
  const firstStart = occurrenceStartOf(first, start);
  let newStart = start;
  let newEnd = end;
  if (localDateStr(firstStart) !== localDateStr(start)) {
    newStart = firstStart;
    newEnd = new Date(firstStart.getTime() + durationMs);
    rule = new RRule({ ...base, dtstart: ruleAnchor(newStart) });
    warnings.push(`Startdatum auf den ersten passenden Tag der Serie verschoben (${localDateStr(newStart)}).`);
  }

  // Ausnahmen: nur Tage, an denen die Serie wirklich einen Termin hat
  const skipDates: string[] = [];
  if (skipRaw !== undefined && skipRaw !== null) {
    if (!Array.isArray(skipRaw)) return { error: '"repeat.skip" muss eine Liste von Daten sein.' };
    for (const value of skipRaw) {
      const moment = parseMoment(value);
      if (!moment) return { error: `"repeat.skip": "${String(value)}" ist kein gültiges Datum (JJJJ-MM-TT).` };
      const key = localDateStr(moment.date);
      const dayBefore = new Date(moment.date.getFullYear(), moment.date.getMonth(), moment.date.getDate() - 1);
      const dayAfter = new Date(moment.date.getFullYear(), moment.date.getMonth(), moment.date.getDate() + 2);
      const hit = rule
        .between(dayBefore, dayAfter, true)
        .some((instant) => occurrenceDateKey(occurrenceStartOf(instant, newStart)) === key);
      if (!hit) warnings.push(`Ausnahme ${key} ist kein Termin der Serie und wird ignoriert.`);
      else if (!skipDates.includes(key)) skipDates.push(key);
    }
  }

  return { rule: rule.toString(), start: newStart, end: newEnd, skipDates, warnings };
}

/** Start/Ende des ausgefallenen Termins `dateKey` einer Serie (für die Löschmarker-Zeile). */
export function skippedOccurrence(dateKey: string, start: Date, end: Date): { start: Date; end: Date } {
  const [y, m, d] = dateKey.split("-").map(Number);
  const occStart = new Date(y, m - 1, d, start.getHours(), start.getMinutes(), 0, 0);
  return { start: occStart, end: new Date(occStart.getTime() + (end.getTime() - start.getTime())) };
}

// ───────────────────────────── Namen zuordnen ─────────────────────────────

/** Vergleichsschlüssel: ohne Groß-/Kleinschreibung, Akzente und überzählige Leerzeichen. */
export function nameKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** `null` = bewusst ignorieren, Eintrag fehlt = noch nicht entschieden. */
export type NameMap = Record<string, string | null>;

export interface NameUsage {
  /** Anzeigename, wie er zuerst in der Datei steht. */
  name: string;
  key: string;
  count: number;
}

function collectNames(entries: ImportEntry[], pick: (e: ImportEntry) => (string | null)[]): NameUsage[] {
  const found = new Map<string, NameUsage>();
  for (const entry of entries) {
    if (entry.errors.length > 0) continue;
    for (const name of pick(entry)) {
      if (!name) continue;
      const key = nameKey(name);
      const usage = found.get(key);
      if (usage) usage.count += 1;
      else found.set(key, { name, key, count: 1 });
    }
  }
  return [...found.values()];
}

export const personNamesIn = (entries: ImportEntry[]) =>
  collectNames(entries, (e) => [e.owner, ...e.participants.map((p) => p.name)]);

export const vehicleNamesIn = (entries: ImportEntry[]) => collectNames(entries, (e) => [e.vehicle]);

/** Eindeutiger Namenstreffer (sonst `undefined`). */
function autoMatch<T extends { id: string; name: string }>(items: T[], key: string): string | undefined {
  const hits = items.filter((i) => nameKey(i.name) === key);
  return hits.length === 1 ? hits[0].id : undefined;
}

/** Namen, die sich nicht automatisch zuordnen lassen und eine Entscheidung brauchen. */
export function unmatchedNames<T extends { id: string; name: string }>(
  usages: NameUsage[],
  items: T[]
): NameUsage[] {
  return usages.filter((u) => autoMatch(items, u.key) === undefined);
}

// ───────────────────────────── Speicherfertig machen ─────────────────────────────

export interface ImportContext {
  familyId: string;
  members: FamilyMember[];
  vehicles: Vehicle[];
  /** Bereits gespeicherte Termine, zur Erkennung von Duplikaten. */
  existing: AppointmentWithParticipants[];
  personMap: NameMap;
  vehicleMap: NameMap;
  skipDuplicates: boolean;
}

export type AppointmentPayload = {
  family_id: string;
  title: string;
  notes: string | null;
  owner_id: string | null;
  is_all_family: boolean;
  is_event: boolean;
  is_all_day: boolean;
  start_time: string;
  end_time: string;
  travel_before_min: number;
  travel_after_min: number;
  vehicle_id: string | null;
  recurrence_rule: string | null;
};

export type ImportStatus = "ok" | "duplicate" | "error";

export interface ResolvedEntry {
  entry: ImportEntry;
  status: ImportStatus;
  errors: string[];
  warnings: string[];
  appointment?: AppointmentPayload;
  participants?: { member_id: string; is_supervisor: boolean }[];
  /** Zahl der Terminmarker für ausgefallene Serientermine. */
  skipCount: number;
}

function duplicateKey(title: string, start: Date, end: Date, recurring: boolean): string {
  return [nameKey(title), start.getTime(), end.getTime(), recurring ? "r" : "s"].join("|");
}

export function resolveEntries(entries: ImportEntry[], ctx: ImportContext): ResolvedEntry[] {
  const existingKeys = new Set(
    ctx.existing
      .filter((a) => !a.recurrence_parent_id && !a.is_deleted)
      .map((a) =>
        duplicateKey(a.title, new Date(a.start_time), new Date(a.end_time), !!a.recurrence_rule)
      )
  );
  const seenInFile = new Set<string>();

  const memberById = new Set(ctx.members.map((m) => m.id));
  const vehicleById = new Set(ctx.vehicles.map((v) => v.id));

  /** Ergebnis: Id, `null` (ignoriert) oder `undefined` (offen). */
  const lookup = (
    name: string,
    map: NameMap,
    items: { id: string; name: string }[],
    valid: Set<string>
  ): string | null | undefined => {
    const key = nameKey(name);
    if (key in map) {
      const chosen = map[key];
      return chosen === null || valid.has(chosen) ? chosen : undefined;
    }
    return autoMatch(items, key);
  };

  return entries.map((entry): ResolvedEntry => {
    const errors = [...entry.errors];
    const warnings = [...entry.warnings];
    const result: ResolvedEntry = { entry, status: "ok", errors, warnings, skipCount: 0 };
    if (errors.length > 0) return { ...result, status: "error" };

    // Personen
    let ownerId: string | null = null;
    const participants: { member_id: string; is_supervisor: boolean }[] = [];
    const addParticipant = (id: string, supervisor: boolean) => {
      const known = participants.find((p) => p.member_id === id);
      if (known) known.is_supervisor ||= supervisor;
      else participants.push({ member_id: id, is_supervisor: supervisor });
    };

    if (entry.owner) {
      const id = lookup(entry.owner, ctx.personMap, ctx.members, memberById);
      if (id === undefined) errors.push(`Unbekannte Person "${entry.owner}" — bitte zuordnen oder ignorieren.`);
      else if (id === null) warnings.push(`Besitzer "${entry.owner}" wurde ignoriert.`);
      else ownerId = id;
    }
    for (const p of entry.participants) {
      const id = lookup(p.name, ctx.personMap, ctx.members, memberById);
      if (id === undefined) errors.push(`Unbekannte Person "${p.name}" — bitte zuordnen oder ignorieren.`);
      else if (id === null) warnings.push(`Teilnehmer "${p.name}" wurde ignoriert.`);
      else addParticipant(id, p.supervisor);
    }

    const needsOwner = !entry.event && !entry.everyone;
    if (needsOwner && !ownerId && errors.length === 0) {
      if (participants.length > 0) {
        ownerId = participants[0].member_id;
        warnings.push("Kein Besitzer angegeben — der erste Teilnehmer wurde als Besitzer übernommen.");
      } else {
        errors.push('Keine Person zugeordnet: "owner" angeben (oder "everyone"/"event" verwenden).');
      }
    }
    // Der Besitzer ist nicht zusätzlich Teilnehmer (wie im Formular).
    const finalParticipants = participants.filter((p) => p.member_id !== ownerId);

    // Fahrzeug
    let vehicleId: string | null = null;
    if (entry.vehicle) {
      const id = lookup(entry.vehicle, ctx.vehicleMap, ctx.vehicles, vehicleById);
      if (id === undefined) errors.push(`Unbekanntes Fahrzeug "${entry.vehicle}" — bitte zuordnen oder ignorieren.`);
      else vehicleId = id;
    }

    if (errors.length > 0) return { ...result, status: "error" };

    // Duplikate
    const dupKey = duplicateKey(entry.title, entry.start, entry.end, !!entry.recurrence);
    const inFile = seenInFile.has(dupKey);
    const inApp = existingKeys.has(dupKey);
    seenInFile.add(dupKey);
    if (inFile || inApp) {
      const where = inFile ? "kommt in der Datei mehrfach vor" : "existiert bereits";
      if (ctx.skipDuplicates) {
        return { ...result, status: "duplicate", warnings: [...warnings, `Termin ${where} und wird übersprungen.`] };
      }
      warnings.push(`Termin ${where} und wird trotzdem angelegt.`);
    }

    return {
      ...result,
      warnings,
      skipCount: entry.recurrence?.skipDates.length ?? 0,
      participants: finalParticipants,
      appointment: {
        family_id: ctx.familyId,
        title: entry.title,
        notes: entry.notes,
        owner_id: entry.everyone || entry.event ? null : ownerId,
        is_all_family: entry.everyone,
        is_event: entry.event,
        is_all_day: entry.allDay,
        start_time: entry.start.toISOString(),
        end_time: entry.end.toISOString(),
        travel_before_min: entry.travelBefore,
        travel_after_min: entry.travelAfter,
        vehicle_id: vehicleId,
        recurrence_rule: entry.recurrence?.rule ?? null,
      },
    };
  });
}

/** Bequemer Einstieg: Text → geprüfte Einträge (Fehler pro Eintrag, nicht abbrechend). */
export function normalizeAll(items: unknown[]): ImportEntry[] {
  return items.map((item, i) => normalizeEntry(item, i + 1));
}
