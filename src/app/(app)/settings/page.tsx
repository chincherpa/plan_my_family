import Link from "next/link";
import { Users, Car, UtensilsCrossed, FileUp, ArrowRight } from "lucide-react";
import CalendarDisplaySettings from "@/components/settings/CalendarDisplaySettings";
import ThemeSettings from "@/components/settings/ThemeSettings";

export default function SettingsPage() {
  return (
    <div className="h-full overflow-y-auto">
    <div className="max-w-2xl mx-auto px-3 py-5 sm:p-6 space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">Einstellungen</h1>

      <Link
        href="/settings/members"
        className="flex items-center justify-between p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--accent)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[var(--primary)]/10 flex items-center justify-center">
            <Users className="w-5 h-5 text-[var(--primary)]" />
          </div>
          <div>
            <p className="font-medium">Familienmitglieder</p>
            <p className="text-sm text-[var(--muted-foreground)]">Namen, Farben, Aufsicht</p>
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-[var(--muted-foreground)]" />
      </Link>

      <ThemeSettings />

      <CalendarDisplaySettings />

      <Link
        href="/settings/vehicles"
        className="flex items-center justify-between p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--accent)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[var(--primary)]/10 flex items-center justify-center">
            <Car className="w-5 h-5 text-[var(--primary)]" />
          </div>
          <div>
            <p className="font-medium">Fahrzeuge</p>
            <p className="text-sm text-[var(--muted-foreground)]">Autos und andere Fahrzeuge</p>
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-[var(--muted-foreground)]" />
      </Link>

      <Link
        href="/meals?view=gerichte"
        className="flex items-center justify-between p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--accent)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[var(--primary)]/10 flex items-center justify-center">
            <UtensilsCrossed className="w-5 h-5 text-[var(--primary)]" />
          </div>
          <div>
            <p className="font-medium">Mahlzeiten</p>
            <p className="text-sm text-[var(--muted-foreground)]">Gerichte-Katalog für den Essensplan</p>
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-[var(--muted-foreground)]" />
      </Link>

      <Link
        href="/settings/import"
        className="flex items-center justify-between p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--accent)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[var(--primary)]/10 flex items-center justify-center">
            <FileUp className="w-5 h-5 text-[var(--primary)]" />
          </div>
          <div>
            <p className="font-medium">Termine importieren</p>
            <p className="text-sm text-[var(--muted-foreground)]">Aus JSON- oder Textdatei, inkl. Serientermine</p>
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-[var(--muted-foreground)]" />
      </Link>

    </div>
    </div>
  );
}
