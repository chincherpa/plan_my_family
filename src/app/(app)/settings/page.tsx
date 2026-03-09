import Link from "next/link";
import { Users, Car, ArrowRight } from "lucide-react";
import CalendarDisplaySettings from "@/components/settings/CalendarDisplaySettings";

export default function SettingsPage() {
  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Einstellungen</h1>

      <Link
        href="/settings/members"
        className="flex items-center justify-between p-4 rounded-lg border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--accent)] transition-colors"
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

      <CalendarDisplaySettings />

      <Link
        href="/settings/vehicles"
        className="flex items-center justify-between p-4 rounded-lg border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--accent)] transition-colors"
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
    </div>
  );
}
