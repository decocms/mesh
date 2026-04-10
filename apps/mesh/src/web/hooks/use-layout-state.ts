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

import { useRef } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { getDecopilotId, useProjectContext } from "@decocms/mesh-sdk";

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
    defaultViewType === "settings" ||
    defaultViewType === "preview";

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

/**
 * Route context required by usePanelState.
 * Must be provided by the caller because usePanelState runs inside a pathless
 * layout that cannot see child route params via useMatch.
 */
export interface PanelStateRouteCtx {
  virtualMcpId: string;
  orgSlug: string;
  isAgentRoute: boolean;
  isAgentHomeRoute: boolean;
}

export function usePanelState(
  entityMetadata: EntityLayoutMetadata | null,
  routeCtx: PanelStateRouteCtx,
): LayoutState & LayoutActions {
  const navigate = useNavigate();
  const { org } = useProjectContext();

  const search = useSearch({ strict: false }) as PanelSearchParams;

  const { virtualMcpId, orgSlug, isAgentRoute, isAgentHomeRoute } = routeCtx;

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
    navigateSearch({ tasks: !tasksOpen ? 1 : 0 }, { replace: true });
  };

  const toggleMain = () => {
    if (!canToggle(mainOpen, expandedCount)) return;
    navigateSearch({ mainOpen: !mainOpen ? 1 : 0 }, { replace: true });
  };

  const toggleChat = () => {
    if (!canToggle(chatOpen, expandedCount)) return;
    navigateSearch({ chat: !chatOpen ? 1 : 0 }, { replace: true });
  };

  const openChat = () => {
    if (chatOpen) return;
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
      // Deactivate main view — collapse main panel, clear main/id/toolName
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
      return;
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
