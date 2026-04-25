/**
 * useChatNavigation — URL-driven chat state.
 *
 * Reads taskId from path params and virtualmcpid from search params.
 * virtualMcpId is never null — defaults to the well-known decopilot virtual MCP.
 * virtualMcpOverride is an optional search param for ephemeral per-task agent switching.
 */

import { useRef } from "react";
import { getWellKnownDecopilotVirtualMCP } from "@decocms/mesh-sdk";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useProjectContext } from "@decocms/mesh-sdk";

export interface ChatNavigation {
  virtualMcpId: string;
  virtualMcpOverride: string | undefined;
  /** Always defined — resolved from the `/$org/$taskId` path param. */
  taskId: string;
  navigateToTask: (
    taskId: string,
    opts?: { virtualMcpOverride?: string },
  ) => void;
  setVirtualMcpOverride: (id: string | null) => void;
}

export function useChatNavigation(): ChatNavigation {
  const navigate = useNavigate();
  const { org } = useProjectContext();
  const search = useSearch({ strict: false }) as {
    virtualmcpid?: string;
    virtualMcpOverride?: string;
  };

  const routeParams = useParams({ strict: false }) as {
    org?: string;
    taskId?: string;
  };

  const virtualMcpId =
    search.virtualmcpid ?? getWellKnownDecopilotVirtualMCP(org.id).id;

  const navigateToTask = (
    taskId: string,
    opts?: { virtualMcpOverride?: string },
  ) => {
    // Reset panel state — only preserve virtualmcpid + tasks panel visibility.
    // This ensures panel layout defaults kick in for the new task.
    navigate({
      to: "/$org/$taskId",
      params: { org: org.slug, taskId },
      search: (prev: Record<string, unknown>) => {
        const next: Record<string, unknown> = {};
        if (prev.virtualmcpid) next.virtualmcpid = prev.virtualmcpid;
        if (prev.tasks) next.tasks = prev.tasks;
        if (opts?.virtualMcpOverride) {
          next.virtualMcpOverride = opts.virtualMcpOverride;
        }
        return next;
      },
    });
  };

  const setVirtualMcpOverride = (id: string | null) => {
    navigate({
      search: (prev: Record<string, unknown>) => {
        const next = { ...prev };
        if (id) {
          next.virtualMcpOverride = id;
        } else {
          delete next.virtualMcpOverride;
        }
        return next;
      },
    } as never);
  };

  // On unified chat routes the taskId is a path param.
  // On other routes (e.g. settings) Chat.Provider still mounts but taskId is
  // absent — fall back to a stable generated ID so the provider works everywhere.
  const fallbackRef = useRef(crypto.randomUUID());
  const taskId = routeParams.taskId ?? fallbackRef.current;

  return {
    virtualMcpId,
    virtualMcpOverride: search.virtualMcpOverride,
    taskId,
    navigateToTask,
    setVirtualMcpOverride,
  };
}
