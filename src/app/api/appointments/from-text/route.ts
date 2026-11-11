import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { AppointmentWithParticipants, FamilyMember } from "@/lib/supabase/types";
import { RequestBodySchema, checkExtraction } from "@/lib/voice/appointmentFromText";
import { ExtractionFailedError, extractAppointment } from "@/lib/voice/extractAppointment";

/**
 * POST /api/appointments/from-text
 *
 * Body:    { "text": "Morgen um 15 Uhr Zahnarzt mit Ben" }
 * Antwort: 201 { appointment, extracted, warnings }
 *          400 Body ungültig · 401 nicht angemeldet · 422 Angaben fehlen
 *          502 Claude nicht erreichbar · 500 Speichern fehlgeschlagen
 *
 * Gespeichert wird mit der Sitzung des angemeldeten Nutzers (Publishable Key +
 * Cookies), nicht mit einem Service-Key: Die Row Level Security entscheidet,
 * in welche Familie geschrieben werden darf.
 */

// Das SDK braucht Node (nicht Edge); Antworten nie cachen.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function error(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: code, message, ...extra }, { status });
}

let anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  // Liest ANTHROPIC_API_KEY aus der Umgebung (nur Server).
  anthropic ??= new Anthropic();
  return anthropic;
}

export async function POST(request: NextRequest) {
  // 1. Body prüfen
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return error(400, "invalid_json", "Der Body muss gültiges JSON sein.");
  }
  const body = RequestBodySchema.safeParse(json);
  if (!body.success) {
    return error(400, "invalid_body", "Erwartet wird { \"text\": string }.", {
      issues: body.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }

  // 2. Anmeldung und Familie
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return error(401, "unauthorized", "Nicht angemeldet.");

  const { data: meRaw } = await supabase
    .from("family_members")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  const me = meRaw as FamilyMember | null;
  if (!me) return error(403, "no_family", "Kein Familienkonto gefunden.");

  const { data: membersRaw } = await supabase
    .from("family_members")
    .select("*")
    .eq("family_id", me.family_id)
    .order("sort_order");
  const members = (membersRaw ?? []) as FamilyMember[];

  // 3. Claude extrahiert die Termindaten
  let extracted;
  try {
    extracted = await extractAppointment(
      getAnthropic(),
      body.data.text,
      members.map((m) => m.name)
    );
  } catch (e) {
    if (e instanceof ExtractionFailedError) {
      return error(502, "extraction_failed", e.message);
    }
    if (e instanceof Anthropic.RateLimitError) {
      return error(503, "ai_rate_limited", "Die Texterkennung ist gerade ausgelastet. Bitte gleich nochmal versuchen.");
    }
    if (e instanceof Anthropic.APIError) {
      console.error("Anthropic-API-Fehler", e.status, e.message);
      return error(502, "ai_unavailable", "Die Texterkennung ist nicht erreichbar.");
    }
    throw e;
  }

  // 4. Pflichtfelder und Formate prüfen
  const checked = checkExtraction(extracted);
  if (!checked.ok) {
    return error(422, "incomplete_appointment", "Aus dem Text ließ sich kein vollständiger Termin ablesen.", {
      missing: checked.missing,
      invalid: checked.invalid,
      extracted,
    });
  }
  const appt = checked.appointment;

  // 5. Person zuordnen — ohne Person landet der Termin in der Spalte „Alle“
  const warnings: string[] = [];
  const owner = appt.person
    ? members.find((m) => m.name.localeCompare(appt.person!, "de", { sensitivity: "base" }) === 0)
    : undefined;
  if (appt.person && !owner) {
    warnings.push(`"${appt.person}" ist kein Familienmitglied; der Termin wurde für alle angelegt.`);
  }

  // 6. Speichern über dieselbe RPC wie Formular und Import
  const { data: saved, error: saveError } = await supabase.rpc("save_appointment_with_participants", {
    appointment_data: {
      family_id: me.family_id,
      title: appt.title,
      notes: appt.notes,
      owner_id: owner?.id ?? null,
      is_all_family: !owner,
      is_event: false,
      is_all_day: appt.allDay,
      start_time: appt.start.toISOString(),
      end_time: appt.end.toISOString(),
      travel_before_min: 0,
      travel_after_min: 0,
      vehicle_id: null,
      recurrence_rule: null,
    },
    participant_data: [],
  });
  if (saveError || !saved) {
    console.error("Termin konnte nicht gespeichert werden.", saveError);
    return error(500, "save_failed", "Termin konnte nicht gespeichert werden.");
  }

  return NextResponse.json(
    {
      appointment: saved as unknown as AppointmentWithParticipants,
      extracted: {
        title: appt.title,
        date: appt.date,
        start_time: appt.startTime,
        end_time: appt.endTime,
        all_day: appt.allDay,
        person: owner?.name ?? null,
        notes: appt.notes,
      },
      warnings,
    },
    { status: 201 }
  );
}
