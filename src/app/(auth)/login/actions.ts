"use server";

import { createClient } from "@/lib/supabase/server";

// Gemeinsames Familien-Login: Die E-Mail-Adresse des Familien-Kontos steht nur auf dem Server
// (FAMILY_LOGIN_EMAIL) und wird nie an den Browser ausgeliefert. Eingegeben wird nur das Passwort.
export async function loginWithFamilyPassword(
  password: string
): Promise<{ error: string } | null> {
  const email = process.env.FAMILY_LOGIN_EMAIL;
  if (!email) {
    return { error: "Familien-Login ist auf dem Server nicht konfiguriert." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Passwort ist falsch. Bitte erneut versuchen." };
  }
  return null;
}
