import { History, ListChecks, Wrench } from "lucide-react";
import { createStore } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { shallow } from "zustand/vanilla/shallow";

const PANELS = {
  executions: {
    name: "executions",
    label: "Executions",
    icon: History,
  },
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
type View = "code" | "canvas";
type Panel = keyof typeof PANELS;
type ActivePanels = Record<Panel, boolean>;

interface State {
  activePanels: ActivePanels;
  activeView: View;
}

interface Actions {
  togglePanel: (panel: Panel) => void;
  setActiveView: (view: View) => void;
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
        },
      }),
      {
        name: "panels",
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          activePanels: state.activePanels,
          activeView: state.activeView,
        }),
      },
    ),
  );
};

function getDefaultActivePanels(): ActivePanels {
  return {
    executions: false,
    step: true,
    steps: false,
  };
}

const usePanelsStore = createPanelsStore({
  activePanels: getDefaultActivePanels(),
  activeView: "canvas",
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

export const usePanelsActions = () => {
  return useStoreWithEqualityFn(
    usePanelsStore,
    (state) => state.actions,
    shallow,
  );
};
