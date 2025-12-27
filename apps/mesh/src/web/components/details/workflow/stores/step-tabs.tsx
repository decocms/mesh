import { useStore } from "zustand/react";
import { createJSONStorage, persist } from "zustand/middleware";
import { createStore, StoreApi } from "zustand";
import { createContext, useContext, useState } from "react";

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

interface StepTabsStoreProps {
  initialCurrentStepTab?: ToolActionTab;
}

const createStepTabsStore = (props?: StepTabsStoreProps) => {
  const store = createStore<Store>()(
    persist(
      (set) => ({
        currentStepTab: props?.initialCurrentStepTab ?? "connections",
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

const StepTabsStoreContext = createContext<StoreApi<Store> | null>(null);

export function StepTabsStoreProvider({
  children,
  initialCurrentStepTab,
}: {
  children: React.ReactNode;
  initialCurrentStepTab?: ToolActionTab;
}) {
  const [store] = useState(() =>
    createStepTabsStore({
      initialCurrentStepTab,
    }),
  );

  return (
    <StepTabsStoreContext.Provider value={store}>
      {children}
    </StepTabsStoreContext.Provider>
  );
}

function useStepTabsStore<T>(selector: (state: Store) => T): T {
  const store = useContext(StepTabsStoreContext);
  if (!store) {
    throw new Error(
      "Missing StepTabsStoreProvider - refresh the page. If the error persists, please contact support.",
    );
  }
  return useStore(store, selector);
}

export const useToolActionTab = () => {
  const currentStepTabFromStore = useStepTabsStore(
    (state) => state.currentStepTab,
  );
  const setCurrentStepTab = useStepTabsStore(
    (state) => state.actions.setCurrentStepTab,
  );

  return {
    activeTab: currentStepTabFromStore,
    setActiveTab: (toolActionTab: ToolActionTab) => {
      setCurrentStepTab(toolActionTab);
    },
  };
};
