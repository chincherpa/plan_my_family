import { create } from "zustand";
import type {
  Family,
  FamilyMember,
  Vehicle,
  Meal,
  AppointmentWithParticipants,
} from "@/lib/supabase/types";

interface DataState {
  family: Family | null;
  members: FamilyMember[];
  vehicles: Vehicle[];
  appointments: AppointmentWithParticipants[];
  meals: Meal[];
  isLoading: boolean;

  setFamily: (family: Family | null) => void;
  setMembers: (members: FamilyMember[]) => void;
  reorderMembers: (orderedIds: string[]) => void;
  setVehicles: (vehicles: Vehicle[]) => void;
  setAppointments: (appointments: AppointmentWithParticipants[]) => void;
  addAppointment: (appointment: AppointmentWithParticipants) => void;
  updateAppointment: (id: string, updates: Partial<AppointmentWithParticipants>) => void;
  removeAppointment: (id: string) => void;
  setMeals: (meals: Meal[]) => void;
  upsertMeal: (meal: Meal) => void;
  setLoading: (loading: boolean) => void;
}

export const useDataStore = create<DataState>((set) => ({
  family: null,
  members: [],
  vehicles: [],
  appointments: [],
  meals: [],
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
  setMeals: (meals) => set({ meals }),
  upsertMeal: (meal) =>
    set((state) => ({
      meals: [
        ...state.meals.filter((m) => !(m.family_id === meal.family_id && m.date === meal.date)),
        meal,
      ],
    })),
  setLoading: (isLoading) => set({ isLoading }),
}));
