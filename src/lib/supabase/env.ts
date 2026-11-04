// Liefert URL und API-Key für die Supabase-Clients.
// Neu: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (sb_publishable_…).
// Übergang: Fällt auf NEXT_PUBLIC_SUPABASE_ANON_KEY zurück, bis der alte Key abgeschaltet ist.
// Hinweis: Next.js ersetzt NEXT_PUBLIC_*-Variablen nur bei vollständigen process.env.X-Ausdrücken,
// deshalb stehen die Namen hier ausgeschrieben.
export function getSupabaseConfig(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase nicht konfiguriert: NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY setzen."
    );
  }
  return { url, key };
}
