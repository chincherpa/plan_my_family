import { create } from "zustand";

export type CalendarView = "week" | "day";

interface CalendarState {
  view: CalendarView;
  focusedDate: Date;
  selectedAppointmentId: string | null;
  isFormOpen: boolean;
  formInitialDate: Date | null;
  formMemberId: string | null;
  startHour: number;
  endHour: number;

  setView: (view: CalendarView) => void;
  setFocusedDate: (date: Date) => void;
  goToPrev: () => void;
  goToNext: () => void;
  goToToday: () => void;
  openForm: (opts?: { date?: Date; memberId?: string; appointmentId?: string }) => void;
  closeForm: () => void;
  setTimeRange: (startHour: number, endHour: number) => void;
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
  view: "week",
  focusedDate: new Date(),
  selectedAppointmentId: null,
  isFormOpen: false,
  formInitialDate: null,
  formMemberId: null,
  startHour: 0,
  endHour: 24,

  setView: (view) => set({ view }),
  setFocusedDate: (date) => set({ focusedDate: date }),

  goToPrev: () => {
    const { focusedDate, view } = get();
    const d = new Date(focusedDate);
    if (view === "week") d.setDate(d.getDate() - 7);
    else d.setDate(d.getDate() - 1);
    set({ focusedDate: d });
  },

  goToNext: () => {
    const { focusedDate, view } = get();
    const d = new Date(focusedDate);
    if (view === "week") d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 1);
    set({ focusedDate: d });
  },

  goToToday: () => set({ focusedDate: new Date() }),

  setTimeRange: (startHour, endHour) => {
    if (startHour < endHour && startHour >= 0 && endHour <= 24) {
      set({ startHour, endHour });
    }
  },

  openForm: (opts) =>
    set({
      isFormOpen: true,
      formInitialDate: opts?.date ?? null,
      formMemberId: opts?.memberId ?? null,
      selectedAppointmentId: opts?.appointmentId ?? null,
    }),

  closeForm: () =>
    set({
      isFormOpen: false,
      formInitialDate: null,
      formMemberId: null,
      selectedAppointmentId: null,
    }),
}));
