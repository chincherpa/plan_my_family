import {
  ANNIVERSARY_KINDS,
  anniversaryBadge,
  daysBetween,
  toAnniversary,
} from "@/lib/anniversaries";
import type {
  AnniversaryKind,
  AppointmentWithParticipants,
  FamilyMember,
  SchoolHoliday,
} from "@/lib/supabase/types";
import { startOfDay } from "@/lib/utils";
import { expandAppointments } from "@/lib/utils/recurrence";
import type { QueryCategory, VoiceQuery } from "./appointmentFromText";

/**
 * Beantwortet eine Frage an den Kalender („Wann ist der nächste Geburtstag?“)
 * aus den bereits geladenen Terminen. Claude versteht nur die Frage
 * (`VoiceQuery`); die Antwort kommt hier aus den echten Daten — mit
 * aufgelösten Serien, Ausnahmen und Schulferien wie im Kalender.
 */

export interface QueryHit {
  key: string;
  appointmentId: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  /** Emoji des Jahrestags (🎂 …), sonst null. */
  emoji: string | null;
  anniversaryKind: AnniversaryKind | null;
  /** Jubiläumszahl („wird 40“), null wenn unbekannt oder kein Jahrestag. */
  count: number | null;
  /** Besitzer und Teilnehmer. */
  people: string[];
  allFamily: boolean;
  notes: string | null;
  /** Tage ab heute (0 = heute). */
  daysUntil: number;
}

export interface QueryData {
  appointments: AppointmentWithParticipants[];
  members: Pick<FamilyMember, "id" | "name">[];
  schoolHolidays: SchoolHoliday[];
}

/** Ohne Enddatum wird so weit voraus gesucht (deckt jährliche Serien ab). */
const DEFAULT_HORIZON_DAYS = 400;
/** Obergrenze für ausdrücklich genannte Zeiträume. */
const MAX_RANGE_DAYS = 800;

function parseLocalDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function categoryOf(appt: AppointmentWithParticipants): Exclude<QueryCategory, "any"> {
  const anniversary = toAnniversary(appt);
  if (anniversary) return anniversary.kind === "birthday" ? "birthday" : "anniversary";
  return appt.is_event ? "event" : "appointment";
}

const includesText = (haystack: string | null, needle: string) =>
  !!haystack && haystack.toLocaleLowerCase("de").includes(needle.toLocaleLowerCase("de"));

function matchesPerson(
  appt: AppointmentWithParticipants,
  category: Exclude<QueryCategory, "any">,
  query: Pick<VoiceQuery, "person" | "person_id">
): boolean {
  if (!query.person_id) return true;
  if (appt.owner_id === query.person_id) return true;
  if (appt.participants.some((p) => p.member_id === query.person_id)) return true;
  // Jahrestage tragen den Namen im Titel („Oma Erika“), nicht als Besitzer.
  if (query.person && includesText(appt.title, query.person)) return true;
  // Familientermine betreffen jeden — Jahrestage nicht, die gelten nur der genannten Person.
  return appt.is_all_family && category !== "birthday" && category !== "anniversary";
}

/** Findet die kommenden Einträge zur Frage, nach Beginn sortiert, höchstens `query.limit`. */
export function runVoiceQuery(query: VoiceQuery, data: QueryData, now = new Date()): QueryHit[] {
  const rangeStart = query.from_date ? parseLocalDate(query.from_date) : now;
  const searchStart = startOfDay(rangeStart);
  const rangeEnd = query.to_date
    ? new Date(Math.min(endOfDay(parseLocalDate(query.to_date)).getTime(), addDays(searchStart, MAX_RANGE_DAYS).getTime()))
    : addDays(searchStart, DEFAULT_HORIZON_DAYS);

  const names = new Map(data.members.map((m) => [m.id, m.name]));

  const hits: QueryHit[] = [];
  for (const occ of expandAppointments(data.appointments, searchStart, rangeEnd, data.schoolHolidays)) {
    const appt = occ.appointment;
    if (appt.is_deleted) continue;

    // Ganztägige Einträge gelten den ganzen Tag, auch wenn „jetzt“ schon später ist.
    const notOver = appt.is_all_day ? occ.occurrenceEnd > rangeStart : occ.occurrenceStart >= rangeStart;
    if (!notOver || occ.occurrenceStart > rangeEnd) continue;

    const category = categoryOf(appt);
    if (query.category !== "any" && query.category !== category) continue;
    if (!matchesPerson(appt, category, query)) continue;
    if (query.search && !includesText(appt.title, query.search) && !includesText(appt.notes, query.search)) continue;

    const anniversary = toAnniversary(appt);
    const people = [appt.owner_id, ...appt.participants.map((p) => p.member_id)]
      .map((id) => (id ? names.get(id) : undefined))
      .filter((name, i, all): name is string => !!name && all.indexOf(name) === i);

    hits.push({
      key: occ.key,
      appointmentId: appt.id,
      title: appt.title,
      start: occ.occurrenceStart,
      end: occ.occurrenceEnd,
      allDay: appt.is_all_day,
      emoji: anniversary ? ANNIVERSARY_KINDS[anniversary.kind].emoji : null,
      anniversaryKind: anniversary?.kind ?? null,
      count: anniversaryBadge(appt, occ.occurrenceStart)?.count ?? null,
      people,
      allFamily: appt.is_all_family,
      notes: appt.notes,
      daysUntil: daysBetween(now, occ.occurrenceStart),
    });
  }

  hits.sort((a, b) => a.start.getTime() - b.start.getTime() || a.title.localeCompare(b.title, "de"));

  // Ein Jahrestag zählt nur mit seinem nächsten Vorkommen, nicht auch noch im Jahr darauf.
  const seenAnniversaries = new Set<string>();
  const unique = hits.filter((hit) => {
    if (!hit.anniversaryKind) return true;
    if (seenAnniversaries.has(hit.appointmentId)) return false;
    seenAnniversaries.add(hit.appointmentId);
    return true;
  });
  return unique.slice(0, query.limit);
}

// ── Anzeige ─────────────────────────────────────────────────────────────────

const NOUNS: Record<QueryCategory, { singular: string; plural: string; neuter?: boolean }> = {
  any: { singular: "Termin", plural: "Termine" },
  appointment: { singular: "Termin", plural: "Termine" },
  event: { singular: "Ereignis", plural: "Ereignisse", neuter: true },
  birthday: { singular: "Geburtstag", plural: "Geburtstage" },
  anniversary: { singular: "Jahrestag", plural: "Jahrestage" },
};

function formatKey(key: string): string {
  return parseLocalDate(key).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "long" });
}

function rangeLabel(query: VoiceQuery): string {
  const { from_date: from, to_date: to } = query;
  if (from && to) return from === to ? `am ${formatKey(from)}` : `vom ${formatKey(from)} bis ${formatKey(to)}`;
  return from ? `ab ${formatKey(from)}` : `bis ${formatKey(to!)}`;
}

/** Überschrift zur Frage: „Nächster Geburtstag“, „Termine für Jack, am Fr., 14. November“. */
export function describeQuery(query: VoiceQuery): string {
  const noun = NOUNS[query.category];
  const hasRange = !!(query.from_date || query.to_date);
  let text =
    query.limit === 1
      ? `${noun.neuter ? "Nächstes" : "Nächster"} ${noun.singular}`
      : hasRange
        ? noun.plural
        : `Nächste ${noun.plural}`;
  if (query.person) text += ` für ${query.person}`;
  if (query.search) text += ` zu „${query.search}“`;
  if (hasRange) text += `, ${rangeLabel(query)}`;
  return text;
}
