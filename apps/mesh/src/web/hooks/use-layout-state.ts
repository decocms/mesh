/**
 * usePanelState — Querystring-driven panel layout state.
 *
 * Panel open/closed state lives in URL search params.
 * Panel widths stay in localStorage.
 * Runtime toggles use imperative panel group ref for smooth animation.
 * ResizablePanelGroup key changes only on agent/task switch.
 *
 * All panel-state writes use navigate({ replace: true }) to avoid history pollution.
 */

import { createContext, use, useRef } from "react";
import { useMatch, useNavigate, useSearch } from "@tanstack/react-router";
import {
  getDecopilotId,
  getWellKnownDecopilotVirtualMCP,
  useProjectContext,
} from "@decocms/mesh-sdk";
import type { ImperativePanelGroupHandle } from "@/web/components/resizable";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EntityLayoutMetadata {
  defaultMainView?: { type: string } | null;
  chatDefaultOpen?: boolean | null;
}

export interface LayoutState {
  taskId: string;
  tasksOpen: boolean;
  mainOpen: boolean;
  chatOpen: boolean;
  mainView: string | undefined;
  mainViewId: string | undefined;
  toolName: string | undefined;
}

export interface LayoutActions {
  setTaskId: (id: string) => void;
  toggleTasks: () => void;
  toggleMain: () => void;
  toggleChat: () => void;
  openChat: () => void;
  createNewTask: () => void;
  openMainView: (
    view: string,
    opts?: { id?: string; toolName?: string },
  ) => void;
  closeMainView: () => void;
}

// ---------------------------------------------------------------------------
// PanelGroupRefContext — provides the imperative PanelGroup handle.
// ---------------------------------------------------------------------------

export const PanelGroupRefContext =
  createContext<React.RefObject<ImperativePanelGroupHandle | null> | null>(
    null,
  );

export function usePanelGroupRef() {
  return use(PanelGroupRefContext);
}

// ---------------------------------------------------------------------------
// Pure functions (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Determines whether a toggle action is allowed.
 * Returns false if toggling the panel off would leave zero panels open.
 */
export function canToggle(
  panelIsOpen: boolean,
  expandedCount: number,
): boolean {
  if (panelIsOpen && expandedCount <= 1) return false;
  return true;
}

/**
 * Resolves default panel open/closed state when URL params are absent.
 *
 * Rules:
 * 1. Non-agent-home routes: all panels expanded
 * 2. Agent home with ?main param: all panels expanded
 * 3. Agent home, decopilot ID: tasks closed, main closed, chat open
 * 4. Agent home, entity default view is chat/null: main collapsed, chat open
 * 5. Agent home, entity default view is non-chat: main open, chat uses chatDefaultOpen
 */
export function resolveDefaultPanelState(ctx: {
  virtualMcpId: string;
  orgId: string;
  entityMetadata: EntityLayoutMetadata | null;
  hasMainParam: boolean;
  isAgentHomeRoute: boolean;
}): { tasksOpen: boolean; mainOpen: boolean; chatOpen: boolean } {
  const allOpen = { tasksOpen: true, mainOpen: true, chatOpen: true };

  // Non-agent-home routes: all expanded
  if (!ctx.isAgentHomeRoute) {
    return allOpen;
  }

  // ?main param present: all expanded
  if (ctx.hasMainParam) {
    return allOpen;
  }

  // Decopilot ID: tasks closed, main closed, chat open
  const isDecopilot = ctx.virtualMcpId === getDecopilotId(ctx.orgId);
  if (isDecopilot) {
    return { tasksOpen: false, mainOpen: false, chatOpen: true };
  }

  // Entity metadata driven defaults
  const defaultViewType = ctx.entityMetadata?.defaultMainView?.type ?? null;
  const showMain =
    defaultViewType === "automation" ||
    defaultViewType === "ext-apps" ||
    defaultViewType === "settings";

  if (!showMain) {
    // Default view is chat or unset — chat visible, main collapsed
    return { tasksOpen: true, mainOpen: false, chatOpen: true };
  }

  // Non-chat default view — respect chatDefaultOpen config
  const chatDefaultOpen = ctx.entityMetadata?.chatDefaultOpen ?? false;
  return { tasksOpen: true, mainOpen: true, chatOpen: chatDefaultOpen };
}

/**
 * Maps panel open/closed booleans to default size percentages.
 * Note: tasks minSize is 22, so open sizes must be >= 22.
 */
export function computeDefaultSizes(state: {
  tasksOpen: boolean;
  mainOpen: boolean;
  chatOpen: boolean;
}): { tasks: number; main: number; chat: number } {
  const { tasksOpen, mainOpen, chatOpen } = state;

  if (tasksOpen && mainOpen && chatOpen)
    return { tasks: 22, main: 43, chat: 35 };
  if (!tasksOpen && mainOpen && chatOpen)
    return { tasks: 0, main: 65, chat: 35 };
  if (tasksOpen && !mainOpen && chatOpen)
    return { tasks: 22, main: 0, chat: 78 };
  if (tasksOpen && mainOpen && !chatOpen)
    return { tasks: 22, main: 78, chat: 0 };
  if (!tasksOpen && !mainOpen && chatOpen)
    return { tasks: 0, main: 0, chat: 100 };
  if (!tasksOpen && mainOpen && !chatOpen)
    return { tasks: 0, main: 100, chat: 0 };
  if (tasksOpen && !mainOpen && !chatOpen)
    return { tasks: 100, main: 0, chat: 0 };

  // Fallback (all closed — shouldn't happen due to toggle guard)
  return { tasks: 0, main: 0, chat: 100 };
}

/**
 * Applies the target layout to the panel group ref (if available).
 * Uses setLayout() for an atomic, single-pass update of all panel sizes.
 */
function applyLayout(
  ref: React.RefObject<ImperativePanelGroupHandle | null> | null | undefined,
  nextState: { tasksOpen: boolean; mainOpen: boolean; chatOpen: boolean },
) {
  const handle = ref?.current;
  if (!handle) return;
  const sizes = computeDefaultSizes(nextState);
  handle.setLayout([sizes.tasks, sizes.main, sizes.chat]);
}

// ---------------------------------------------------------------------------
// Search param helpers
// ---------------------------------------------------------------------------

type PanelSearchParams = {
  taskId?: string;
  tasks?: number;
  mainOpen?: number;
  chat?: number;
  main?: string;
  id?: string;
  toolName?: string;
};

function parsePanelParam(
  value: number | undefined,
  defaultOpen: boolean,
): boolean {
  if (value === 1) return true;
  if (value === 0) return false;
  return defaultOpen;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePanelState(
  entityMetadata: EntityLayoutMetadata | null,
  panelGroupRef?: React.RefObject<ImperativePanelGroupHandle | null> | null,
  isAgentHomeRouteOverride?: boolean,
): LayoutState & LayoutActions {
  const navigate = useNavigate();
  const { org } = useProjectContext();

  const search = useSearch({ strict: false }) as PanelSearchParams;

  const agentsMatch = useMatch({
    from: "/shell/$org/$virtualMcpId",
    shouldThrow: false,
  });
  const orgHomeMatch = useMatch({
    from: "/shell/$org/",
    shouldThrow: false,
  });
  const agentHomeMatch = useMatch({
    from: "/shell/$org/$virtualMcpId/",
    shouldThrow: false,
  });

  // Resolve virtualMcpId: agent route param or decopilot fallback
  const virtualMcpId =
    agentsMatch?.params.virtualMcpId ??
    getWellKnownDecopilotVirtualMCP(org.id).id;

  const isAgentRoute = !!agentsMatch;
  const isOrgHome = !!orgHomeMatch && !agentsMatch;
  // Org home is effectively the decopilot agent's home route.
  // The override is needed because useMatch for "/shell/$org/" may not resolve
  // correctly through the pathless agent-shell layout.
  const isAgentHomeRoute =
    isAgentHomeRouteOverride ??
    ((isAgentRoute && !!agentHomeMatch) || isOrgHome);

  const resolveCtx = {
    virtualMcpId,
    orgId: org.id,
    entityMetadata,
    hasMainParam: !!search.main,
    isAgentHomeRoute,
  };
  const defaults = resolveDefaultPanelState(resolveCtx);

  // Parse panel state from URL, falling back to defaults
  const tasksOpen = parsePanelParam(search.tasks, defaults.tasksOpen);
  const mainOpen = parsePanelParam(search.mainOpen, defaults.mainOpen);
  const chatOpen = parsePanelParam(search.chat, defaults.chatOpen);

  // taskId fallback for non-validated routes
  const fallbackRef = useRef(crypto.randomUUID());
  const taskId = search.taskId ?? fallbackRef.current;

  // Expanded count for toggle guard
  const expandedCount = [tasksOpen, mainOpen, chatOpen].filter(Boolean).length;

  // --- Route params for navigation ---
  const orgSlug =
    agentsMatch?.params.org ?? orgHomeMatch?.params.org ?? org.slug;
  const routeBase = isAgentRoute
    ? ("/$org/$virtualMcpId/" as const)
    : ("/$org/" as const);
  const routeParams = isAgentRoute
    ? { org: orgSlug, virtualMcpId }
    : { org: orgSlug };

  // Helper: navigate with search params (replace for panel state)
  const navigateSearch = (
    updates: Record<string, unknown>,
    options?: { replace?: boolean },
  ) => {
    navigate({
      to: routeBase,
      params: routeParams,
      search: (prev: Record<string, unknown>) => ({ ...prev, ...updates }),
      replace: options?.replace ?? false,
    });
  };

  // --- Actions ---
  // Toggle actions apply layout imperatively via setLayout(), then update URL.
  // The ResizablePanelGroup key only includes virtualMcpId + taskId, so panel
  // toggles do NOT cause a remount — the imperative resize handles the visual.

  const setTaskId = (id: string) => {
    // Reset all panel state — only preserve taskId + tasks panel.
    // taskId is in the key, so this remounts the panel group (intended).
    navigate({
      to: routeBase,
      params: routeParams,
      search: (prev: Record<string, unknown>) => {
        const next: Record<string, unknown> = { taskId: id };
        if (prev.tasks) next.tasks = prev.tasks;
        return next;
      },
    });
  };

  const toggleTasks = () => {
    if (!canToggle(tasksOpen, expandedCount)) return;
    const nextState = { tasksOpen: !tasksOpen, mainOpen, chatOpen };
    applyLayout(panelGroupRef, nextState);
    navigateSearch({ tasks: !tasksOpen ? 1 : 0 }, { replace: true });
  };

  const toggleMain = () => {
    if (!canToggle(mainOpen, expandedCount)) return;
    const nextState = { tasksOpen, mainOpen: !mainOpen, chatOpen };
    applyLayout(panelGroupRef, nextState);
    navigateSearch({ mainOpen: !mainOpen ? 1 : 0 }, { replace: true });
  };

  const toggleChat = () => {
    if (!canToggle(chatOpen, expandedCount)) return;
    const nextState = { tasksOpen, mainOpen, chatOpen: !chatOpen };
    applyLayout(panelGroupRef, nextState);
    navigateSearch({ chat: !chatOpen ? 1 : 0 }, { replace: true });
  };

  const openChat = () => {
    if (chatOpen) return;
    const nextState = { tasksOpen, mainOpen, chatOpen: true };
    applyLayout(panelGroupRef, nextState);
    navigateSearch({ chat: 1 }, { replace: true });
  };

  const createNewTask = () => {
    const newTaskId = crypto.randomUUID();
    // Reset all panel state — only preserve tasks panel + force chat open.
    // taskId is in the key, so this remounts the panel group (intended).
    navigate({
      to: routeBase,
      params: routeParams,
      search: (prev: Record<string, unknown>) => {
        const next: Record<string, unknown> = {
          taskId: newTaskId,
          chat: 1,
        };
        if (prev.tasks) next.tasks = prev.tasks;
        return next;
      },
    });
  };

  const openMainView = (
    view: string,
    opts?: { id?: string; toolName?: string },
  ) => {
    if (view === "default") {
      // Reset main view — clear main/id/toolName, preserve taskId and panel state
      navigate({
        to: routeBase,
        params: routeParams,
        search: (prev: Record<string, unknown>) => {
          const next: Record<string, unknown> = {};
          if (prev.taskId) next.taskId = prev.taskId;
          if (prev.tasks) next.tasks = prev.tasks;
          if (prev.mainOpen) next.mainOpen = prev.mainOpen;
          if (prev.chat) next.chat = prev.chat;
          return next;
        },
        replace: true,
      });
      return;
    }

    // Open main panel if not already open
    if (!mainOpen) {
      const nextState = { tasksOpen, mainOpen: true, chatOpen };
      applyLayout(panelGroupRef, nextState);
    }

    const updates: Record<string, unknown> = {
      main: view,
      mainOpen: 1,
    };
    if (opts?.id) updates.id = opts.id;
    if (opts?.toolName) updates.toolName = opts.toolName;
    navigateSearch(updates, { replace: true });
  };

  const closeMainView = () => {
    const nextState = { tasksOpen, mainOpen: false, chatOpen };
    applyLayout(panelGroupRef, nextState);
    navigate({
      to: routeBase,
      params: routeParams,
      search: (prev: Record<string, unknown>) => {
        const next: Record<string, unknown> = {};
        if (prev.taskId) next.taskId = prev.taskId;
        if (prev.tasks) next.tasks = prev.tasks;
        if (prev.chat) next.chat = prev.chat;
        next.mainOpen = 0;
        return next;
      },
      replace: true,
    });
  };

  return {
    taskId,
    tasksOpen,
    mainOpen,
    chatOpen,
    mainView: search.main,
    mainViewId: search.id,
    toolName: search.toolName,
    setTaskId,
    toggleTasks,
    toggleMain,
    toggleChat,
    openChat,
    createNewTask,
    openMainView,
    closeMainView,
  };
}
