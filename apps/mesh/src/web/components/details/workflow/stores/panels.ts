import { History, Wrench } from "lucide-react";
import { createStore } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { shallow } from "zustand/vanilla/shallow";
import { ExecutionsPanel } from "..";
import { ActionTab } from "../components/tabs";

export const PANELS = {
  executions: {
    name: "executions",
    label: "Executions",
    icon: History,
    component: ExecutionsPanel,
  },
  step: {
    name: "step_input",
    label: "Step",
    icon: Wrench,
    component: ActionTab,
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

const createPanelsStore = (initialState: State) => {
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
  };
}

const usePanelsStore = createPanelsStore({
  activePanels: getDefaultActivePanels(),
  activeView: "canvas",
});

export const useActivePanels = () => {
  const activePanels = useStoreWithEqualityFn(
    usePanelsStore,
    (state) => state.activePanels,
    shallow,
  );

  return activePanels;
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
