"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Calendar, Settings, LogOut, UtensilsCrossed } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useDataStore } from "@/lib/store/dataStore";
import { useCalendarStore } from "@/lib/store/calendarStore";
import { Button } from "@/components/ui/button";
<<<<<<< HEAD
import type { AppointmentWithParticipants, FamilyMember, Family, Vehicle, Recipe, MealPlanWithRecipe } from "@/lib/supabase/types";
=======
import type { AppointmentWithParticipants, FamilyMember, Family, Vehicle, Meal } from "@/lib/supabase/types";
>>>>>>> 485593881e3feccb28c04fb2507d4aedbb639398

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
<<<<<<< HEAD
  const { setFamily, setMembers, setVehicles, setAppointments, setRecipes, setMealPlans, setLoading } = useDataStore();
=======
  const { setFamily, setMembers, setVehicles, setAppointments, setMeals, setLoading } = useDataStore();
>>>>>>> 485593881e3feccb28c04fb2507d4aedbb639398
  const { setTimeRange } = useCalendarStore();

  useEffect(() => {
    const supabase = createClient();

    // showSpinner only on initial load — realtime refetches must not unmount
    // the calendar (spinner remount resets scroll position to today)
    async function loadData(showSpinner = false) {
      if (showSpinner) setLoading(true);
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

<<<<<<< HEAD
        const [familyRes, membersRes, vehiclesRes, apptRes, recipesRes, mealPlansRes] = await Promise.all([
=======
        const [familyRes, membersRes, vehiclesRes, apptRes, mealsRes] = await Promise.all([
>>>>>>> 485593881e3feccb28c04fb2507d4aedbb639398
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
<<<<<<< HEAD
          supabase.from("recipes").select("*"),
          supabase
            .from("meal_plans")
            .select("*, recipe:recipes(id, name, category)")
            .eq("family_id", familyId),
=======
          supabase.from("meals").select("*").eq("family_id", familyId),
>>>>>>> 485593881e3feccb28c04fb2507d4aedbb639398
        ]);

        if (familyRes.data) {
          const family = familyRes.data as Family;
          setFamily(family);
          setTimeRange(family.calendar_start_hour, family.calendar_end_hour);
        }
        if (membersRes.data) setMembers(membersRes.data as FamilyMember[]);
        if (vehiclesRes.data) setVehicles(vehiclesRes.data as Vehicle[]);
<<<<<<< HEAD
        if (apptRes.data) setAppointments(apptRes.data as AppointmentWithParticipants[]);
        if (recipesRes.data) setRecipes(recipesRes.data as Recipe[]);
        if (mealPlansRes.data) setMealPlans(mealPlansRes.data as MealPlanWithRecipe[]);
=======
        if (apptRes.data) {
          setAppointments(apptRes.data as AppointmentWithParticipants[]);
        }
        if (mealsRes.data) setMeals(mealsRes.data as Meal[]);
>>>>>>> 485593881e3feccb28c04fb2507d4aedbb639398
      } finally {
        if (showSpinner) setLoading(false);
      }
    }

    loadData(true);

    // Realtime subscriptions
    const channel = supabase
      .channel("family-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () =>
        loadData()
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "family_members" }, () =>
        loadData()
      )
<<<<<<< HEAD
      .on("postgres_changes", { event: "*", schema: "public", table: "meal_plans" }, () =>
=======
      .on("postgres_changes", { event: "*", schema: "public", table: "meals" }, () =>
>>>>>>> 485593881e3feccb28c04fb2507d4aedbb639398
        loadData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [setFamily, setMembers, setVehicles, setAppointments, setRecipes, setMealPlans, setLoading, setTimeRange]);

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
          <Link href="/meals">
            <Button
              variant={pathname.startsWith("/meals") ? "secondary" : "ghost"}
              size="sm"
              className="gap-1.5"
            >
              <UtensilsCrossed className="w-4 h-4" />
              Mahlzeiten
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
