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
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { getDecopilotId, useProjectContext } from "@decocms/mesh-sdk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EntityLayoutMetadata {
  defaultMainView?: { type: string; id?: string; toolName?: string } | null;
  chatDefaultOpen?: boolean | null;
  tabs?: Array<{ id: string }>;
}

export interface LayoutState {
  taskId: string;
  tasksOpen: boolean;
  mainOpen: boolean;
  chatOpen: boolean;
  envOpen: boolean;
  daemonOpen: boolean;
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
  toggleEnv: () => void;
  toggleDaemon: () => void;
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
 * 4. Agent home, entity defaultMainView null/absent: main collapsed, chat open
 * 5. Agent home, entity defaultMainView present: main open, chat uses chatDefaultOpen
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

  // Main panel opens whenever the agent declares a defaultMainView.
  const hasDefault = ctx.entityMetadata?.defaultMainView != null;

  if (!hasDefault) {
    return { tasksOpen: true, mainOpen: false, chatOpen: true };
  }

  const chatDefaultOpen = ctx.entityMetadata?.chatDefaultOpen ?? false;
  return { tasksOpen: true, mainOpen: true, chatOpen: chatDefaultOpen };
}

/**
 * Resolves the default tab id in the right panel when `?tab` is absent.
 *
 * - `defaultMainView === null/undefined` → `null` (no preselected tab; "Main" tab wins)
 * - `defaultMainView.type === "ext-app"` → `defaultMainView.id` (agent tab id)
 * - `defaultMainView.type === "settings"` → `defaultMainView.id` if provided, otherwise "instructions"
 * - Fallback: first agent-declared tab id when available.
 */
export function resolveDefaultTabId(
  metadata: EntityLayoutMetadata | null,
): string | null {
  const def = metadata?.defaultMainView ?? null;
  if (!def) return null;

  if (def.type === "ext-app" || def.type === "ext-apps") {
    return def.id ?? metadata?.tabs?.[0]?.id ?? null;
  }

  if (def.type === "settings") {
    return def.id ?? "instructions";
  }

  return metadata?.tabs?.[0]?.id ?? null;
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
  tasks?: number;
  mainOpen?: number;
  chat?: number;
  main?: string;
  id?: string;
  toolName?: string;
  virtualmcpid?: string;
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
  const routeParamsRaw = useParams({ strict: false }) as {
    org?: string;
    taskId?: string;
  };

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
  const envOpen = false;
  const daemonOpen = false;

  // taskId comes from path params; fall back to a stable UUID.
  const fallbackRef = useRef(crypto.randomUUID());
  const taskId = routeParamsRaw.taskId ?? fallbackRef.current;

  // Expanded count for toggle guard
  const expandedCount = [tasksOpen, mainOpen, chatOpen].filter(Boolean).length;

  // --- Route params for navigation ---
  // Note: `isAgentRoute` is derived by the caller from virtualMcpId vs decopilot.
  // Panel navigation preserves the current taskId; virtualmcpid goes in search.
  const routeBase = "/$org/$taskId" as const;
  const makeParams = (tid: string) => ({ org: orgSlug, taskId: tid });
  const preserveVirtualMcp = isAgentRoute ? { virtualmcpid: virtualMcpId } : {};

  // Helper: navigate with search params (replace for panel state)
  const navigateSearch = (
    updates: Record<string, unknown>,
    options?: { replace?: boolean },
  ) => {
    navigate({
      to: routeBase,
      params: makeParams(taskId),
      search: (prev: Record<string, unknown>) => ({ ...prev, ...updates }),
      replace: options?.replace ?? false,
    });
  };

  const setTaskId = (id: string) => {
    navigate({
      to: routeBase,
      params: makeParams(id),
      search: (prev: Record<string, unknown>) => {
        const next: Record<string, unknown> = { ...preserveVirtualMcp };
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
    navigateSearch(mainOpen ? { mainOpen: 0 } : { mainOpen: 1 }, {
      replace: true,
    });
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
    navigate({
      to: routeBase,
      params: makeParams(newTaskId),
      search: (prev: Record<string, unknown>) => {
        const next: Record<string, unknown> = {
          ...preserveVirtualMcp,
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
      navigate({
        to: routeBase,
        params: makeParams(taskId),
        search: (prev: Record<string, unknown>) => {
          const next: Record<string, unknown> = { ...preserveVirtualMcp };
          if (prev.tasks) next.tasks = prev.tasks;
          if (prev.chat) next.chat = prev.chat;
          next.mainOpen = 0;
          return next;
        },
        replace: true,
      });
      return;
    }

    const updates: Record<string, unknown> = { main: view, mainOpen: 1 };
    if (opts?.id) updates.id = opts.id;
    if (opts?.toolName) updates.toolName = opts.toolName;
    navigateSearch(updates, { replace: true });
  };

  const closeMainView = () => {
    navigate({
      to: routeBase,
      params: makeParams(taskId),
      search: (prev: Record<string, unknown>) => {
        const next: Record<string, unknown> = { ...preserveVirtualMcp };
        if (prev.tasks) next.tasks = prev.tasks;
        if (prev.chat) next.chat = prev.chat;
        next.mainOpen = 0;
        return next;
      },
      replace: true,
    });
  };

  const toggleEnv = () => {};
  const toggleDaemon = () => {};

  return {
    taskId,
    tasksOpen,
    mainOpen,
    chatOpen,
    envOpen,
    daemonOpen,
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
    toggleEnv,
    toggleDaemon,
  };
}
