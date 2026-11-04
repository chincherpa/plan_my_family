import { Calendar } from "lucide-react";

/**
 * Self-service registration is closed (see supabase/migrations/
 * 013_close_family_registration.sql): the database no longer lets clients
 * create families. New members join via an invite link (/join). The former
 * form is in git history if a second family ever needs to be set up.
 */
export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-4">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 sm:p-8 shadow-2xl text-center">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)]">
            <Calendar className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold">Registrierung geschlossen</h1>
        </div>
        <p className="text-sm text-[var(--muted-foreground)]">
          Neue Familien können nicht mehr selbst angelegt werden. Wenn du zu einer Familie
          gehörst, lass dir in der App unter Einstellungen → Familienmitglieder einen
          Einladungslink erstellen.
        </p>
        <a href="/login" className="inline-block text-sm text-[var(--primary)] hover:underline">
          Zur Anmeldung
        </a>
      </div>
    </div>
  );
}
