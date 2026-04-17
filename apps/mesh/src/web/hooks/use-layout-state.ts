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

export function resolveTasksOpen(
  urlParam: number | undefined,
  hasItems: boolean,
): boolean {
  if (urlParam === 1) return true;
  if (urlParam === 0) return false;
  return hasItems;
}

export function resolveDefaultPanelState(ctx: {
  entityMetadata: EntityLayoutMetadata | null;
  mainParamPresent: boolean;
  mainParamValue?: string;
}): { mainOpen: boolean; chatOpen: boolean } {
  const def = ctx.entityMetadata?.defaultMainView ?? null;
  const defaultIsChat = def == null || def.type === "chat";

  const mainOpen = ctx.mainParamPresent
    ? ctx.mainParamValue !== "0"
    : !defaultIsChat;

  return {
    mainOpen,
    chatOpen: defaultIsChat,
  };
}

export function computeChatMainSizes(
  chatOpen: boolean,
  mainOpen: boolean,
): { chat: number; main: number } {
  if (chatOpen && mainOpen) return { chat: 45, main: 55 };
  if (chatOpen && !mainOpen) return { chat: 100, main: 0 };
  if (!chatOpen && mainOpen) return { chat: 0, main: 100 };
  return { chat: 0, main: 0 };
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
  tasksHasItems: boolean,
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
  });

  const tasksOpen = resolveTasksOpen(search.tasks, tasksHasItems);
  const chatOpen = parsePanelParam(search.chat, defaults.chatOpen);
  const mainOpen = defaults.mainOpen;

  const fallbackRef = useRef(crypto.randomUUID());
  const taskId = routeParamsRaw.taskId ?? fallbackRef.current;

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
    navigateSearch({ tasks: tasksOpen ? 0 : 1 }, { replace: true });
  };

  const toggleMain = () => {
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
    navigateSearch({ chat: chatOpen ? 0 : 1 }, { replace: true });
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
