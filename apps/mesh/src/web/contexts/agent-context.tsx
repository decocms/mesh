/**
 * Agent Context — Types, context object, and hooks for URL-driven agent state.
 *
 * The actual provider logic lives in VirtualMCPProvider.
 * This file exports the context, hooks, and types consumed by components.
 */

import { createContext, use } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MainViewType = "settings" | "automation" | "ext-apps";

export type MainView =
  | { type: "settings" }
  | { type: "automation"; id: string }
  | {
      type: "ext-apps";
      id: string;
      toolName?: string;
      [key: string]: unknown;
    }
  | null; // null = no explicit `main` param — consumer resolves default

export interface AgentContextValue {
  virtualMcpId: string;
  mainView: MainView;
  navigateToMain: (
    main: "default" | MainViewType,
    opts?: { id?: string; toolName?: string; [key: string]: unknown },
  ) => void;
  navigateToTask: (taskId: string) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export const AgentContext = createContext<AgentContextValue | null>(null);

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useAgentContext(): AgentContextValue {
  const ctx = use(AgentContext);
  if (!ctx) {
    throw new Error("useAgentContext must be used within a VirtualMCPProvider");
  }
  return ctx;
}

/** Returns null when not inside an agent route — safe for components used in both contexts. */
export function useOptionalAgentContext(): AgentContextValue | null {
  return use(AgentContext);
}
