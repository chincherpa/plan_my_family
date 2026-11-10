"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Calendar, Settings, LogOut, UtensilsCrossed, ListTodo, Cake } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useDataStore } from "@/lib/store/dataStore";
import { useCalendarStore } from "@/lib/store/calendarStore";
import { useTodoStore } from "@/lib/store/todoStore";
import { cn } from "@/lib/utils";
import ThemeToggle, { toggleTheme } from "@/components/ThemeToggle";
import TodoSheet from "@/components/todos/TodoSheet";
import ShortcutHelpDialog from "@/components/shortcuts/ShortcutHelpDialog";
import { useKeymap, useShortcut, useShortcutListener } from "@/lib/shortcuts/useShortcuts";
import { withShortcutHint, type ShortcutActionId } from "@/lib/shortcuts/keymap";
import { useShortcutStore } from "@/lib/store/shortcutStore";
import { listRecipes } from "@/lib/recipes/actions";
import type {
  AppointmentWithParticipants,
  FamilyMember,
  Family,
  Vehicle,
  SchoolHoliday,
  Meal,
  TodoWithItems,
} from "@/lib/supabase/types";

const REFETCH_DEBOUNCE_MS = 250;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    setFamily,
    setMembers,
    setVehicles,
    setSchoolHolidays,
    setAppointments,
    setMeals,
    setRecipes,
    setRecipesError,
    setTodos,
    setLoading,
  } = useDataStore();
  const { setTimeRange, openForm } = useCalendarStore();
  const todos = useDataStore((s) => s.todos);
  const { isSidebarOpen: isTodosOpen, toggleSidebar: toggleTodos } = useTodoStore();
  const openTodoCount = todos.filter((t) => !t.is_done).length;
  const loadVersion = useRef(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;
    let currentFamilyId: string | null = null;
    let refetchTimer: ReturnType<typeof setTimeout> | undefined;

    // showSpinner only on initial load — realtime refetches must not unmount
    // the calendar (spinner remount resets scroll position to today)
    async function loadData(showSpinner = false) {
      const requestVersion = ++loadVersion.current;
      if (showSpinner) setLoading(true);
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();
        if (!user || authError) throw authError ?? new Error("Nicht angemeldet.");

        // Get family via member
        const { data: memberDataRaw, error: memberError } = await supabase
          .from("family_members")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        const memberData = memberDataRaw as FamilyMember | null;
        if (!memberData || memberError) {
          throw memberError ?? new Error("Kein Familienkonto gefunden.");
        }

        const familyId = memberData.family_id;

        const [
          familyRes,
          membersRes,
          vehiclesRes,
          apptRes,
          mealsRes,
          todosRes,
          holidaysRes,
        ] = await Promise.all([
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
          supabase.from("meals").select("*").eq("family_id", familyId),
          supabase
            .from("todos")
            .select("*, items:todo_items(*)")
            .eq("family_id", familyId)
            .order("created_at"),
          supabase.from("school_holidays").select("*").eq("family_id", familyId),
        ]);

        if (!isMounted || requestVersion !== loadVersion.current) return;
        const responseError = [
          familyRes,
          membersRes,
          vehiclesRes,
          apptRes,
          mealsRes,
          todosRes,
          holidaysRes,
        ]
          .map((result) => result.error)
          .find(Boolean);
        if (responseError) throw responseError;

        const family = familyRes.data as Family | null;
        if (!family) throw new Error("Familie konnte nicht geladen werden.");

        currentFamilyId = familyId;
        setFamily(family);
        setTimeRange(family.calendar_start_hour, family.calendar_end_hour);
        setMembers((membersRes.data ?? []) as FamilyMember[]);
        setVehicles((vehiclesRes.data ?? []) as Vehicle[]);
        setAppointments((apptRes.data ?? []) as AppointmentWithParticipants[]);
        setMeals((mealsRes.data ?? []) as Meal[]);
        setTodos((todosRes.data ?? []) as TodoWithItems[]);
        setSchoolHolidays((holidaysRes.data ?? []) as SchoolHoliday[]);
        setLoadError(null);
      } catch (error) {
        console.error("loadData failed", error);
        if (isMounted && requestVersion === loadVersion.current) {
          setLoadError("Daten konnten nicht geladen werden. Bitte lade die Seite erneut.");
        }
      } finally {
        if (showSpinner && isMounted && requestVersion === loadVersion.current) setLoading(false);
      }
    }

    loadData(true);

    // Realtime subscriptions
    const channel = supabase
      .channel("family-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, handleChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "family_members" }, handleChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "vehicles" }, handleChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "meals" }, handleChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "todos" }, handleChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "todo_items" }, handleChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "school_holidays" }, handleChange)
      .subscribe();

    function handleChange(payload: { new: Record<string, unknown>; old: Record<string, unknown> }) {
      const record = Object.keys(payload.new).length > 0 ? payload.new : payload.old;
      // A DELETE payload carries only the replica identity. Migration 009 sets
      // REPLICA IDENTITY FULL so family_id is there, but a project whose
      // migrations lag would otherwise lose every deletion — when the column is
      // missing, refetch instead of dropping the event.
      const familyId = record?.family_id;
      if (familyId === undefined || familyId === currentFamilyId) {
        // Bursts (z. B. ein Termin-Import mit hunderten Zeilen) lösen ein Event
        // pro Zeile aus — zu einem einzigen Nachladen zusammenfassen.
        clearTimeout(refetchTimer);
        refetchTimer = setTimeout(() => loadData(), REFETCH_DEBOUNCE_MS);
      }
    }

    return () => {
      isMounted = false;
      clearTimeout(refetchTimer);
      supabase.removeChannel(channel);
    };
  }, [
    setFamily,
    setMembers,
    setVehicles,
    setSchoolHolidays,
    setAppointments,
    setMeals,
    setTodos,
    setLoading,
    setTimeRange,
  ]);

  // Rezepte kommen aus der separaten Rezepte-App (Server Action, eigenes Supabase-Projekt).
  // Getrennt vom Familien-Laden: Ist die Rezept-DB nicht erreichbar, bleibt der Planer nutzbar —
  // nur die Auswahlliste fehlt. Kein Realtime über Projektgrenzen; Änderungen aus der
  // Rezepte-App erscheinen nach dem nächsten Seitenaufruf.
  useEffect(() => {
    let isMounted = true;
    listRecipes()
      .then((result) => {
        if (!isMounted) return;
        if ("error" in result) setRecipesError(result.error);
        else setRecipes(result.data.recipes, result.data.categories);
      })
      .catch((error) => {
        console.error("listRecipes failed", error);
        if (isMounted) setRecipesError("Mahlzeiten konnten nicht geladen werden.");
      });
    return () => {
      isMounted = false;
    };
  }, [setRecipes, setRecipesError]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  // Tastatur-Shortcuts: ein Listener für die ganze App, dazu die globalen Aktionen.
  // Seiten wie der Kalender registrieren ihre eigenen Aktionen selbst.
  useShortcutListener();
  const keymap = useKeymap();
  const setHelpOpen = useShortcutStore((s) => s.setHelpOpen);
  useShortcut("goCalendar", () => router.push("/calendar"));
  useShortcut("goMeals", () => router.push("/meals"));
  useShortcut("goAnniversaries", () => router.push("/anniversaries"));
  useShortcut("goSettings", () => router.push("/settings"));
  useShortcut("toggleTodos", toggleTodos);
  useShortcut("toggleTheme", toggleTheme);
  useShortcut("showHelp", () => setHelpOpen(!useShortcutStore.getState().isHelpOpen));
  // Außerhalb des Kalenders: dorthin wechseln, der Kalender zeigt das offene Formular.
  useShortcut("newAppointment", () => {
    openForm();
    router.push("/calendar");
  });

  const links: { href: string; label: string; icon: typeof Calendar; shortcut: ShortcutActionId }[] = [
    { href: "/calendar", label: "Kalender", icon: Calendar, shortcut: "goCalendar" },
    { href: "/meals", label: "Essen", icon: UtensilsCrossed, shortcut: "goMeals" },
    { href: "/anniversaries", label: "Jahrestage", icon: Cake, shortcut: "goAnniversaries" },
    { href: "/settings", label: "Einstellungen", icon: Settings, shortcut: "goSettings" },
  ];

  const navItem = (active: boolean) =>
    cn(
      "flex flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium transition-colors",
      active
        ? "text-[var(--foreground)] bg-[var(--accent)]"
        : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
    );

  const todoButton = (className: string) => (
    <button
      type="button"
      onClick={toggleTodos}
      title={withShortcutHint("Todos", keymap.toggleTodos)}
      className={cn(navItem(isTodosOpen), className)}
    >
      <span className="relative">
        <ListTodo className="w-5 h-5" />
        {openTodoCount > 0 && (
          <span className="absolute -top-1.5 -right-2.5 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] text-[10px] font-semibold tabular">
            {openTodoCount}
          </span>
        )}
      </span>
      Todos
    </button>
  );

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Side rail — tablet and up */}
      <nav className="hidden md:flex w-20 shrink-0 flex-col items-center gap-1 border-r border-[var(--border)] bg-[var(--card)] py-4">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)]">
          <Calendar className="w-5 h-5" />
        </div>
        {links.map(({ href, label, icon: Icon, shortcut }) => (
          <Link
            key={href}
            href={href}
            title={withShortcutHint(label, keymap[shortcut])}
            className={cn(navItem(pathname.startsWith(href)), "h-16 w-16")}
          >
            <Icon className="w-5 h-5" />
            {label === "Einstellungen" ? "Setup" : label}
          </Link>
        ))}
        {todoButton("h-16 w-16")}
        <button
          type="button"
          onClick={handleLogout}
          title="Abmelden"
          className={cn(navItem(false), "mt-auto h-12 w-16")}
        >
          <LogOut className="w-5 h-5" />
        </button>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        {loadError && (
          <p className="shrink-0 border-b border-[var(--destructive)]/30 bg-[var(--destructive)]/10 px-4 py-2 text-sm text-[var(--destructive)]">
            {loadError}
          </p>
        )}

        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>

        {/* Bottom bar — phone */}
        <nav className="md:hidden pb-safe shrink-0 border-t border-[var(--border)] bg-[var(--card)]">
          <div className="grid grid-cols-6 gap-1 px-2 py-1.5">
            {links.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className={cn(navItem(pathname.startsWith(href)), "h-14")}>
                <Icon className="w-5 h-5" />
                {label === "Einstellungen" ? "Setup" : label}
              </Link>
            ))}
            {todoButton("h-14")}
            <button type="button" onClick={handleLogout} className={cn(navItem(false), "h-14")}>
              <LogOut className="w-5 h-5" />
              Abmelden
            </button>
          </div>
        </nav>
      </div>

      <ThemeToggle />
      <TodoSheet />
      <ShortcutHelpDialog />
    </div>
  );
}
