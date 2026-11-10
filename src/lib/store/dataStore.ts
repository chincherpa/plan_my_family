import { create } from "zustand";
import type {
  Family,
  FamilyMember,
  Vehicle,
  SchoolHoliday,
  Meal,
  AppointmentWithParticipants,
  TodoWithItems,
  TodoItem,
} from "@/lib/supabase/types";
import type { Recipe, RecipeCategory } from "@/lib/recipes/types";

interface DataState {
  family: Family | null;
  members: FamilyMember[];
  vehicles: Vehicle[];
  schoolHolidays: SchoolHoliday[];
  appointments: AppointmentWithParticipants[];
  meals: Meal[];
  /** Rezepte aus der geteilten Rezepte-App (eigenes Supabase-Projekt) */
  recipes: Recipe[];
  recipeCategories: RecipeCategory[];
  recipesError: string | null;
  /** true, sobald listRecipes geantwortet hat (Erfolg oder Fehler) */
  recipesLoaded: boolean;
  todos: TodoWithItems[];
  isLoading: boolean;

  setFamily: (family: Family | null) => void;
  setMembers: (members: FamilyMember[]) => void;
  reorderMembers: (orderedIds: string[]) => void;
  setVehicles: (vehicles: Vehicle[]) => void;
  setSchoolHolidays: (schoolHolidays: SchoolHoliday[]) => void;
  setAppointments: (appointments: AppointmentWithParticipants[]) => void;
  addAppointment: (appointment: AppointmentWithParticipants) => void;
  updateAppointment: (id: string, updates: Partial<AppointmentWithParticipants>) => void;
  removeAppointment: (id: string) => void;
  setMeals: (meals: Meal[]) => void;
  upsertMeal: (meal: Meal) => void;
  setRecipes: (recipes: Recipe[], categories: RecipeCategory[]) => void;
  setRecipesError: (recipesError: string | null) => void;
  setTodos: (todos: TodoWithItems[]) => void;
  addTodo: (todo: TodoWithItems) => void;
  updateTodo: (id: string, updates: Partial<TodoWithItems>) => void;
  removeTodo: (id: string) => void;
  addTodoItem: (todoId: string, item: TodoItem) => void;
  updateTodoItem: (todoId: string, itemId: string, updates: Partial<TodoItem>) => void;
  removeTodoItem: (todoId: string, itemId: string) => void;
  setLoading: (loading: boolean) => void;
}

export const useDataStore = create<DataState>((set) => ({
  family: null,
  members: [],
  vehicles: [],
  schoolHolidays: [],
  appointments: [],
  meals: [],
  recipes: [],
  recipeCategories: [],
  recipesError: null,
  recipesLoaded: false,
  todos: [],
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
  setSchoolHolidays: (schoolHolidays) =>
    set({ schoolHolidays: [...schoolHolidays].sort((a, b) => a.start_date.localeCompare(b.start_date)) }),
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
  setMeals: (meals) => set({ meals }),
  upsertMeal: (meal) =>
    set((state) => ({
      meals: [
        ...state.meals.filter((m) => !(m.family_id === meal.family_id && m.date === meal.date)),
        meal,
      ],
    })),
  setRecipes: (recipes, recipeCategories) =>
    set({ recipes, recipeCategories, recipesError: null, recipesLoaded: true }),
  setRecipesError: (recipesError) => set({ recipesError, recipesLoaded: true }),
  setTodos: (todos) => set({ todos }),
  addTodo: (todo) => set((state) => ({ todos: [...state.todos, todo] })),
  updateTodo: (id, updates) =>
    set((state) => ({
      todos: state.todos.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  removeTodo: (id) =>
    set((state) => ({ todos: state.todos.filter((t) => t.id !== id) })),
  addTodoItem: (todoId, item) =>
    set((state) => ({
      todos: state.todos.map((t) =>
        t.id === todoId ? { ...t, items: [...t.items, item] } : t
      ),
    })),
  updateTodoItem: (todoId, itemId, updates) =>
    set((state) => ({
      todos: state.todos.map((t) =>
        t.id === todoId
          ? { ...t, items: t.items.map((i) => (i.id === itemId ? { ...i, ...updates } : i)) }
          : t
      ),
    })),
  removeTodoItem: (todoId, itemId) =>
    set((state) => ({
      todos: state.todos.map((t) =>
        t.id === todoId ? { ...t, items: t.items.filter((i) => i.id !== itemId) } : t
      ),
    })),
  setLoading: (isLoading) => set({ isLoading }),
}));
