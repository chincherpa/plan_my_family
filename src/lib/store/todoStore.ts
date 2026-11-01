import { create } from "zustand";

interface TodoUiState {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
}

export const useTodoStore = create<TodoUiState>((set) => ({
  isSidebarOpen: false,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
}));
