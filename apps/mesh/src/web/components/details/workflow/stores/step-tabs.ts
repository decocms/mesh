import { useStore } from "zustand/react";
import { createJSONStorage, persist } from "zustand/middleware";
import { create } from "zustand";

type ToolActionTab = "connections" | "tools" | "tool";

interface State {
  currentStepTab: ToolActionTab;
}
interface Actions {
  setCurrentStepTab: (currentStepTab: ToolActionTab) => void;
}
interface Store extends State {
  actions: Actions;
}

const initialState: State = {
  currentStepTab: "connections",
};

const createStepTabsStore = () => {
  const store = create<Store>()(
    persist(
      (set) => ({
        ...initialState,
        actions: {
          setCurrentStepTab: (currentStepTab) => set({ currentStepTab }),
        },
      }),
      {
        name: "step-tabs",
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          currentStepTab: state.currentStepTab,
        }),
      },
    ),
  );
  return store;
};

const stepTabsStore = createStepTabsStore();

export const useToolActionTab = () => {
  const currentStepTab = useStore(
    stepTabsStore,
    (state) => state.currentStepTab,
  );
  const setCurrentStepTab = useStore(
    stepTabsStore,
    (state) => state.actions.setCurrentStepTab,
  );

  return {
    activeTab: currentStepTab,
    setActiveTab: (toolActionTab: ToolActionTab) => {
      setCurrentStepTab(toolActionTab);
    },
  };
};
