import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WorkflowViewMode = "visual" | "code";

interface ViewModeState {
  viewMode: WorkflowViewMode;
  setViewMode: (mode: WorkflowViewMode) => void;
  showExecutionsList: boolean;
  setShowExecutionsList: (show: boolean) => void;
  toggleExecutionsList: () => void;
}

export const useViewModeStore = create<ViewModeState>()(
  persist(
    (set) => ({
      viewMode: "visual",
      setViewMode: (mode) => set({ viewMode: mode }),
      showExecutionsList: false,
      setShowExecutionsList: (show) => set({ showExecutionsList: show }),
      toggleExecutionsList: () =>
        set((state) => ({ showExecutionsList: !state.showExecutionsList })),
    }),
    {
      name: "workflow-view-mode",
    },
  ),
);
