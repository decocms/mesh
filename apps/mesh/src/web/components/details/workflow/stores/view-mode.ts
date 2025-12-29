import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WorkflowViewMode = "visual" | "code";

interface ViewModeState {
  viewMode: WorkflowViewMode;
  setViewMode: (mode: WorkflowViewMode) => void;
}

export const useViewModeStore = create<ViewModeState>()(
  persist(
    (set) => ({
      viewMode: "visual",
      setViewMode: (mode) => set({ viewMode: mode }),
    }),
    {
      name: "workflow-view-mode",
    },
  ),
);
