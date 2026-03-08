import { create } from "zustand";
import type {
  Family,
  FamilyMember,
  Vehicle,
  AppointmentWithParticipants,
} from "@/lib/supabase/types";

interface DataState {
  family: Family | null;
  members: FamilyMember[];
  vehicles: Vehicle[];
  appointments: AppointmentWithParticipants[];
  isLoading: boolean;

  setFamily: (family: Family | null) => void;
  setMembers: (members: FamilyMember[]) => void;
  setVehicles: (vehicles: Vehicle[]) => void;
  setAppointments: (appointments: AppointmentWithParticipants[]) => void;
  addAppointment: (appointment: AppointmentWithParticipants) => void;
  updateAppointment: (id: string, updates: Partial<AppointmentWithParticipants>) => void;
  removeAppointment: (id: string) => void;
  setLoading: (loading: boolean) => void;
}

export const useDataStore = create<DataState>((set) => ({
  family: null,
  members: [],
  vehicles: [],
  appointments: [],
  isLoading: false,

  setFamily: (family) => set({ family }),
  setMembers: (members) => set({ members }),
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
  setLoading: (isLoading) => set({ isLoading }),
}));
