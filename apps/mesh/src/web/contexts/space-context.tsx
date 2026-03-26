/**
 * Space Context — Types, context object, and hooks for URL-driven space state.
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

export interface SpaceContextValue {
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

export const SpaceContext = createContext<SpaceContextValue | null>(null);

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useSpaceContext(): SpaceContextValue {
  const ctx = use(SpaceContext);
  if (!ctx) {
    throw new Error("useSpaceContext must be used within a VirtualMCPProvider");
  }
  return ctx;
}

/** Returns null when not inside a space route — safe for components used in both contexts. */
export function useOptionalSpaceContext(): SpaceContextValue | null {
  return use(SpaceContext);
}
