"use server";

import { createClient } from "@/lib/supabase/server";
import { getRecipesAdminClient } from "./admin";
import { validateRecipeInput } from "./logic";
import type { ActionResult, Recipe, RecipeCategory, RecipeInput } from "./types";

// Server Actions für die geteilte Rezept-DB. Jede Action prüft zuerst die Familienplaner-Session,
// weil der Admin-Client RLS umgeht und Server Actions per POST von außen aufrufbar sind.

const NOT_SIGNED_IN = "Nicht angemeldet.";
const RECIPE_COLUMNS = "id,name,category,bemerkung";

// Angemeldet reicht nicht: Ein beliebiges Supabase-Konto (z.B. über offene Registrierung) darf
// die Rezept-DB nicht über den Service-Role-Key erreichen. Nur Familienmitglieder.
async function requireFamilyUser(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return false;
    const member = await supabase
      .from("family_members")
      .select("id")
      .eq("user_id", data.user.id)
      .limit(1)
      .maybeSingle();
    return !member.error && !!member.data;
  } catch {
    return false;
  }
}

async function fetchAllRecipes(): Promise<Recipe[]> {
  const { data, error } = await getRecipesAdminClient()
    .from("recipes")
    .select(RECIPE_COLUMNS)
    .order("name");
  if (error) throw error;
  return (data ?? []) as Recipe[];
}

export async function listRecipes(): Promise<
  ActionResult<{ recipes: Recipe[]; categories: RecipeCategory[] }>
> {
  if (!(await requireFamilyUser())) return { error: NOT_SIGNED_IN };
  try {
    const [recipes, categoriesRes] = await Promise.all([
      fetchAllRecipes(),
      getRecipesAdminClient().from("categories").select("*").order("name"),
    ]);
    if (categoriesRes.error) throw categoriesRes.error;
    return {
      data: { recipes, categories: (categoriesRes.data ?? []) as RecipeCategory[] },
    };
  } catch (error) {
    console.error("listRecipes failed", error);
    return { error: "Mahlzeiten konnten nicht geladen werden." };
  }
}

async function saveRecipe(id: number | null, input: RecipeInput): Promise<ActionResult<Recipe>> {
  if (!(await requireFamilyUser())) return { error: NOT_SIGNED_IN };
  try {
    const existing = await fetchAllRecipes();
    const checked = validateRecipeInput(input, existing, id ?? undefined);
    if (!checked.ok) return { error: checked.error };

    const table = getRecipesAdminClient().from("recipes");
    const { data, error } =
      id === null
        ? await table.insert(checked.value).select(RECIPE_COLUMNS).single()
        : await table.update(checked.value).eq("id", id).select(RECIPE_COLUMNS).single();
    if (error || !data) throw error ?? new Error("Keine Zeile zurückgegeben.");
    return { data: data as Recipe };
  } catch (error) {
    console.error("saveRecipe failed", error);
    return { error: "Mahlzeit konnte nicht gespeichert werden." };
  }
}

export async function createRecipe(input: RecipeInput): Promise<ActionResult<Recipe>> {
  return saveRecipe(null, input);
}

export async function updateRecipe(id: number, input: RecipeInput): Promise<ActionResult<Recipe>> {
  return saveRecipe(id, input);
}

export async function deleteRecipe(id: number): Promise<ActionResult<null>> {
  if (!(await requireFamilyUser())) return { error: NOT_SIGNED_IN };
  try {
    // Ein einziger Löschvorgang: ingredients.recipe_id ist ON DELETE CASCADE, die Zutaten
    // verschwinden atomar mit. Kein Teil-Löschen, falls ein zweiter Aufruf scheitern würde.
    const recipeRes = await getRecipesAdminClient().from("recipes").delete().eq("id", id);
    if (recipeRes.error) throw recipeRes.error;
    return { data: null };
  } catch (error) {
    console.error("deleteRecipe failed", error);
    return { error: "Mahlzeit konnte nicht gelöscht werden." };
  }
}
