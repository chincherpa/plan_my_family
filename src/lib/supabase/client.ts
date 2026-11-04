import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";
import { getSupabaseConfig } from "./env";

export function createClient() {
  const { url, key } = getSupabaseConfig();
  return createBrowserClient<Database>(url, key);
}
