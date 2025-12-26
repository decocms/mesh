import { ListChecks, Wrench } from "lucide-react";
import { createStore } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { shallow } from "zustand/vanilla/shallow";

const PANELS = {
  step: {
    name: "step",
    label: "Step",
    icon: Wrench,
  },
  steps: {
    name: "steps",
    label: "Steps",
    icon: ListChecks,
  },
};
export type View = "list" | "canvas" | "code";
export type RightPanelTab = "properties" | "runs";
type Panel = keyof typeof PANELS;
type ActivePanels = Record<Panel, boolean>;

interface State {
  activePanels: ActivePanels;
  activeView: View;
  rightPanelTab: RightPanelTab;
  viewingRunId: string | null;
}

interface Actions {
  togglePanel: (panel: Panel) => void;
  setActiveView: (view: View) => void;
  setRightPanelTab: (tab: RightPanelTab) => void;
  setViewingRunId: (runId: string | null) => void;
}

interface Store extends State {
  actions: Actions;
}

export const createPanelsStore = (initialState: State) => {
  return createStore<Store>()(
    persist(
      (set) => ({
        ...initialState,
        actions: {
          togglePanel: (panel: Panel) => {
            set((state) => ({
              activePanels: {
                ...state.activePanels,
                [panel]: !state.activePanels[panel],
              },
            }));
          },
          setActiveView: (view: View) => {
            set({ activeView: view });
          },
          setRightPanelTab: (tab: RightPanelTab) => {
            set({ rightPanelTab: tab });
          },
          setViewingRunId: (runId: string | null) => {
            set({ viewingRunId: runId });
          },
        },
      }),
      {
        name: "panels",
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          activePanels: state.activePanels,
          activeView: state.activeView,
          rightPanelTab: state.rightPanelTab,
          // Don't persist viewingRunId - always start fresh
        }),
      },
    ),
  );
};

function getDefaultActivePanels(): ActivePanels {
  return {
    step: true,
    steps: false,
  };
}

const usePanelsStore = createPanelsStore({
  activePanels: getDefaultActivePanels(),
  activeView: "list",
  rightPanelTab: "properties",
  viewingRunId: null,
});

export const useActivePanels = () => {
  return useStoreWithEqualityFn(
    usePanelsStore,
    (state) => state.activePanels,
    shallow,
  );
};

export const useActiveView = () => {
  return useStoreWithEqualityFn(
    usePanelsStore,
    (state) => state.activeView,
    shallow,
  );
};

export const useRightPanelTab = () => {
  return useStoreWithEqualityFn(
    usePanelsStore,
    (state) => state.rightPanelTab,
    shallow,
  );
};

export const useViewingRunId = () => {
  return useStoreWithEqualityFn(
    usePanelsStore,
    (state) => state.viewingRunId,
    shallow,
  );
};

export const usePanelsActions = () => {
  return useStoreWithEqualityFn(
    usePanelsStore,
    (state) => state.actions,
    shallow,
  );
};
