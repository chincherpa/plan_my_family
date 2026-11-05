import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Zugriff auf die Datenbank der Rezepte-App (eigenes Supabase-Projekt).
// Nutzt den Service-Role-Key und umgeht damit RLS — darf deshalb nur auf dem Server laufen.
// Die Namen beginnen mit RECIPES_, nicht mit NEXT_PUBLIC_, und werden daher nicht in den
// Browser-Build eingebettet.
export function getRecipesAdminClient(): SupabaseClient {
  const url = process.env.RECIPES_NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.RECIPES_NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.RECIPES_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Rezept-DB nicht konfiguriert: RECIPES_NEXT_PUBLIC_SUPABASE_URL und RECIPES_NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY setzen."
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
