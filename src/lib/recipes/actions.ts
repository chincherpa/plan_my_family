"use server";

import { createClient } from "@/lib/supabase/server";
import { getRecipesAdminClient } from "./admin";
import { validateIngredients, validateRecipeInput } from "./logic";
import type {
  ActionResult,
  Ingredient,
  IngredientInput,
  Recipe,
  RecipeCategory,
  RecipeInput,
} from "./types";

// Server Actions für die geteilte Rezept-DB. Jede Action prüft zuerst die Familienplaner-Session,
// weil der Admin-Client RLS umgeht und Server Actions per POST von außen aufrufbar sind.

const NOT_SIGNED_IN = "Nicht angemeldet.";
const RECIPE_COLUMNS = "id,name,category,bemerkung";
const INGREDIENT_COLUMNS = "id,recipe_id,zutat,menge,taetigkeit,sort_order";

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

async function fetchIngredients(recipeId: number): Promise<Ingredient[]> {
  const { data, error } = await getRecipesAdminClient()
    .from("ingredients")
    .select(INGREDIENT_COLUMNS)
    .eq("recipe_id", recipeId)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as Ingredient[];
}

export async function listIngredients(recipeId: number): Promise<ActionResult<Ingredient[]>> {
  if (!(await requireFamilyUser())) return { error: NOT_SIGNED_IN };
  try {
    return { data: await fetchIngredients(recipeId) };
  } catch (error) {
    console.error("listIngredients failed", error);
    return { error: "Zutaten konnten nicht geladen werden." };
  }
}

/**
 * Ersetzt die Zutatenliste eines Rezepts: entfernte Zeilen löschen, vorhandene aktualisieren,
 * neue anlegen. Jede Änderung ist auf recipe_id eingeschränkt, damit eine manipulierte id
 * keine Zutat eines anderen Rezepts trifft.
 */
export async function saveIngredients(
  recipeId: number,
  rows: IngredientInput[]
): Promise<ActionResult<Ingredient[]>> {
  if (!(await requireFamilyUser())) return { error: NOT_SIGNED_IN };
  const checked = validateIngredients(rows);
  if (!checked.ok) return { error: checked.error };
  try {
    const db = getRecipesAdminClient();
    const current = await fetchIngredients(recipeId);
    const currentIds = new Set(current.map((i) => i.id));
    const keptIds = new Set(
      checked.value.flatMap((r) => (r.id !== undefined && currentIds.has(r.id) ? [r.id] : []))
    );

    const removed = current.filter((i) => !keptIds.has(i.id)).map((i) => i.id);
    if (removed.length > 0) {
      const res = await db.from("ingredients").delete().eq("recipe_id", recipeId).in("id", removed);
      if (res.error) throw res.error;
    }

    for (const row of checked.value) {
      const fields = {
        zutat: row.zutat,
        menge: row.menge,
        taetigkeit: row.taetigkeit,
        sort_order: row.sort_order,
      };
      const res =
        row.id !== undefined && keptIds.has(row.id)
          ? await db.from("ingredients").update(fields).eq("recipe_id", recipeId).eq("id", row.id)
          : await db.from("ingredients").insert({ ...fields, recipe_id: recipeId });
      if (res.error) throw res.error;
    }

    return { data: await fetchIngredients(recipeId) };
  } catch (error) {
    console.error("saveIngredients failed", error);
    return { error: "Zutaten konnten nicht gespeichert werden." };
  }
}
