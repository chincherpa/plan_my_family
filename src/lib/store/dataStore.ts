import { create } from "zustand";
import type {
  Family,
  FamilyMember,
  Vehicle,
  Meal,
  AppointmentWithParticipants,
  Recipe,
  MealPlanWithRecipe,
} from "@/lib/supabase/types";

interface DataState {
  family: Family | null;
  members: FamilyMember[];
  vehicles: Vehicle[];
  appointments: AppointmentWithParticipants[];
<<<<<<< HEAD
  recipes: Recipe[];
  mealPlans: MealPlanWithRecipe[];
=======
  meals: Meal[];
>>>>>>> 485593881e3feccb28c04fb2507d4aedbb639398
  isLoading: boolean;

  setFamily: (family: Family | null) => void;
  setMembers: (members: FamilyMember[]) => void;
  reorderMembers: (orderedIds: string[]) => void;
  setVehicles: (vehicles: Vehicle[]) => void;
  setAppointments: (appointments: AppointmentWithParticipants[]) => void;
  addAppointment: (appointment: AppointmentWithParticipants) => void;
  updateAppointment: (id: string, updates: Partial<AppointmentWithParticipants>) => void;
  removeAppointment: (id: string) => void;
<<<<<<< HEAD
  setRecipes: (recipes: Recipe[]) => void;
  addRecipe: (recipe: Recipe) => void;
  updateRecipe: (id: number, updates: Partial<Recipe>) => void;
  removeRecipe: (id: number) => void;
  setMealPlans: (plans: MealPlanWithRecipe[]) => void;
  upsertMealPlan: (plan: MealPlanWithRecipe) => void;
=======
  setMeals: (meals: Meal[]) => void;
  upsertMeal: (meal: Meal) => void;
>>>>>>> 485593881e3feccb28c04fb2507d4aedbb639398
  setLoading: (loading: boolean) => void;
}

export const useDataStore = create<DataState>((set) => ({
  family: null,
  members: [],
  vehicles: [],
  appointments: [],
<<<<<<< HEAD
  recipes: [],
  mealPlans: [],
=======
  meals: [],
>>>>>>> 485593881e3feccb28c04fb2507d4aedbb639398
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
<<<<<<< HEAD
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
=======
  setMeals: (meals) => set({ meals }),
  upsertMeal: (meal) =>
    set((state) => ({
      meals: [
        ...state.meals.filter((m) => !(m.family_id === meal.family_id && m.date === meal.date)),
        meal,
      ],
    })),
>>>>>>> 485593881e3feccb28c04fb2507d4aedbb639398
  setLoading: (isLoading) => set({ isLoading }),
}));
