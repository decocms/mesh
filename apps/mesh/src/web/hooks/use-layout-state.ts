/**
 * usePanelState — Querystring-driven panel layout state.
 *
 * URL model:
 *   ?main=<tabId>    main panel open, tab active
 *   ?main=0          main panel closed
 *   ?main absent     default (open iff defaultMainView != null)
 *   ?tasks=0|1       tasks panel open state
 *   ?chat=0|1        chat panel open state
 *   ?virtualmcpid    which MCP the chat + right panel are scoped to
 */

import { useRef } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { resolveDefaultTabId } from "@/web/layouts/main-panel-tabs/tab-id";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EntityLayoutMetadata {
  defaultMainView?: { type: string; id?: string } | null;
  chatDefaultOpen?: boolean | null;
  tabs?: Array<{ id: string }>;
}

export interface LayoutState {
  taskId: string;
  tasksOpen: boolean;
  mainOpen: boolean;
  chatOpen: boolean;
  /** Current ?main value (undefined when param absent). "0" = closed. */
  mainParam: string | undefined;
}

export interface LayoutActions {
  setTaskId: (id: string, virtualMcpId?: string) => void;
  toggleTasks: () => void;
  toggleMain: () => void;
  toggleChat: () => void;
  openChat: () => void;
  createNewTask: () => void;
  openTab: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

export function canToggle(
  panelIsOpen: boolean,
  expandedCount: number,
): boolean {
  if (panelIsOpen && expandedCount <= 1) return false;
  return true;
}

export function resolveDefaultPanelState(ctx: {
  entityMetadata: EntityLayoutMetadata | null;
  mainParamPresent: boolean;
  mainParamValue?: string;
  taskCount: number;
}): { tasksOpen: boolean; mainOpen: boolean; chatOpen: boolean } {
  const mainOpen = ctx.mainParamPresent
    ? ctx.mainParamValue !== "0"
    : ctx.entityMetadata?.defaultMainView != null;

  return {
    tasksOpen: ctx.taskCount > 0,
    mainOpen,
    chatOpen: ctx.entityMetadata?.chatDefaultOpen ?? true,
  };
}

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
  return { tasks: 0, main: 0, chat: 100 };
}

// ---------------------------------------------------------------------------
// Search param helpers
// ---------------------------------------------------------------------------

type PanelSearchParams = {
  tasks?: number;
  chat?: number;
  main?: string;
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

export interface PanelStateRouteCtx {
  virtualMcpId: string;
  orgSlug: string;
  isAgentRoute: boolean;
}

export function usePanelState(
  entityMetadata: EntityLayoutMetadata | null,
  routeCtx: PanelStateRouteCtx,
  taskCount: number,
): LayoutState & LayoutActions {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as PanelSearchParams;
  const routeParamsRaw = useParams({ strict: false }) as {
    org?: string;
    taskId?: string;
  };

  const { virtualMcpId, orgSlug, isAgentRoute } = routeCtx;

  const defaults = resolveDefaultPanelState({
    entityMetadata,
    mainParamPresent: search.main !== undefined,
    mainParamValue: search.main,
    taskCount,
  });

  const tasksOpen = parsePanelParam(search.tasks, defaults.tasksOpen);
  const chatOpen = parsePanelParam(search.chat, defaults.chatOpen);
  const mainOpen = defaults.mainOpen;

  const fallbackRef = useRef(crypto.randomUUID());
  const taskId = routeParamsRaw.taskId ?? fallbackRef.current;

  const expandedCount = [tasksOpen, mainOpen, chatOpen].filter(Boolean).length;

  const routeBase = "/$org/$taskId" as const;
  const makeParams = (tid: string) => ({ org: orgSlug, taskId: tid });
  const preserveVirtualMcp = isAgentRoute ? { virtualmcpid: virtualMcpId } : {};

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

  const setTaskId = (id: string, targetVirtualMcpId?: string) => {
    navigate({
      to: routeBase,
      params: makeParams(id),
      search: (prev: Record<string, unknown>) => {
        const next: Record<string, unknown> = {};
        if (targetVirtualMcpId) next.virtualmcpid = targetVirtualMcpId;
        else if (isAgentRoute) next.virtualmcpid = virtualMcpId;
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
    if (mainOpen) {
      navigateSearch({ main: "0" }, { replace: true });
    } else {
      navigateSearch(
        { main: resolveDefaultTabId(entityMetadata) },
        { replace: true },
      );
    }
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

  const openTab = (id: string) => {
    navigateSearch({ main: id }, { replace: true });
  };

  return {
    taskId,
    tasksOpen,
    mainOpen,
    chatOpen,
    mainParam: search.main,
    setTaskId,
    toggleTasks,
    toggleMain,
    toggleChat,
    openChat,
    createNewTask,
    openTab,
  };
}
