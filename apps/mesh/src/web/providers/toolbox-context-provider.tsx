/**
 * Toolbox Context Provider
 *
 * Provides toolbox (gateway) data for the toolbox focus mode.
 * Used within ToolboxLayout to share toolbox state with child components.
 */

import type { GatewayEntity } from "@/tools/gateway/schema";
import { createContext, useContext, type PropsWithChildren } from "react";

export interface ToolboxContextValue {
  /** The current toolbox (gateway) entity */
  toolbox: GatewayEntity;
  /** The toolbox ID */
  toolboxId: string;
}

const ToolboxContext = createContext<ToolboxContextValue | null>(null);

export interface ToolboxContextProviderProps extends PropsWithChildren {
  toolbox: GatewayEntity;
}

export function ToolboxContextProvider({
  toolbox,
  children,
}: ToolboxContextProviderProps) {
  return (
    <ToolboxContext.Provider value={{ toolbox, toolboxId: toolbox.id }}>
      {children}
    </ToolboxContext.Provider>
  );
}

export function useToolboxContext(): ToolboxContextValue {
  const context = useContext(ToolboxContext);
  if (!context) {
    throw new Error(
      "useToolboxContext must be used within a ToolboxContextProvider",
    );
  }
  return context;
}

export function useOptionalToolboxContext(): ToolboxContextValue | null {
  return useContext(ToolboxContext);
}
