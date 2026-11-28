import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Family, FamilyMember, Meal } from "@/lib/supabase/types";
import { getRecipesAdminClient } from "@/lib/recipes/admin";
import type { Recipe } from "@/lib/recipes/types";
import { parseWeekdayCategories } from "@/lib/meals/weekdayCategories";
import {
  HISTORY_DAYS,
  SuggestRequestSchema,
  buildPlannerPrompt,
  resolveSuggestions,
  type AiSuggestion,
} from "@/lib/meals/mealSuggestions";
import { suggestMealsWithClaude } from "@/lib/meals/suggestMealsAI";
import { APP_TIME_ZONE } from "@/lib/voice/appointmentFromText";

/**
 * POST /api/meals/suggest
 *
 * Body:    { "slots": [{ "date": "2026-12-01", "type": "lunch" | "dinner" }, …] }
 * Antwort: 200 { suggestions: [{ date, type, options: [{ name, category, reason }] }], source, notice? }
 *          source "ai": von Claude; "local": Claude nicht erreichbar, lokal ausgewählt
 *          400 Body ungültig · 401 nicht angemeldet · 403 keine Familie
 *          422 keine Gerichte vorhanden · 500 Laden fehlgeschlagen
 *
 * Es wird nichts gespeichert – der Client zeigt die Vorschläge an und speichert
 * nur, was die Familie annimmt.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function error(status: number, code: string, message: string) {
  return NextResponse.json({ error: code, message }, { status });
}

let anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  anthropic ??= new Anthropic();
  return anthropic;
}

function todayStr(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export async function POST(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return error(400, "invalid_json", "Der Body muss gültiges JSON sein.");
  }
  const body = SuggestRequestSchema.safeParse(json);
  if (!body.success) return error(400, "invalid_body", "Erwartet wird { \"slots\": [{ date, type }] }.");

  const today = todayStr();
  // Doppelte Plätze entfernen; nur heute und später
  const seen = new Set<string>();
  const slots = body.data.slots.filter((s) => {
    const key = `${s.date}-${s.type}`;
    if (s.date < today || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (slots.length === 0) return NextResponse.json({ suggestions: [], source: "local" });

  // Anmeldung und Familie (RLS über die Sitzung des Nutzers)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return error(401, "unauthorized", "Nicht angemeldet.");

  const { data: meRaw } = await supabase.from("family_members").select("*").eq("user_id", user.id).maybeSingle();
  const me = meRaw as FamilyMember | null;
  if (!me) return error(403, "no_family", "Kein Familienkonto gefunden.");

  const since = new Date(`${today}T12:00:00Z`);
  since.setUTCDate(since.getUTCDate() - HISTORY_DAYS);

  let family: Family | null;
  let meals: Meal[];
  let recipes: Recipe[];
  try {
    const [familyRes, mealsRes, recipesRes] = await Promise.all([
      supabase.from("families").select("*").eq("id", me.family_id).maybeSingle(),
      supabase
        .from("meals")
        .select("*")
        .eq("family_id", me.family_id)
        .gte("date", since.toISOString().slice(0, 10)),
      getRecipesAdminClient().from("recipes").select("id,name,category,bemerkung").order("name"),
    ]);
    if (familyRes.error) throw familyRes.error;
    if (mealsRes.error) throw mealsRes.error;
    if (recipesRes.error) throw recipesRes.error;
    family = familyRes.data as Family | null;
    meals = (mealsRes.data ?? []) as Meal[];
    recipes = (recipesRes.data ?? []) as Recipe[];
  } catch (e) {
    console.error("Daten für Essensvorschläge konnten nicht geladen werden.", e);
    return error(500, "load_failed", "Gerichte oder Essensplan konnten nicht geladen werden.");
  }
  if (recipes.length === 0) {
    return error(422, "no_recipes", "Es gibt noch keine Gerichte. Lege zuerst unter „Gerichte“ welche an.");
  }

  const weekdayCategories = parseWeekdayCategories(family?.meal_weekday_categories);

  let ai: AiSuggestion | null = null;
  let notice: string | undefined;
  try {
    ai = await suggestMealsWithClaude(
      getAnthropic(),
      buildPlannerPrompt({ recipes, meals, slots, weekdayCategories, todayStr: today })
    );
  } catch (e) {
    // Ohne Claude trotzdem Vorschläge liefern – zufällig, gewichtet nach „lange nicht gegessen“.
    if (e instanceof Anthropic.APIError) console.error("Anthropic-API-Fehler", e.status, e.message);
    else console.error("Essensvorschläge über Claude fehlgeschlagen", e);
    notice = "Der KI-Assistent ist gerade nicht erreichbar – die Vorschläge sind zufällig ausgewählt.";
  }

  const suggestions = resolveSuggestions({ slots, ai, recipes, meals, weekdayCategories, todayStr: today });
  return NextResponse.json({ suggestions, source: ai ? "ai" : "local", ...(notice ? { notice } : {}) });
}
