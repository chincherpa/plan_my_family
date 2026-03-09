"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Calendar, Settings, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useDataStore } from "@/lib/store/dataStore";
import { useCalendarStore } from "@/lib/store/calendarStore";
import { Button } from "@/components/ui/button";
import type { AppointmentWithParticipants, FamilyMember, Family, Vehicle } from "@/lib/supabase/types";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { setFamily, setMembers, setVehicles, setAppointments, setLoading } = useDataStore();
  const { setTimeRange } = useCalendarStore();

  useEffect(() => {
    const supabase = createClient();

    async function loadData() {
      setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        // Get family via member
        const { data: memberDataRaw } = await supabase
          .from("family_members")
          .select("*")
          .eq("user_id", user.id)
          .single();

        const memberData = memberDataRaw as FamilyMember | null;
        if (!memberData) return;

        const familyId = memberData.family_id;

        const [familyRes, membersRes, vehiclesRes, apptRes] = await Promise.all([
          supabase.from("families").select("*").eq("id", familyId).single(),
          supabase
            .from("family_members")
            .select("*")
            .eq("family_id", familyId)
            .order("sort_order"),
          supabase.from("vehicles").select("*").eq("family_id", familyId),
          supabase
            .from("appointments")
            .select("*, participants:appointment_participants(*)")
            .eq("family_id", familyId),
        ]);

        if (familyRes.data) {
          const family = familyRes.data as Family;
          setFamily(family);
          setTimeRange(family.calendar_start_hour, family.calendar_end_hour);
        }
        if (membersRes.data) setMembers(membersRes.data as FamilyMember[]);
        if (vehiclesRes.data) setVehicles(vehiclesRes.data as Vehicle[]);
        if (apptRes.data) {
          setAppointments(apptRes.data as AppointmentWithParticipants[]);
        }
      } finally {
        setLoading(false);
      }
    }

    loadData();

    // Realtime subscriptions
    const channel = supabase
      .channel("family-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () =>
        loadData()
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "family_members" }, () =>
        loadData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [setFamily, setMembers, setVehicles, setAppointments, setLoading]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Top Nav */}
      <header className="flex h-12 items-center justify-between border-b border-[var(--border)] bg-[var(--muted)] px-4 shrink-0">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-[var(--primary)]" />
          <span className="font-semibold text-sm">Familienplaner</span>
        </div>

        <nav className="flex items-center gap-1">
          <Link href="/calendar">
            <Button
              variant={pathname.startsWith("/calendar") ? "secondary" : "ghost"}
              size="sm"
              className="gap-1.5"
            >
              <Calendar className="w-4 h-4" />
              Kalender
            </Button>
          </Link>
          <Link href="/settings">
            <Button
              variant={pathname.startsWith("/settings") ? "secondary" : "ghost"}
              size="sm"
              className="gap-1.5"
            >
              <Settings className="w-4 h-4" />
              Einstellungen
            </Button>
          </Link>
          <Button variant="ghost" size="icon" onClick={handleLogout} title="Abmelden">
            <LogOut className="w-4 h-4" />
          </Button>
        </nav>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
