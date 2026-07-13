import { create } from "zustand";
import type {
  Family,
  FamilyMember,
  Vehicle,
  AppointmentWithParticipants,
  Recipe,
  MealPlanWithRecipe,
} from "@/lib/supabase/types";

interface DataState {
  family: Family | null;
  members: FamilyMember[];
  vehicles: Vehicle[];
  appointments: AppointmentWithParticipants[];
  recipes: Recipe[];
  mealPlans: MealPlanWithRecipe[];
  isLoading: boolean;

  setFamily: (family: Family | null) => void;
  setMembers: (members: FamilyMember[]) => void;
  reorderMembers: (orderedIds: string[]) => void;
  setVehicles: (vehicles: Vehicle[]) => void;
  setAppointments: (appointments: AppointmentWithParticipants[]) => void;
  addAppointment: (appointment: AppointmentWithParticipants) => void;
  updateAppointment: (id: string, updates: Partial<AppointmentWithParticipants>) => void;
  removeAppointment: (id: string) => void;
  setRecipes: (recipes: Recipe[]) => void;
  addRecipe: (recipe: Recipe) => void;
  updateRecipe: (id: number, updates: Partial<Recipe>) => void;
  removeRecipe: (id: number) => void;
  setMealPlans: (plans: MealPlanWithRecipe[]) => void;
  upsertMealPlan: (plan: MealPlanWithRecipe) => void;
  setLoading: (loading: boolean) => void;
}

export const useDataStore = create<DataState>((set) => ({
  family: null,
  members: [],
  vehicles: [],
  appointments: [],
  recipes: [],
  mealPlans: [],
  isLoading: false,

  setFamily: (family) => set({ family }),
  setMembers: (members) => set({ members }),
  reorderMembers: (orderedIds) =>
    set((state) => ({
      members: orderedIds
        .map((id) => state.members.find((m) => m.id === id)!)
        .filter(Boolean)
        .map((m, i) => ({ ...m, sort_order: i })),
    })),
  setVehicles: (vehicles) => set({ vehicles }),
  setAppointments: (appointments) => set({ appointments }),
  addAppointment: (appointment) =>
    set((state) => ({ appointments: [...state.appointments, appointment] })),
  updateAppointment: (id, updates) =>
    set((state) => ({
      appointments: state.appointments.map((a) =>
        a.id === id ? { ...a, ...updates } : a
      ),
    })),
  removeAppointment: (id) =>
    set((state) => ({
      appointments: state.appointments.filter((a) => a.id !== id),
    })),
  setRecipes: (recipes) => set({ recipes }),
  addRecipe: (recipe) => set((state) => ({ recipes: [...state.recipes, recipe] })),
  updateRecipe: (id, updates) =>
    set((state) => ({
      recipes: state.recipes.map((r) => (r.id === id ? { ...r, ...updates } : r)),
    })),
  removeRecipe: (id) =>
    set((state) => ({ recipes: state.recipes.filter((r) => r.id !== id) })),
  setMealPlans: (mealPlans) => set({ mealPlans }),
  upsertMealPlan: (plan) =>
    set((state) => {
      const idx = state.mealPlans.findIndex(
        (p) => p.family_id === plan.family_id && p.date === plan.date && p.meal_type === plan.meal_type
      );
      if (idx >= 0) {
        const next = [...state.mealPlans];
        next[idx] = plan;
        return { mealPlans: next };
      }
      return { mealPlans: [...state.mealPlans, plan] };
    }),
  setLoading: (isLoading) => set({ isLoading }),
}));
